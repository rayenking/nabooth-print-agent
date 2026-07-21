use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::process::Command;
use std::time::Duration;

#[derive(Serialize)]
struct PrinterInfo {
    name: String,
}

#[derive(Serialize, Deserialize)]
struct LoginOk {
    token: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    #[serde(rename = "wsPath")]
    ws_path: Option<String>,
}

#[tauri::command]
fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let list = text
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .map(|name| PrinterInfo { name })
            .collect();
        return Ok(list);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("lpstat")
            .arg("-a")
            .output()
            .map_err(|e| format!("lpstat failed (install CUPS?): {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let list = text
            .lines()
            .filter_map(|line| {
                let name = line.split_whitespace().next()?;
                Some(PrinterInfo {
                    name: name.to_string(),
                })
            })
            .collect();
        Ok(list)
    }
}

#[tauri::command]
fn open_printer_settings(printer: String) -> Result<(), String> {
    let name = printer.trim().to_string();

    #[cfg(target_os = "windows")]
    {
        let printer_esc = name.replace('\'', "''");
        let script = format!(
            r#"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = 'Nabooth Print Settings'
$p = '{printer_esc}'
if ($p -ne '') {{
  try {{ $doc.PrinterSettings.PrinterName = $p }} catch {{}}
}}
$dlg = New-Object System.Windows.Forms.PrintDialog
$dlg.Document = $doc
$dlg.UseEXDialog = $true
$dlg.AllowCurrentPage = $false
$dlg.AllowSomePages = $false
$dlg.AllowSelection = $false
$dlg.ShowNetwork = $true
$dlg.PrinterSettings = $doc.PrinterSettings
[void]$dlg.ShowDialog()
"#
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", &script])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Could not open Windows Print dialog".into());
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        if name.is_empty() {
            let _ = Command::new("open")
                .arg("x-apple.systempreferences:com.apple.Print-Scan-Settings.extension")
                .status();
            return Ok(());
        }
        let cups = format!(
            "http://localhost:631/printers/{}",
            urlencoding_path(&name)
        );
        let _ = Command::new("open").arg(&cups).status();
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Print-Scan-Settings.extension")
            .status();
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if name.is_empty() {
            let _ = Command::new("xdg-open")
                .arg("http://localhost:631/printers/")
                .status();
            return Ok(());
        }
        let cups = format!(
            "http://localhost:631/printers/{}",
            urlencoding_path(&name)
        );
        if Command::new("system-config-printer")
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        for opener in ["xdg-open", "gio"] {
            let status = if opener == "gio" {
                Command::new("gio").args(["open", &cups]).status()
            } else {
                Command::new(opener).arg(&cups).status()
            };
            if status.map(|s| s.success()).unwrap_or(false) {
                return Ok(());
            }
        }
        return Err(format!(
            "Open CUPS in a browser: {cups} (or install system-config-printer)"
        ));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        let _ = name;
        Err("open_printer_settings not supported on this OS".into())
    }
}

