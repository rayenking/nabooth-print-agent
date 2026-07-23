# Code signing (macOS Gatekeeper + Windows SmartScreen)

Unsigned installers work, but operators see scary OS warnings:

| OS | Warning |
|----|---------|
| **macOS** | “Apple cannot check it for malicious software” / “unidentified developer” |
| **Windows** | “Windows protected your PC” (SmartScreen) |

Signing + (on macOS) notarization removes those once real certificates are installed as **GitHub Actions secrets**. CI still builds **unsigned** when secrets are missing.

Workflow: [`.github/workflows/build.yml`](.github/workflows/build.yml)

---

## 1. Why unsigned looks “unsafe”

The OS does not know who published the binary. It is not a bug in Nabooth Print Agent — it is default OS policy for apps without a trusted publisher signature.

After signing:

- **macOS**: Developer ID signature + Apple notarization → open DMG/app normally (first open may still need right-click → Open once on older macOS; notarized apps usually open cleanly).
- **Windows**: Authenticode signature → SmartScreen reputation improves (EV certs get reputation faster than OV).

---

## 2. What to buy

### macOS

1. Enroll in **[Apple Developer Program](https://developer.apple.com/programs/)** (~US$99/year).
2. In Certificates, Identifiers & Profiles, create a **Developer ID Application** certificate (for distributing outside the Mac App Store).
3. Export as **.p12** from Keychain Access (include private key).
4. Create an **app-specific password** for your Apple ID (appleid.apple.com → Sign-In and Security) for notarization.
5. Note your **Team ID** (Membership details).

### Windows

1. Buy a **code signing certificate** from a public CA (DigiCert, Sectigo, SSL.com, etc.).
2. Prefer **EV** (Extended Validation) for faster SmartScreen trust; **OV** works but reputation builds slower.
3. Export as **.pfx** (certificate + private key + password).  
   Many modern CAs use hardware tokens / cloud HSM — follow the vendor’s CI export or cloud-signing docs if PFX export is restricted.

Linux AppImage/deb: no Authenticode/Gatekeeper equivalent required for this agent.

---

## 3. Export and base64 for GitHub secrets

**Never commit** `.p12` / `.pfx` files or passwords to git.

### macOS `.p12` → base64

```bash
# macOS / Linux
base64 -i DeveloperID.p12 | pbcopy   # macOS: copy to clipboard
# or
base64 -i DeveloperID.p12 > apple-cert.b64
```

### Windows `.pfx` → base64

```bash
# macOS / Linux (if you have the pfx file)
base64 -i codesign.pfx > windows-cert.b64

# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("codesign.pfx")) | Set-Clipboard
```

Paste the **single-line base64** into the GitHub secret value (not the raw binary file path).

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

---

## 4. Secret names

| Secret | Platform | Required when signing? | Description |
|--------|----------|------------------------|-------------|
| `APPLE_CERTIFICATE` | macOS | Yes | Base64 of Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | macOS | Yes | Password for that `.p12` |
| `APPLE_SIGNING_IDENTITY` | macOS | Yes | Exact identity string, e.g. `Developer ID Application: Nabooth … (TEAMID)` |
| `APPLE_ID` | macOS | For notarize | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS | For notarize | App-specific password (mapped to `APPLE_PASSWORD` in CI) |
| `APPLE_TEAM_ID` | macOS | For notarize | 10-character Team ID |
| `WINDOWS_CERTIFICATE` | Windows | Yes | Base64 of code-signing `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows | Yes | Password for that `.pfx` |

**Behavior:**

| Secrets | Result |
|---------|--------|
| None | Build succeeds, **unsigned** artifacts (warnings on open) |
| Partial (e.g. cert without password) | Job **fails** (misconfiguration) |
| Full macOS set | Tauri signs during `tauri build`; notarizes when Apple ID/password/team present |
| Full Windows set | CI signs collected `.msi` and `*-setup.exe` with `signtool` + DigiCert timestamp |

Find the macOS identity string:

```bash
security find-identity -v -p codesigning
```

---

## 5. Verify after build

Download artifacts from the workflow run, then:

### macOS

```bash
# Gatekeeper assessment (app or mounted DMG app)
spctl -a -vv /path/to/Nabooth\ Print\ Agent.app

# If notarized + stapled
stapler validate /path/to/Nabooth\ Print\ Agent.app
# or for DMG:
stapler validate /path/to/*.dmg
```

Expect `accepted` / source=Notarized Developer ID (wording varies by macOS version).

### Windows

```bat
signtool verify /pa path\to\installer.msi
signtool verify /pa path\to\*-setup.exe
```

Or: right-click installer → Properties → Digital Signatures → publisher name present.

---

## 6. Operator UX (after secrets are live)

1. Download installer from nabooth dashboard (or Actions artifact for testing).
2. Open normally — no “unknown developer” / “Windows protected your PC” from missing signature.
3. SmartScreen may still show a mild prompt for brand-new OV certs until reputation builds; EV reduces that.

Until secrets are configured, tell operators: **Right-click → Open** (macOS) or **More info → Run anyway** (Windows SmartScreen). That is expected for unsigned CI builds.

---

## CI notes (maintainers)

- Secrets are never printed in logs.
- macOS: temporary keychain import → `pnpm tauri build` with Apple env → keychain deleted in `always()`.
- Windows: sign **after** artifact collect so both MSI and NSIS get Authenticode even if Tauri config has no thumbprint.
- Linux: unchanged.
- Do not put real cert material in this repo; only GitHub encrypted secrets.
