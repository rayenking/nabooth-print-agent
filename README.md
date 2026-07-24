# Nabooth Print Agent

Runs on the PC connected to your photo printer. Receives booth print jobs from Nabooth and opens the system print dialog.

Control panel: **http://127.0.0.1:17890** (localhost only)

[![Latest release](https://img.shields.io/github/v/release/rayenking/nabooth-print-agent)](https://github.com/rayenking/nabooth-print-agent/releases/latest)

## Install (recommended)

### Mac / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/rayenking/nabooth-print-agent/main/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/rayenking/nabooth-print-agent/main/install.ps1 | iex
```

The installer downloads the latest Go agent binary, starts it, and opens the control panel.

## First-time setup

1. Open **http://127.0.0.1:17890**
2. On the Nabooth dashboard → **Print Agent** (Pro) → create username / password
3. In the agent UI → log in with those credentials
4. Choose your USB / photo printer
5. Leave the agent **running** while the booth is open
6. On the booth done screen → **Print with Nabooth**
7. When a job appears → click **Print…** (system print dialog)

## Manual download

| Platform | Release asset |
|----------|----------------|
| Mac Apple Silicon | `nabooth-print-agent-darwin-arm64` |
| Mac Intel | `nabooth-print-agent-darwin-amd64` |
| Linux x64 | `nabooth-print-agent-linux-amd64` |
| Windows x64 | `nabooth-print-agent-windows-amd64.exe` |

From [Releases](https://github.com/rayenking/nabooth-print-agent/releases/latest).

```bash
chmod +x nabooth-print-agent-darwin-arm64
./nabooth-print-agent-darwin-arm64
```

## How it works

- Single **Go binary** serves the UI on `127.0.0.1:17890`
- Owns the cloud WebSocket to Nabooth (`https://nabooth.id`)
- Browser is only a control panel (login, printer, jobs, log)
- Jobs download to a temp folder; you print via the OS dialog (manual mode)

## Need help?

- Keep the agent process running on the printer PC
- Same Wi‑Fi as the booth is **not** required (cloud), but the PC needs internet
- Username / password come from the dashboard **Print Agent** page
- Still stuck? Contact your Nabooth admin

---

## For developers

Standalone repo (split from [nabooth](https://github.com/rayenking/nabooth)). API / dashboard stay in nabooth; this repo is the printer-side agent.

### Localhost agent (primary)

```bash
cd agent
go run .
# → http://127.0.0.1:17890
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `-port` | `17890` | localhost HTTP port |
| `-api` | config / `https://nabooth.id` | API base override |
| `-open` | `true` | open browser on start |
| `-version` | | print version |

Dev API (local nabooth API on `:5050`):

```bash
go run . -api http://localhost:5050
# or open http://127.0.0.1:17890?dev=1
```

Config file:

- macOS / Linux: `~/.config/nabooth-print-agent/config.json`
- Windows: `%AppData%\nabooth-print-agent\config.json`

### Layout

```
agent/                 # Go localhost agent (primary)
  main.go
  config.go
  printers.go
  print.go
  cloud.go
  server.go
  open.go
  web/                 # embedded UI (no build step)
install.sh
install.ps1
.github/workflows/agent.yml
src/ + src-tauri/      # legacy Tauri desktop app (kept for now)
```

### Agent CI

Workflow: [`.github/workflows/agent.yml`](.github/workflows/agent.yml)

| Trigger | Output |
|---------|--------|
| Push `main` (agent paths) / manual | Artifacts: `nabooth-print-agent-{os}-{arch}` |
| Tag `v*` | Artifacts **+** attach binaries to GitHub Release |

### Legacy Tauri app

Still in-repo for transition. Prefer the Go agent for operators.

```bash
pnpm install
pnpm tauri dev
```

| Mode | API |
|------|-----|
| **Release** (`pnpm tauri build`) | fixed `https://nabooth.id` |
| **Dev** (`pnpm tauri dev`) | default `http://localhost:5050` |

Tauri installer CI: [`.github/workflows/build.yml`](.github/workflows/build.yml). Signing notes: [SIGNING.md](./SIGNING.md).

### Protocol (must match nabooth API)

- Login: `POST {api}/v1/print-agent/login` → `{token, wsPath}`
- WS: `{ws|wss}://host/v1/print-agent/ws?token=...`
- Server job: `{type:"print_job", jobId, downloadUrl, ...}`
- Client progress: `{type:"job_progress", jobId, state:"printing"|"done"|"failed", ...}`
