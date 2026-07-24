package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// AutostartStatus is returned by GET /api/autostart.
type AutostartStatus struct {
	Enabled   bool   `json:"enabled"`
	Supported bool   `json:"supported"`
	Method    string `json:"method"` // launchagent | startup | xdg | none
	Path      string `json:"path,omitempty"`
	Detail    string `json:"detail,omitempty"`
}

const (
	launchAgentLabel = "com.nabooth.print-agent"
	launchAgentFile  = "com.nabooth.print-agent.plist"
	startupLnkName   = "Nabooth Print Agent.lnk"
	xdgDesktopName   = "nabooth-print-agent.desktop"
)

func autostartStatus() AutostartStatus {
	switch runtime.GOOS {
	case "darwin":
		return autostartStatusDarwin()
	case "windows":
		return autostartStatusWindows()
	case "linux":
		return autostartStatusLinux()
	default:
		return AutostartStatus{
			Supported: false,
			Method:    "none",
			Detail:    "Autostart is not supported on this OS",
		}
	}
}

func installAutostart() (AutostartStatus, error) {
	switch runtime.GOOS {
	case "darwin":
		if err := installAutostartDarwin(); err != nil {
			return autostartStatusDarwin(), err
		}
		return autostartStatusDarwin(), nil
	case "windows":
		if err := installAutostartWindows(); err != nil {
			return autostartStatusWindows(), err
		}
		return autostartStatusWindows(), nil
	case "linux":
		if err := installAutostartLinux(); err != nil {
			return autostartStatusLinux(), err
		}
		return autostartStatusLinux(), nil
	default:
		return autostartStatus(), fmt.Errorf("autostart not supported on %s", runtime.GOOS)
	}
}

func removeAutostart() (AutostartStatus, error) {
	switch runtime.GOOS {
	case "darwin":
		if err := removeAutostartDarwin(); err != nil {
			return autostartStatusDarwin(), err
		}
		return autostartStatusDarwin(), nil
	case "windows":
		if err := removeAutostartWindows(); err != nil {
			return autostartStatusWindows(), err
		}
		return autostartStatusWindows(), nil
	case "linux":
		if err := removeAutostartLinux(); err != nil {
			return autostartStatusLinux(), err
		}
		return autostartStatusLinux(), nil
	default:
		return autostartStatus(), fmt.Errorf("autostart not supported on %s", runtime.GOOS)
	}
}

func currentExePath() (string, error) {
	return currentExecutable()
}

func pathsMatch(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	// Resolve symlinks best-effort
	if ra, err := filepath.EvalSymlinks(a); err == nil {
		a = ra
	}
	if rb, err := filepath.EvalSymlinks(b); err == nil {
		b = rb
	}
	return a == b
}

// --- macOS LaunchAgent ---

func launchAgentPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents", launchAgentFile), nil
}

func autostartStatusDarwin() AutostartStatus {
	st := AutostartStatus{Supported: true, Method: "launchagent"}
	plist, err := launchAgentPath()
	if err != nil {
		st.Detail = err.Error()
		return st
	}
	st.Path = plist
	data, err := os.ReadFile(plist)
	if err != nil {
		st.Enabled = false
		st.Detail = "Not installed"
		return st
	}
	exe, _ := currentExePath()
	// Simple check: file exists and contains current exe path when known
	if exe != "" && strings.Contains(string(data), exe) {
		st.Enabled = true
		st.Detail = "LaunchAgent installed for this binary"
		return st
	}
	if exe != "" {
		// Still enabled if plist exists but points elsewhere
		st.Enabled = true
		st.Detail = "LaunchAgent present (path may differ from this binary)"
		return st
	}
	st.Enabled = true
	st.Detail = "LaunchAgent present"
	return st
}

