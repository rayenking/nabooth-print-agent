package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
	DownloadURL     string `json:"downloadUrl,omitempty"`
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

	var dl string
	for _, a := range rel.Assets {
		if a.Name == asset {
			info.AssetName = a.Name
			dl = a.BrowserDownloadURL
			break
		}
	}
	if dl == "" && rel.TagName != "" {
		dl = fmt.Sprintf(
			"https://github.com/%s/%s/releases/download/%s/%s",
			githubOwner, githubRepo, rel.TagName, asset,
		)
	}
	if dl != "" && allowedDownloadURL(dl) {
		info.DownloadURL = dl
	}

	updateCacheMem = updateCacheEntry{at: time.Now(), info: info}
	return info
}

func currentExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}
