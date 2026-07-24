package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// UninstallInfo is returned by GET /api/uninstall.
type UninstallInfo struct {
	BinaryPath       string `json:"binaryPath,omitempty"`
	ConfigDir        string `json:"configDir,omitempty"`
	AutostartEnabled bool   `json:"autostartEnabled"`
	Supported        bool   `json:"supported"`
	Detail           string `json:"detail,omitempty"`
}

// UninstallResult is returned by POST /api/uninstall.
type UninstallResult struct {
	OK               bool   `json:"ok"`
	RemovedAutostart bool   `json:"removedAutostart"`
	RemovedConfig    bool   `json:"removedConfig"`
	BinaryPath       string `json:"binaryPath,omitempty"`
	Detail           string `json:"detail,omitempty"`
	Error            string `json:"error,omitempty"`
}

func uninstallInfo() UninstallInfo {
	info := UninstallInfo{Supported: true}
	if exe, err := currentExecutable(); err == nil {
		info.BinaryPath = exe
	}
	if dir, err := configDir(); err == nil {
		info.ConfigDir = dir
	}
	st := autostartStatus()
	info.AutostartEnabled = st.Enabled
	if !st.Supported {
		info.Detail = "Autostart not supported on this OS; config + process stop still work"
	}
	return info
}

func runUninstall() UninstallResult {
	res := UninstallResult{OK: true}
	var notes []string

	if exe, err := currentExecutable(); err == nil {
		res.BinaryPath = exe
	}

	// 1) remove autostart best-effort
	if st, err := removeAutostart(); err != nil {
		notes = append(notes, "autostart: "+err.Error())
	} else {
		res.RemovedAutostart = !st.Enabled
		if st.Enabled {
			notes = append(notes, "autostart still present")
		} else {
			notes = append(notes, "autostart removed")
		}
	}

	// 2) delete config dir (includes jobs) best-effort
	if dir, err := configDir(); err != nil {
		notes = append(notes, "config: "+err.Error())
	} else if err := os.RemoveAll(dir); err != nil {
		notes = append(notes, "config remove: "+err.Error())
	} else {
		res.RemovedConfig = true
		notes = append(notes, "config removed")
	}

	// 3) schedule binary delete after exit (best-effort)
	if res.BinaryPath != "" {
		if err := scheduleBinaryDelete(res.BinaryPath); err != nil {
			notes = append(notes, "binary delete skipped: "+err.Error()+"; remove manually: "+res.BinaryPath)
		} else {
			notes = append(notes, "binary delete scheduled")
		}
	}

	// 4) exit after response is written by caller
	res.Detail = joinNotes(notes)
	return res
}

func joinNotes(notes []string) string {
	if len(notes) == 0 {
		return ""
	}
	out := notes[0]
	for i := 1; i < len(notes); i++ {
		out += "; " + notes[i]
	}
	return out
}

func scheduleExit() {
	go func() {
		time.Sleep(400 * time.Millisecond)
		os.Exit(0)
	}()
}

func scheduleBinaryDelete(exe string) error {
	if exe == "" {
		return fmt.Errorf("empty path")
	}
	// Refuse to schedule delete of obvious system paths
	clean := filepath.Clean(exe)
	if clean == "/" || clean == "." || clean == "" {
		return fmt.Errorf("refusing unsafe path")
	}

	switch runtime.GOOS {
	case "windows":
		// Delayed bat: wait, delete exe, delete self
		bat := filepath.Join(os.TempDir(), "nabooth-print-agent-uninstall.bat")
		script := fmt.Sprintf("@echo off\r\nping -n 3 127.0.0.1 >nul\r\ndel /F /Q \"%s\" >nul 2>&1\r\ndel \"%%~f0\"\r\n", exe)
		if err := os.WriteFile(bat, []byte(script), 0o755); err != nil {
			return err
		}
		cmd := exec.Command("cmd", "/C", "start", "", bat)
		return cmd.Start()
	default:
		// sh: sleep then rm; runs detached
		cmd := exec.Command("sh", "-c", fmt.Sprintf("sleep 1; rm -f %q", exe))
		cmd.Stdout = nil
		cmd.Stderr = nil
		return cmd.Start()
	}
}