#[tauri::command]
fn print_file_with_dialog(path: String, printer: Option<String>) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() || !std::path::Path::new(&path).is_file() {
        return Err("Print file missing".into());
    }

    #[cfg(target_os = "windows")]
    {
        let printer = printer.unwrap_or_default();
        let path_esc = path.replace('\'', "''");
        let printer_esc = printer.replace('\'', "''");
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$path = '{path_esc}'
$printerName = '{printer_esc}'
$img = [System.Drawing.Image]::FromFile($path)
try {{
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = 'Nabooth Strip'
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  if ($printerName -ne '') {{
    try {{ $doc.PrinterSettings.PrinterName = $printerName }} catch {{}}
  }}
  $script:imgRef = $img
  $doc.add_PrintPage({{
    param($sender, $e)
    $bounds = $e.MarginBounds
    if ($bounds.Width -lt 10 -or $bounds.Height -lt 10) {{ $bounds = $e.PageBounds }}
    $iw = $script:imgRef.Width
    $ih = $script:imgRef.Height
    $scale = [Math]::Min($bounds.Width / $iw, $bounds.Height / $ih)
    $w = [int]($iw * $scale)
    $h = [int]($ih * $scale)
    $x = $bounds.X + [int](($bounds.Width - $w) / 2)
    $y = $bounds.Y + [int](($bounds.Height - $h) / 2)
    $e.Graphics.DrawImage($script:imgRef, $x, $y, $w, $h)
    $e.HasMorePages = $false
  }})
  $dlg = New-Object System.Windows.Forms.PrintDialog
  $dlg.Document = $doc
  $dlg.UseEXDialog = $true
  $dlg.AllowSomePages = $false
  $dlg.ShowNetwork = $true
  $result = $dlg.ShowDialog()
  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    $doc.PrinterSettings = $dlg.PrinterSettings
    $doc.Print()
  }} else {{
    throw 'Print cancelled'
  }}
  $doc.Dispose()
}} finally {{
  $img.Dispose()
}}
"#
        );
        let out = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let msg = err.trim();
            if msg.to_lowercase().contains("cancel") {
                return Err("Print cancelled".into());
            }
            return Err(if msg.is_empty() {
                "Windows print dialog failed".into()
            } else {
                msg.to_string()
            });
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = printer;
        let path_esc = path
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "");
        let script = format!(
            r#"set theFile to POSIX file "{path_esc}" as alias
tell application "Preview"
  activate
  open theFile
  delay 0.6
  print front document print dialog true
end tell"#
        );
        let out = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        let script2 = format!(
            r#"set theFile to POSIX file "{path_esc}" as alias
tell application "Finder"
  activate
  print theFile print dialog true
end tell"#
        );
        let out2 = Command::new("osascript")
            .args(["-e", &script2])
            .output()
            .map_err(|e| e.to_string())?;
        if out2.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out2.stderr);
        let _ = Command::new("open").args(["-a", "Preview", &path]).status();
        return Err(if err.trim().is_empty() {
            "Opened in Preview — press ⌘P to print".into()
        } else {
            format!("{} — opened Preview, press ⌘P", err.trim())
        });
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if Command::new("gtklp")
            .arg(&path)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        let _ = printer;
        let _ = Command::new("xdg-open").arg(&path).status();
        Err("Opened image — use the app Print dialog (install gtklp for a print UI)".into())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        let _ = (path, printer);
        Err("unsupported".into())
    }
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() || !std::path::Path::new(path).is_file() {
        return Err("File missing".into());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Preview", path])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", path])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        Err("unsupported".into())
    }
}

