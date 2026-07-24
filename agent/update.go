package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	githubOwner = "rayenking"
	githubRepo  = "nabooth-print-agent"
	updateCache = time.Hour
)

// UpdateInfo is returned by GET /api/update.
type UpdateInfo struct {
	Current         string `json:"current"`
	Latest          string `json:"latest"`
	UpdateAvailable bool   `json:"updateAvailable"`
	AssetName       string `json:"assetName,omitempty"`
	ReleaseURL      string `json:"releaseUrl,omitempty"`
	Error           string `json:"error,omitempty"`
}

type ghRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

type updateCacheEntry struct {
	at   time.Time
	info UpdateInfo
}

var (
	updateMu       sync.Mutex
	updateCacheMem updateCacheEntry
)

func assetNameForRuntime() string {
	name := fmt.Sprintf("nabooth-print-agent-%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

// normalizeVersion strips a leading "v" and trims space.
func normalizeVersion(v string) string {
	v = strings.TrimSpace(v)
	return strings.TrimPrefix(v, "v")
}

// parseSemver returns major, minor, patch when v looks like X.Y.Z (optional pre-release suffix ignored for compare).
// Returns ok=false for "dev" and other non-semver strings.
func parseSemver(v string) (major, minor, patch int, ok bool) {
	v = normalizeVersion(v)
	if v == "" || strings.EqualFold(v, "dev") {
		return 0, 0, 0, false
	}
	// drop build metadata / pre-release for numeric compare of core triple
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) < 2 {
		return 0, 0, 0, false
	}
	nums := make([]int, 3)
	for i := 0; i < 3 && i < len(parts); i++ {
		n, err := strconv.Atoi(parts[i])
		if err != nil {
			return 0, 0, 0, false
		}
		nums[i] = n
	}
	return nums[0], nums[1], nums[2], true
}

// isNewer reports whether latest is newer than current.
// "dev" (or unparseable current) is treated as always outdated when latest is parseable.
func isNewer(current, latest string) bool {
	lm, ln, lp, lok := parseSemver(latest)
	if !lok {
		return false
	}
	cm, cn, cp, cok := parseSemver(current)
	if !cok {
		return true
	}
	if lm != cm {
		return lm > cm
	}
	if ln != cn {
		return ln > cn
	}
	return lp > cp
}

func allowedDownloadURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Host)
	if host != "github.com" && host != "objects.githubusercontent.com" && !strings.HasSuffix(host, ".githubusercontent.com") {
		return false
	}
	// Prefer path under our repo releases when host is github.com
	if host == "github.com" {
		prefix := fmt.Sprintf("/%s/%s/releases/", githubOwner, githubRepo)
		if !strings.HasPrefix(u.Path, prefix) {
			return false
		}
	}
	return true
}

func fetchLatestRelease(force bool) UpdateInfo {
	updateMu.Lock()
	defer updateMu.Unlock()

	current := version
	asset := assetNameForRuntime()
	if !force && time.Since(updateCacheMem.at) < updateCache && updateCacheMem.info.Current != "" {
		info := updateCacheMem.info
		info.Current = current
		info.UpdateAvailable = isNewer(current, info.Latest)
		info.AssetName = asset
		return info
	}

	info := UpdateInfo{
		Current:   current,
		AssetName: asset,
	}

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		info.Error = err.Error()
		return info
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "nabooth-print-agent/"+current)

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		info.Error = err.Error()
		return info
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		info.Error = err.Error()
		return info
	}
	if res.StatusCode != http.StatusOK {
		info.Error = fmt.Sprintf("GitHub API HTTP %d", res.StatusCode)
		return info
	}

	var rel ghRelease
	if err := json.Unmarshal(body, &rel); err != nil {
		info.Error = "invalid GitHub release JSON"
		return info
	}
	info.Latest = normalizeVersion(rel.TagName)
	info.ReleaseURL = rel.HTMLURL
	info.UpdateAvailable = isNewer(current, info.Latest)

	// Prefer exact asset match for download URL validation later
	for _, a := range rel.Assets {
		if a.Name == asset {
			info.AssetName = a.Name
			break
		}
	}

	updateCacheMem = updateCacheEntry{at: time.Now(), info: info}
	return info
}

func downloadURLForAsset(asset string) (tag string, downloadURL string, releaseURL string, err error) {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "nabooth-print-agent/"+version)

	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", "", "", err
	}
	if res.StatusCode != http.StatusOK {
		return "", "", "", fmt.Errorf("GitHub API HTTP %d", res.StatusCode)
	}
	var rel ghRelease
	if err := json.Unmarshal(body, &rel); err != nil {
		return "", "", "", fmt.Errorf("invalid GitHub release JSON")
	}
	tag = rel.TagName
	releaseURL = rel.HTMLURL
	for _, a := range rel.Assets {
		if a.Name == asset {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" && tag != "" {
		downloadURL = fmt.Sprintf("https://github.com/%s/%s/releases/download/%s/%s", githubOwner, githubRepo, tag, asset)
	}
	if downloadURL == "" {
		return tag, "", releaseURL, fmt.Errorf("no asset %s in latest release", asset)
	}
	if !allowedDownloadURL(downloadURL) {
		return tag, "", releaseURL, fmt.Errorf("refusing download URL outside GitHub releases")
	}
	return tag, downloadURL, releaseURL, nil
}

func currentExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

func downloadToFile(urlStr, dest string) error {
	if !allowedDownloadURL(urlStr) {
		return fmt.Errorf("refusing download URL outside GitHub releases")
	}
	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "nabooth-print-agent/"+version)
	client := &http.Client{Timeout: 3 * time.Minute}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download HTTP %d", res.StatusCode)
	}
	// Final redirect URL must still be allowed
	if res.Request != nil && res.Request.URL != nil && !allowedDownloadURL(res.Request.URL.String()) {
		return fmt.Errorf("refusing redirected download URL")
	}

	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := io.Copy(f, io.LimitReader(res.Body, 200<<20)); err != nil {
		return err
	}
	return f.Close()
}

// applyUpdate downloads the matching release asset and restarts into the new binary.
func applyUpdate(logFn func(string)) error {
	asset := assetNameForRuntime()
	if logFn != nil {
		logFn("Checking latest release…")
	}
	tag, dl, _, err := downloadURLForAsset(asset)
	if err != nil {
		return err
	}
	if logFn != nil {
		logFn(fmt.Sprintf("Downloading %s (%s)…", asset, tag))
	}

	exe, err := currentExecutable()
	if err != nil {
		return err
	}
	dir := filepath.Dir(exe)
	tmp := filepath.Join(dir, asset+".download")
	newPath := exe + ".new"
	_ = os.Remove(tmp)
	_ = os.Remove(newPath)

	if err := downloadToFile(dl, tmp); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, newPath); err != nil {
		// cross-device fallback
		if err2 := copyFile(tmp, newPath, 0o755); err2 != nil {
			_ = os.Remove(tmp)
			return err
		}
		_ = os.Remove(tmp)
	}

	if runtime.GOOS == "windows" {
		return applyUpdateWindows(exe, newPath, logFn)
	}
	return applyUpdateUnix(exe, newPath, logFn)
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func restartArgs() []string {
	// Preserve user args (skip argv0).
	if len(os.Args) > 1 {
		return append([]string{}, os.Args[1:]...)
	}
	return []string{"-open=false"}
}

func applyUpdateUnix(exe, newPath string, logFn func(string)) error {
	// Move running binary aside, put new in place, start new, exit.
	bak := exe + ".bak"
	_ = os.Remove(bak)
	if err := os.Rename(exe, bak); err != nil {
		// Some systems allow overwrite via rename of new over exe while running
		if err2 := os.Rename(newPath, exe); err2 != nil {
			return fmt.Errorf("replace binary: %v (also: %v)", err2, err)
		}
	} else {
		if err := os.Rename(newPath, exe); err != nil {
			_ = os.Rename(bak, exe) // rollback
			return fmt.Errorf("install new binary: %w", err)
		}
	}
	_ = os.Chmod(exe, 0o755)

	if logFn != nil {
		logFn("Starting new version…")
	}
	cmd := exec.Command(exe, restartArgs()...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		// try restore bak
		if _, statErr := os.Stat(bak); statErr == nil {
			_ = os.Rename(bak, exe)
		}
		return fmt.Errorf("start new process: %w", err)
	}
	// Best-effort cleanup of backup after a short delay in the child is hard;
	// leave .bak for next run. Exit old process.
	go func() {
		time.Sleep(300 * time.Millisecond)
		os.Exit(0)
	}()
	return nil
}

func applyUpdateWindows(exe, newPath string, logFn func(string)) error {
	// Write a tiny batch that waits, replaces, starts new, deletes itself.
	bat := filepath.Join(filepath.Dir(exe), "nabooth-print-agent-update.bat")
	args := restartArgs()
	// Quote args for cmd
	quotedArgs := make([]string, 0, len(args))
	for _, a := range args {
		quotedArgs = append(quotedArgs, `"`+strings.ReplaceAll(a, `"`, `""`)+`"`)
	}
	script := fmt.Sprintf(`@echo off
ping -n 2 127.0.0.1 >nul
move /Y "%s" "%s.bak" >nul 2>&1
move /Y "%s" "%s"
if errorlevel 1 (
  copy /Y "%s" "%s" >nul
)
start "" "%s" %s
del "%%~f0"
`, exe, exe, newPath, exe, newPath, exe, exe, strings.Join(quotedArgs, " "))

	if err := os.WriteFile(bat, []byte(script), 0o755); err != nil {
		return err
	}
	if logFn != nil {
		logFn("Scheduling Windows replace + restart…")
	}
	cmd := exec.Command("cmd", "/C", "start", "", bat)
	cmd.Dir = filepath.Dir(exe)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start updater: %w", err)
	}
	go func() {
		time.Sleep(400 * time.Millisecond)
		os.Exit(0)
	}()
	return nil
}
