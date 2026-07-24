package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// PrintFileWithDialog opens the OS print dialog for path.
// printer is a preferred default when the OS supports it.
func PrintFileWithDialog(path, printer string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("print file missing")
	}
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		return fmt.Errorf("print file missing")
	}
	switch runtime.GOOS {
	case "windows":
		return printWindowsDialog(path, printer)
	case "darwin":
		return printMacDialog(path)
	default:
		return printLinuxDialog(path)
	}
}

func printWindowsDialog(path, printer string) error {
	pathEsc := strings.ReplaceAll(path, "'", "''")
	printerEsc := strings.ReplaceAll(printer, "'", "''")
	script := fmt.Sprintf(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$path = '%s'
$printerName = '%s'
$img = [System.Drawing.Image]::FromFile($path)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = 'Nabooth Strip'
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  if ($printerName -ne '') {
    try { $doc.PrinterSettings.PrinterName = $printerName } catch {}
  }
  $script:imgRef = $img
  $doc.add_PrintPage({
    param($sender, $e)
    $bounds = $e.MarginBounds
    if ($bounds.Width -lt 10 -or $bounds.Height -lt 10) { $bounds = $e.PageBounds }
    $iw = $script:imgRef.Width
    $ih = $script:imgRef.Height
    $scale = [Math]::Min($bounds.Width / $iw, $bounds.Height / $ih)
    $w = [int]($iw * $scale)
    $h = [int]($ih * $scale)
    $x = $bounds.X + [int](($bounds.Width - $w) / 2)
    $y = $bounds.Y + [int](($bounds.Height - $h) / 2)
    $e.Graphics.DrawImage($script:imgRef, $x, $y, $w, $h)
    $e.HasMorePages = $false
  })
  $dlg = New-Object System.Windows.Forms.PrintDialog
  $dlg.Document = $doc
  $dlg.UseEXDialog = $true
  $dlg.AllowSomePages = $false
  $dlg.ShowNetwork = $true
  $result = $dlg.ShowDialog()
  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    $doc.PrinterSettings = $dlg.PrinterSettings
    $doc.Print()
  } else {
    throw 'Print cancelled'
  }
  $doc.Dispose()
} finally {
  $img.Dispose()
}
`, pathEsc, printerEsc)
	out, err := exec.Command("powershell", "-NoProfile", "-STA", "-Command", script).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if strings.Contains(strings.ToLower(msg), "cancel") {
			return fmt.Errorf("print cancelled")
		}
		if msg == "" {
			return fmt.Errorf("windows print dialog failed: %v", err)
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

func printMacDialog(path string) error {
	pathEsc := strings.ReplaceAll(path, `\`, `\\`)
	pathEsc = strings.ReplaceAll(pathEsc, `"`, `\"`)
	pathEsc = strings.ReplaceAll(pathEsc, "\n", "")
	script := fmt.Sprintf(`set theFile to POSIX file "%s" as alias
tell application "Preview"
  activate
  open theFile
  delay 0.6
  print front document print dialog true
end tell`, pathEsc)
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err == nil {
		return nil
	}
	script2 := fmt.Sprintf(`set theFile to POSIX file "%s" as alias
tell application "Finder"
  activate
  print theFile print dialog true
end tell`, pathEsc)
	out2, err2 := exec.Command("osascript", "-e", script2).CombinedOutput()
	if err2 == nil {
		return nil
	}
	_ = exec.Command("open", "-a", "Preview", path).Run()
	msg := strings.TrimSpace(string(out2))
	if msg == "" {
		msg = strings.TrimSpace(string(out))
	}
	if msg == "" {
		return fmt.Errorf("opened in Preview — press ⌘P to print")
	}
	return fmt.Errorf("%s — opened Preview, press ⌘P", msg)
}

func printLinuxDialog(path string) error {
	if err := exec.Command("gtklp", path).Run(); err == nil {
		return nil
	}
	_ = exec.Command("xdg-open", path).Run()
	return fmt.Errorf("opened image — use the app Print dialog (install gtklp for a print UI)")
}