func installAutostartDarwin() error {
	exe, err := currentExePath()
	if err != nil {
		return err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	laDir := filepath.Join(home, "Library", "LaunchAgents")
	if err := os.MkdirAll(laDir, 0o755); err != nil {
		return err
	}
	logDir := filepath.Join(home, "Library", "Logs")
	_ = os.MkdirAll(logDir, 0o755)

	plistPath := filepath.Join(laDir, launchAgentFile)
	// Escape XML special chars in paths
	xmlEsc := func(s string) string {
		s = strings.ReplaceAll(s, "&", "&amp;")
		s = strings.ReplaceAll(s, "<", "&lt;")
		s = strings.ReplaceAll(s, ">", "&gt;")
		s = strings.ReplaceAll(s, `"`, "&quot;")
		return s
	}
	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
    <string>-open=false</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>%s</string>
  <key>StandardErrorPath</key>
  <string>%s</string>
</dict>
</plist>
`, launchAgentLabel, xmlEsc(exe),
		xmlEsc(filepath.Join(logDir, "nabooth-print-agent.log")),
		xmlEsc(filepath.Join(logDir, "nabooth-print-agent.err.log")))

	if err := os.WriteFile(plistPath, []byte(body), 0o644); err != nil {
		return err
	}
	// Reload best-effort (macOS versions differ: bootout/bootstrap vs unload/load)
	_ = exec.Command("launchctl", "bootout", "gui/"+uidString(), plistPath).Run()
	_ = exec.Command("launchctl", "unload", plistPath).Run()
	if err := exec.Command("launchctl", "bootstrap", "gui/"+uidString(), plistPath).Run(); err != nil {
		_ = exec.Command("launchctl", "load", plistPath).Run()
	}
	return nil
}

func removeAutostartDarwin() error {
	plistPath, err := launchAgentPath()
	if err != nil {
		return err
	}
	_ = exec.Command("launchctl", "bootout", "gui/"+uidString(), plistPath).Run()
	_ = exec.Command("launchctl", "unload", plistPath).Run()
	if err := os.Remove(plistPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func uidString() string {
	return fmt.Sprintf("%d", os.Getuid())
}

// --- Windows Startup shortcut ---

func startupShortcutPath() (string, error) {
	// %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	return filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", startupLnkName), nil
}

func autostartStatusWindows() AutostartStatus {
	st := AutostartStatus{Supported: true, Method: "startup"}
	lnk, err := startupShortcutPath()
	if err != nil {
		st.Detail = err.Error()
		return st
	}
	st.Path = lnk
	if _, err := os.Stat(lnk); err != nil {
		st.Enabled = false
		st.Detail = "Not installed"
		return st
	}
	st.Enabled = true
	st.Detail = "Startup shortcut present"
	return st
}

func installAutostartWindows() error {
	exe, err := currentExePath()
	if err != nil {
		return err
	}
	lnk, err := startupShortcutPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(lnk), 0o755); err != nil {
		return err
	}
	// Create .lnk via PowerShell (no extra deps)
	ps := fmt.Sprintf(
		`$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%s'); $s.TargetPath = '%s'; $s.Arguments = '-open=false'; $s.WorkingDirectory = '%s'; $s.Save()`,
		escapePS(lnk), escapePS(exe), escapePS(filepath.Dir(exe)),
	)
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", ps)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("create shortcut: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func removeAutostartWindows() error {
	lnk, err := startupShortcutPath()
	if err != nil {
		return err
	}
	if err := os.Remove(lnk); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func escapePS(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// --- Linux XDG autostart ---

func xdgAutostartPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "autostart", xdgDesktopName), nil
}

func autostartStatusLinux() AutostartStatus {
	st := AutostartStatus{Supported: true, Method: "xdg"}
	p, err := xdgAutostartPath()
	if err != nil {
		st.Supported = false
		st.Method = "none"
		st.Detail = err.Error()
		return st
	}
	st.Path = p
	data, err := os.ReadFile(p)
	if err != nil {
		st.Enabled = false
		st.Detail = "Not installed (optional: systemd user unit / re-run install.sh)"
		return st
	}
	exe, _ := currentExePath()
	st.Enabled = true
	if exe != "" && strings.Contains(string(data), exe) {
		st.Detail = "XDG autostart installed for this binary"
	} else {
		st.Detail = "XDG autostart present"
	}
	return st
}

func installAutostartLinux() error {
	exe, err := currentExePath()
	if err != nil {
		return err
	}
	p, err := xdgAutostartPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	body := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Nabooth Print Agent
Comment=Local print agent for Nabooth booths
Exec="%s" -open=false
X-GNOME-Autostart-enabled=true
Terminal=false
`, exe)
	return os.WriteFile(p, []byte(body), 0o644)
}

func removeAutostartLinux() error {
	p, err := xdgAutostartPath()
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
