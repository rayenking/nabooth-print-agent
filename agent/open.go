package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// OpenURL opens a URL in the default browser.
func OpenURL(url string) error {
	url = strings.TrimSpace(url)
	if url == "" {
		return fmt.Errorf("empty url")
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("cmd", "/C", "start", "", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

// OpenFile opens a local file in the OS default viewer.
func OpenFile(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("file missing")
	}
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		return fmt.Errorf("file missing")
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-a", "Preview", path).Start()
	case "windows":
		return exec.Command("cmd", "/C", "start", "", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}