#[tauri::command]
fn save_print_file(data: Vec<u8>) -> Result<String, String> {
    if data.is_empty() {
        return Err("empty image".into());
    }
    let dir = std::env::temp_dir().join("nabooth-print-jobs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!(
        "strip-{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let path = dir.join(name);
    fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_printer_queue(printer: String) -> Result<(), String> {
    let name = printer.trim();
    if name.is_empty() {
        return Err("Select a printer first".into());
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("rundll32")
            .args(["printui.dll,PrintUIEntry", "/o", "/n", name])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Could not open printer queue".into());
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Print-Scan-Settings.extension")
            .status();
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = name;
        let _ = Command::new("xdg-open")
            .arg("http://localhost:631/jobs/")
            .status();
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        let _ = name;
        Err("unsupported".into())
    }
}

#[cfg(not(target_os = "windows"))]
fn urlencoding_path(name: &str) -> String {
    name.replace(' ', "%20")
}

fn ensure_printer_ready(printer: Option<&str>) -> Result<(), String> {
    let name = printer.map(str::trim).filter(|s| !s.is_empty());
    #[cfg(target_os = "windows")]
    {
        let Some(name) = name else {
            return Err("No printer selected".into());
        };
        let printer_esc = name.replace('\'', "''");
        let script = format!(
            r#"
$p = Get-Printer -Name '{printer_esc}' -ErrorAction SilentlyContinue
if ($null -eq $p) {{ Write-Output 'ERR|Printer not found'; exit 1 }}
if ($p.WorkOffline) {{ Write-Output 'ERR|Printer is offline (Work Offline)'; exit 1 }}
# PrinterStatus: 0 Normal, 1 Other, 2 Unknown, 3 Idle, 4 Printing, 5 Warmup, 6 Stopped, 7 Offline, …
$st = [int]$p.PrinterStatus
if ($st -eq 7 -or $st -eq 1) {{ Write-Output ("ERR|Printer status not ready: " + $p.PrinterStatus); exit 1 }}
if ($p.PrinterStatus -match 'Offline|Error|No Toner|Door Open|Paper Jam|Out of Paper|Not Available') {{
  Write-Output ("ERR|Printer not ready: " + $p.PrinterStatus); exit 1
}}
Write-Output ("OK|" + $p.PrinterStatus)
"#
        );
        let out = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().last().unwrap_or("").trim();
        if line.starts_with("ERR|") {
            return Err(line.trim_start_matches("ERR|").to_string());
        }
        if !out.status.success() {
            return Err(if line.is_empty() {
                "Printer not ready".into()
            } else {
                line.to_string()
            });
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let Some(name) = name else {
            return Err("No printer selected".into());
        };
        let out = Command::new("lpstat")
            .args(["-p", name])
            .output()
            .map_err(|e| format!("lpstat failed: {e}"))?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        let lower = text.to_lowercase();
        if !out.status.success()
            || lower.contains("unknown printer")
            || lower.contains("non-existent")
        {
            return Err(format!("Printer not found: {name}"));
        }
        if lower.contains("disabled")
            || lower.contains("paused")
            || lower.contains("stopped")
            || lower.contains("offline")
            || lower.contains("not connected")
            || lower.contains("unable to locate")
        {
            let brief = text.lines().next().unwrap_or(text.trim()).trim();
            return Err(format!("Printer not ready: {brief}"));
        }
        let a = Command::new("lpstat")
            .args(["-a", name])
            .output()
            .map_err(|e| e.to_string())?;
        let atext = String::from_utf8_lossy(&a.stdout).to_lowercase();
        if atext.contains("not accepting") {
            return Err(format!("Printer not accepting jobs: {name}"));
        }
        Ok(())
    }
}

struct PrintOpts {
    paper_size: Option<String>,
    media_type: Option<String>,
    scale: Option<String>,
    orientation: Option<String>,
    quality: Option<String>,
    copies: i32,
}

fn paper_is_borderless(paper: &str) -> bool {
    paper.contains("borderless")
}

#[cfg(target_os = "windows")]
fn win_paper_hundredths(paper: &str) -> Option<(i32, i32, &'static str)> {
    match paper {
        "4x6" | "4x6-borderless" => Some((400, 600, "4x6")),
        "2x6" | "2x6-borderless" => Some((200, 600, "2x6")),
        "A4" => Some((827, 1169, "A4")),
        "A6" => Some((413, 583, "A6")),
        "letter" => Some((850, 1100, "Letter")),
        _ => None,
    }
}

#[cfg(not(target_os = "windows"))]
fn cups_page_sizes(printer: &str) -> Vec<String> {
    let out = Command::new("lpoptions")
        .args(["-p", printer, "-l"])
        .output();
    let Ok(out) = out else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if !line.starts_with("PageSize/") && !line.starts_with("media/") {
            continue;
        }
        let Some(rest) = line.split_once(':').map(|(_, r)| r.trim()) else {
            continue;
        };
        return rest
            .split_whitespace()
            .map(|s| s.trim_start_matches('*').to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    Vec::new()
}

#[cfg(not(target_os = "windows"))]
fn cups_has_option(printer: &str, key: &str) -> bool {
    let out = Command::new("lpoptions")
        .args(["-p", printer, "-l"])
        .output();
    let Ok(out) = out else {
        return false;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .any(|l| l.starts_with(&format!("{key}/")) || l.starts_with(key))
}

#[cfg(not(target_os = "windows"))]
fn resolve_cups_page_size(printer: Option<&str>, paper: &str, borderless: bool) -> String {
    let sizes = printer
        .filter(|p| !p.is_empty())
        .map(cups_page_sizes)
        .unwrap_or_default();
    let lower: Vec<String> = sizes.iter().map(|s| s.to_lowercase()).collect();

    let pick = |candidates: &[&str]| -> Option<String> {
        for c in candidates {
            let cl = c.to_lowercase();
            if let Some(i) = lower.iter().position(|s| s == &cl) {
                return Some(sizes[i].clone());
            }
        }
        for c in candidates {
            let cl = c.to_lowercase();
            if let Some(i) = lower.iter().position(|s| s.contains(&cl)) {
                return Some(sizes[i].clone());
            }
        }
        None
    };

    match paper {
        "4x6-borderless" => {
            if let Some(s) = pick(&[
                "EPKG.NMgn",
                "EPKG.Borderless",
                "4x6.Borderless",
                "Photo4x6.Borderless",
                "w288h432.Borderless",
            ]) {
                return s;
            }
            if let Some(s) = pick(&["EPKG", "Photo4x6", "4x6", "w288h432", "Custom.4x6in"]) {
                return s;
            }
            "EPKG.NMgn".into()
        }
        "4x6" if borderless => {
            if let Some(s) = pick(&["EPKG.NMgn", "EPKG"]) {
                return s;
            }
            "EPKG.NMgn".into()
        }
        "4x6" => {
            if let Some(s) = pick(&["EPKG", "Photo4x6", "4x6", "w288h432", "Custom.4x6in"]) {
                return s;
            }
            "EPKG".into()
        }
        "2x6-borderless" => {
            if let Some(s) = pick(&[
                "EPPhotoPaperLRoll.NMgn",
                "2x6.Borderless",
                "Custom.2x6in.Borderless",
            ]) {
                return s;
            }
            if let Some(s) = pick(&["EPPhotoPaperLRoll", "2x6", "Custom.2x6in"]) {
                return s;
            }
            "EPPhotoPaperLRoll.NMgn".into()
        }
        "2x6" => {
            if let Some(s) = pick(&["EPPhotoPaperLRoll", "2x6", "Custom.2x6in"]) {
                return s;
            }
            "EPPhotoPaperLRoll".into()
        }
        "A6" => pick(&["A6"]).unwrap_or_else(|| "A6".into()),
        "letter" => pick(&["Letter", "letter"]).unwrap_or_else(|| "Letter".into()),
        "A4" => pick(&["A4"]).unwrap_or_else(|| "A4".into()),
        _ => pick(&["A4"]).unwrap_or_else(|| "A4".into()),
    }
}

#[cfg(not(target_os = "windows"))]
fn epson_media_code(media: &str) -> &'static str {
    match media {
        "plain" => "0",
        "photo_quality" | "photo-quality" | "pqij" => "2",
        "matte" => "12",
        "ultra_glossy" | "ultra-glossy" => "92",
        "premium_glossy" | "premium-glossy" | "glossy" => "13",
        "premium_semigloss" | "premium-semigloss" | "semigloss" => "15",
        "photo_glossy" | "photo-glossy" | "photo" => "145",
        "envelope" => "93",
        _ => "145",
    }
}

#[cfg(not(target_os = "windows"))]
fn epson_quality_code(quality: &str) -> &'static str {
    match quality {
        "draft" => "308",
        "normal" => "303",
        "quality" => "305",
        "high" | "high_quality" | "high-quality" => "306",
        "best" => "307",
        _ => "305",
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_epson_opts(
    cmd: &mut Command,
    printer: Option<&str>,
    paper: &str,
    borderless: bool,
    media: Option<&str>,
    quality: Option<&str>,
) {
    let p = printer.filter(|s| !s.is_empty());
    let has = |key: &str| p.map(|n| cups_has_option(n, key)).unwrap_or(false);

    if has("EPIJ_PSrc") {
        cmd.arg("-o").arg(if borderless {
            "EPIJ_PSrc=3"
        } else {
            "EPIJ_PSrc=2"
        });
    }
    if has("EPIJ_Size") {
        let size = match paper {
            "4x6" | "4x6-borderless" => "74",
            "A6" => "6",
            "letter" => "4",
            "A4" => "1",
            _ => "74",
        };
        cmd.arg("-o").arg(format!("EPIJ_Size={size}"));
    }
    if has("EPIJ_Bdls") {
        cmd.arg("-o")
            .arg(if borderless { "EPIJ_Bdls=1" } else { "EPIJ_Bdls=0" });
    }
    if has("EPIJ_exmg") && borderless {
        cmd.arg("-o").arg("EPIJ_exmg=2");
    }
    if has("EPIJ_RmMg") {
        cmd.arg("-o")
            .arg(if borderless { "EPIJ_RmMg=1" } else { "EPIJ_RmMg=0" });
    }

    let media = media.unwrap_or("matte");
    let mcode = epson_media_code(media);
    if has("EPIJ_Medi") {
        cmd.arg("-o").arg(format!("EPIJ_Medi={mcode}"));
    }
    if has("MediaType") {
        cmd.arg("-o").arg(format!("MediaType={mcode}"));
    }

    if has("EPIJ_Ink_") {
        cmd.arg("-o").arg("EPIJ_Ink_=1");
    }
    if has("EPIJ_Mode") {
        cmd.arg("-o").arg("EPIJ_Mode=3");
    }
    if has("EPIJ_APri") {
        cmd.arg("-o").arg("EPIJ_APri=0");
    }
    if has("EPIJ_CCor") {
        cmd.arg("-o").arg("EPIJ_CCor=12");
    }
    if has("EPIJ_ATon") {
        cmd.arg("-o").arg("EPIJ_ATon=7");
    }
    if has("EPIJ_Hori") {
        cmd.arg("-o").arg("EPIJ_Hori=0");
    }

    let q = quality.unwrap_or("high");
    let qcode = epson_quality_code(q);
    if has("EPIJ_Qual") {
        cmd.arg("-o").arg(format!("EPIJ_Qual={qcode}"));
    } else {
        let pq = match q {
            "draft" => "3",
            "high" | "best" => "5",
            _ => "4",
        };
        cmd.arg("-o").arg(format!("print-quality={pq}"));
    }

    if has("Resolution") {
        let dpi = match q {
            "draft" | "normal" => "360x360dpi",
            _ => "720x720dpi",
        };
        cmd.arg("-o").arg(format!("Resolution={dpi}"));
    }
}

fn print_path(path: &str, printer: Option<&str>, opts: &PrintOpts) -> Result<(), String> {
    ensure_printer_ready(printer)?;
    let copies = if opts.copies < 1 {
        1
    } else if opts.copies > 20 {
        20
    } else {
        opts.copies
    };
    let paper = opts
        .paper_size
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("4x6");
    let borderless = paper_is_borderless(paper);
    let scale = opts.scale.as_deref().unwrap_or(if borderless {
        "fill"
    } else {
        "fit"
    });

    #[cfg(target_os = "windows")]
    {
        let printer_arg = printer.unwrap_or("").replace('\'', "''");
        let path_esc = path.replace('\'', "''");
        let (pw, ph, pname) = win_paper_hundredths(paper).unwrap_or((400, 600, "4x6"));
        let landscape = matches!(
            opts.orientation.as_deref(),
            Some("landscape")
        );
        for _ in 0..copies {
            let ps = format!(
                r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$printerName = '{printer_arg}'
$path = '{path_esc}'
$p = Get-Printer -Name $printerName -ErrorAction Stop
if ($p.WorkOffline) {{ throw 'Printer is offline' }}
$img = [System.Drawing.Image]::FromFile($path)
try {{
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printerName
  $doc.DocumentName = 'Nabooth'
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $doc.DefaultPageSettings.Landscape = ${landscape}
  $custom = New-Object System.Drawing.Printing.PaperSize('{pname}', {pw}, {ph})
  $matched = $null
  foreach ($psize in $doc.PrinterSettings.PaperSizes) {{
    $n = $psize.PaperName.ToLowerInvariant()
    if ($n -match '4.?x.?6|6.?x.?4|photo|postcard|10.?x.?15') {{ $matched = $psize; break }}
  }}
  if ($null -ne $matched) {{
    $doc.DefaultPageSettings.PaperSize = $matched
  }} else {{
    try {{ $doc.DefaultPageSettings.PaperSize = $custom }} catch {{}}
  }}
  $script:imgRef = $img
  $doc.add_PrintPage({{
    param($sender, $e)
    $bounds = $e.MarginBounds
    if ($bounds.Width -lt 10 -or $bounds.Height -lt 10) {{ $bounds = $e.PageBounds }}
    $e.Graphics.DrawImage($script:imgRef, $bounds)
    $e.HasMorePages = $false
  }})
  $doc.Print()
  $doc.Dispose()
}} finally {{
  $img.Dispose()
}}
"#
            );
            let out = Command::new("powershell")
                .args(["-NoProfile", "-STA", "-Command", &ps])
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                let stdout = String::from_utf8_lossy(&out.stdout);
                let msg = if !err.trim().is_empty() {
                    err.trim().to_string()
                } else if !stdout.trim().is_empty() {
                    stdout.trim().to_string()
                } else {
                    "Windows print failed".into()
                };
                return Err(msg);
            }
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let page = resolve_cups_page_size(printer, paper, borderless);
        let mut cmd = Command::new("lp");
        if let Some(p) = printer {
            if !p.is_empty() {
                cmd.arg("-d").arg(p);
            }
        }
        if copies > 1 {
            cmd.arg("-n").arg(copies.to_string());
        }
        cmd.arg("-o").arg(format!("PageSize={page}"));
        cmd.arg("-o").arg(format!("media={page}"));

        apply_epson_opts(
            &mut cmd,
            printer,
            paper,
            borderless,
            opts.media_type.as_deref(),
            opts.quality.as_deref(),
        );

        if borderless {
            cmd.arg("-o").arg("fit-to-page");
            cmd.arg("-o").arg("print-scaling=fill");
        } else {
            match scale {
                "actual" => {
                    cmd.arg("-o").arg("print-scaling=none");
                }
                "fill" => {
                    cmd.arg("-o").arg("fit-to-page");
                    cmd.arg("-o").arg("print-scaling=fit");
                }
                _ => {
                    cmd.arg("-o").arg("fit-to-page");
                    cmd.arg("-o").arg("print-scaling=fit");
                }
            }
        }
        match opts.orientation.as_deref().unwrap_or("auto") {
            "landscape" => {
                cmd.arg("-o").arg("landscape");
            }
            "portrait" => {
                cmd.arg("-o").arg("portrait");
            }
            _ => {}
        }
        cmd.arg(path);
        let out = cmd.output().map_err(|e| format!("lp failed: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let msg = err.trim();
            return Err(if msg.is_empty() {
                "Print failed (lp error)".into()
            } else {
                msg.to_string()
            });
        }
        if let Some(p) = printer.filter(|s| !s.is_empty()) {
            if let Ok(q) = Command::new("lpstat").args(["-o", p]).output() {
                let qtext = String::from_utf8_lossy(&q.stdout).to_lowercase();
                if qtext.contains("error") || qtext.contains("stopped") {
                    return Err(format!(
                        "Job queued but printer reports error — check cable/power ({p})"
                    ));
                }
            }
        }
        let _ = page;
        Ok(())
    }
}

fn write_test_strip_png(path: &std::path::Path) -> Result<(), String> {
    const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
        0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];
    fs::write(path, PNG_1X1).map_err(|e| e.to_string())
}

#[tauri::command]
fn test_print(printer: Option<String>) -> Result<(), String> {
    let name = printer.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if name.is_none() {
        return Err("Select a printer first".into());
    }
    let mut tmp = tempfile::Builder::new()
        .prefix("nabooth-test-")
        .suffix(".png")
        .tempfile()
        .map_err(|e| e.to_string())?;
    write_test_strip_png(tmp.path())?;
    tmp.flush().map_err(|e| e.to_string())?;
    let path = tmp.path().to_string_lossy().to_string();
    print_path(
        &path,
        name,
        &PrintOpts {
            paper_size: Some("4x6".into()),
            media_type: Some("photo".into()),
            scale: Some("fit".into()),
            orientation: None,
            quality: Some("high".into()),
            copies: 1,
        },
    )?;
    std::thread::sleep(Duration::from_secs(2));
    drop(tmp);
    let _ = fs::remove_file(&path);
    Ok(())
}

#[tauri::command]
fn agent_login(api_url: String, username: String, password: String) -> Result<LoginOk, String> {
    let base = api_url.trim_end_matches('/');
    let url = format!("{base}/v1/print-agent/login");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "username": username, "password": password }))
        .send()
        .map_err(|e| format!("Cannot reach API ({base}): {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .map_err(|e: reqwest::Error| e.to_string())?;
    if !status.is_success() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(m) = v.get("message").and_then(|x| x.as_str()) {
                return Err(m.to_string());
            }
            if let Some(m) = v.get("error").and_then(|x| x.as_str()) {
                return Err(m.to_string());
            }
        }
        return Err(format!("Login failed (HTTP {status})"));
    }
    serde_json::from_str::<LoginOk>(&text).map_err(|e| format!("Bad login response: {e}"))
}

fn fetch_url_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    Ok(resp.bytes().map_err(|e| e.to_string())?.to_vec())
}

#[tauri::command]
fn download_bytes(url: String) -> Result<Vec<u8>, String> {
    fetch_url_bytes(&url)
}

#[tauri::command]
fn print_bytes(
    data: Vec<u8>,
    printer: Option<String>,
    copies: Option<i32>,
    paper_size: Option<String>,
    media_type: Option<String>,
    scale: Option<String>,
    orientation: Option<String>,
    quality: Option<String>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("empty image".into());
    }
    let mut tmp = tempfile::Builder::new()
        .prefix("nabooth-print-")
        .suffix(".png")
        .tempfile()
        .map_err(|e| e.to_string())?;
    tmp.write_all(&data).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    let path = tmp.path().to_string_lossy().to_string();
    let paper = paper_size
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("4x6");
    let borderless = paper_is_borderless(paper);
    let media = media_type.as_deref().unwrap_or("photo");
    let qual = quality.as_deref().unwrap_or("normal");
    #[cfg(not(target_os = "windows"))]
    let resolved = {
        let page = resolve_cups_page_size(printer.as_deref(), paper, borderless);
        format!(
            "{page}|bdls={}|media={}|qual={}",
            if borderless { 1 } else { 0 },
            epson_media_code(media),
            epson_quality_code(qual)
        )
    };
    #[cfg(target_os = "windows")]
    let resolved = format!("{paper}|media={media}|qual={qual}");
    print_path(
        &path,
        printer.as_deref(),
        &PrintOpts {
            paper_size,
            media_type,
            scale,
            orientation,
            quality,
            copies: copies.unwrap_or(1),
        },
    )?;
    std::thread::sleep(Duration::from_secs(2));
    drop(tmp);
    let _ = fs::remove_file(&path);
    Ok(resolved)
}

#[tauri::command]
fn download_and_print(
    url: String,
    printer: Option<String>,
    copies: Option<i32>,
    paper_size: Option<String>,
    media_type: Option<String>,
    scale: Option<String>,
    orientation: Option<String>,
    quality: Option<String>,
) -> Result<Vec<u8>, String> {
    let data = fetch_url_bytes(&url)?;
    let _ = print_bytes(
        data.clone(),
        printer,
        copies,
        paper_size,
        media_type,
        scale,
        orientation,
        quality,
    )?;
    Ok(data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            open_printer_settings,
            open_printer_queue,
            print_file_with_dialog,
            open_file,
            save_print_file,
            test_print,
            agent_login,
            download_bytes,
            print_bytes,
            download_and_print
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
