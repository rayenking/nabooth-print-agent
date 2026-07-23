# Nabooth Print Agent

App for the PC connected to your photo printer. Lets the Nabooth booth print photo strips from iPad/phone to that printer.

[![Latest release](https://img.shields.io/github/v/release/rayenking/nabooth-print-agent)](https://github.com/rayenking/nabooth-print-agent/releases/latest)

## Download (latest)

| Your computer | Download |
|---------------|----------|
| **Windows** (most PCs) | [Download for Windows](https://github.com/rayenking/nabooth-print-agent/releases/latest) — pick `Nabooth-Print-Agent-Windows-x64.msi` or `.exe` |
| **Mac (Apple Silicon)** M1 / M2 / M3 / M4 | [Download for Mac](https://github.com/rayenking/nabooth-print-agent/releases/latest) — pick `Nabooth-Print-Agent-Mac-AppleSilicon.dmg` |
| **Mac (Intel)** | Same [Releases](https://github.com/rayenking/nabooth-print-agent/releases/latest) page — pick `Nabooth-Print-Agent-Mac-Intel.dmg` |
| **Linux** (optional) | Same Releases page — AppImage or `.deb` |

> **No release yet?** Files appear after we publish a version (git tag). Until then, ask your admin or check **Actions → Build → Artifacts**.

## Install in 3 steps

1. Download the file for your computer from [Releases](https://github.com/rayenking/nabooth-print-agent/releases/latest)
2. Open / install it  
   - **Windows:** double-click the installer → Next → Next  
   - **Mac:** open the `.dmg` → drag **Nabooth Print Agent** to Applications
3. Open **Nabooth Print Agent**

## First-time setup

1. On the Nabooth dashboard → **Print Agent** (Pro) → create username / password
2. In the desktop app → log in with those credentials
3. Choose your USB / photo printer
4. Leave the app **online** while the booth is running
5. On the booth done screen → **Print with Nabooth**

## If Windows or Mac says the app is unsafe

Unsigned builds show a warning. This is normal — not a virus.

- **Windows:** More info → **Run anyway**
- **Mac:** System Settings → Privacy & Security → **Open Anyway**, or right-click the app → **Open**

Full signing docs for admins: [SIGNING.md](./SIGNING.md)

## Need help?

- Keep the agent **online** on the printer PC
- Same Wi‑Fi as the booth is **not** required (cloud), but the PC needs internet
- Username / password come from the dashboard **Print Agent** page
- Still stuck? Contact your Nabooth admin

---

## For developers

Standalone repo (split from [nabooth](https://github.com/rayenking/nabooth)). API / dashboard stay in nabooth; this repo is **only** the desktop agent + installer CI.

### Dev setup

```bash
pnpm install
pnpm tauri dev
```

Login with credentials from nabooth dashboard **Print Agent** (`/dashboard/print-agent`).

| Mode | API |
|------|-----|
| **Release** (`pnpm tauri build`) | fixed `https://nabooth.id` (paths `/v1/...`, no URL field) |
| **Dev** (`pnpm tauri dev`) | URL field shown; default `http://localhost:5050` |

### Icons

Source: `assets/naboothlogo.svg`

```bash
pnpm icons
pnpm tauri build
```

### Build CI (installers)

Workflow: [`.github/workflows/build.yml`](.github/workflows/build.yml) — **no k3s deploy**.

| Trigger | How | Output |
|---------|-----|--------|
| Manual | Actions → **Build** → Run workflow | Artifacts only (30 days) |
| Push to `main` | `git push origin main` | Artifacts only (30 days) |
| Tag | `git tag v0.1.0 && git push origin v0.1.0` | Artifacts **+** [GitHub Release](https://github.com/rayenking/nabooth-print-agent/releases) with installers |

Matrix: `darwin-arm64`, `darwin-x64`, `windows-x64`, `linux-x64`.

Release assets are renamed for operators, e.g.:

- `Nabooth-Print-Agent-Windows-x64.msi` / `.exe`
- `Nabooth-Print-Agent-Mac-AppleSilicon.dmg`
- `Nabooth-Print-Agent-Mac-Intel.dmg`

### Code signing

CI builds **unsigned** until GitHub secrets are set. Operators will see Gatekeeper / SmartScreen warnings on first open — expected.

With cert secrets configured, macOS (Developer ID + notarize) and Windows (Authenticode) installers are signed in the same workflow.

Full setup (what to buy, secret names, verify commands): **[SIGNING.md](./SIGNING.md)**.

### Local build (current OS only)

```bash
pnpm tauri build
# → src-tauri/target/release/bundle/
```

### Upload binaries to nabooth API (optional)

```bash
VERSION=0.1.0 NABOOTH_TOKEN=... API_URL=https://api.nabooth.id \
  pnpm upload \
  --darwin-arm64 path/to/*.dmg \
  --windows-x64 path/to/*.msi
```

### OS print backends

- **macOS / Linux:** CUPS `lp` / `lpstat`
- **Windows:** PowerShell `Get-Printer` + `Start-Process -Verb Print`
