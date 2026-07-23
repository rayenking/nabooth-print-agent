# Nabooth Print Agent

Desktop bridge (Tauri) so booth/iPad can print strips to a USB printer on this PC.

Standalone repo (split from [nabooth](https://github.com/rayenking/nabooth) monorepo).
API / dashboard still live in nabooth; this repo is **only** the desktop agent + installer CI.

## Dev

```bash
pnpm install
pnpm tauri dev
```

Login with credentials from nabooth dashboard **Print Agent** (`/dashboard/print-agent`).

| Mode | API |
|------|-----|
| **Release** (`pnpm tauri build`) | fixed `https://nabooth.id` (paths `/v1/...`, no URL field) |
| **Dev** (`pnpm tauri dev`) | URL field shown; default `http://localhost:5050` |

## Icons

Source: `assets/naboothlogo.svg`

```bash
pnpm icons
pnpm tauri build
```

## Build installers (GitHub Actions)

Workflow: `.github/workflows/build.yml` — **no k3s deploy**.

| Trigger | How |
|---------|-----|
| Manual | Actions → **Build** → Run workflow |
| Tag | `git tag v0.1.0 && git push origin v0.1.0` |

Matrix: `darwin-arm64`, `darwin-x64`, `windows-x64`, `linux-x64`.
Download: run → **Artifacts** (30 days).

### Code signing

CI builds **unsigned** until GitHub secrets are set. Operators will see Gatekeeper / SmartScreen warnings on first open — expected.

With cert secrets configured, macOS (Developer ID + notarize) and Windows (Authenticode) installers are signed in the same workflow.

Full setup (what to buy, secret names, verify commands): **[SIGNING.md](./SIGNING.md)**.

### Local (current OS only)

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

## Flow

1. Operator saves print-agent username/password in nabooth dashboard
2. Run this app on the PC with the printer, login, pick printer
3. Keep online
4. Booth done → **Print with Nabooth**

## OS print

- macOS/Linux: CUPS `lp` / `lpstat`
- Windows: PowerShell `Get-Printer` + `Start-Process -Verb Print`
