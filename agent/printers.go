package main

import (
	"os/exec"
	"runtime"
	"strings"
)

// PrinterInfo is a local OS printer entry for the UI.
type PrinterInfo struct {
	Name string `json:"name"`
}

func ListPrinters() ([]PrinterInfo, error) {
	names, err := listPrinterNames()
	if err != nil {
		return nil, err
	}
	list := make([]PrinterInfo, 0, len(names))
	for _, name := range names {
		list = append(list, PrinterInfo{Name: name})
	}
	return list, nil
}

func listPrinterNames() ([]string, error) {
	if runtime.GOOS == "windows" {
		out, err := exec.Command("powershell", "-NoProfile", "-Command",
			"Get-Printer | Select-Object -ExpandProperty Name").CombinedOutput()
		if err != nil {
			return nil, err
		}
		var list []string
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				list = append(list, line)
			}
		}
		return list, nil
	}
	out, err := exec.Command("lpstat", "-a").CombinedOutput()
	if err != nil {
		return nil, err
	}
	var list []string
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) > 0 {
			list = append(list, fields[0])
		}
	}
	return list, nil
}
