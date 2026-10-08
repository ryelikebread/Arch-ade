# Signing and notarization

Disabled until credentials exist. To turn it on:

1. Add these repository secrets:
   - macOS: `APPLE_CERTIFICATE` (base64 of the Developer ID Application .p12), `APPLE_CERTIFICATE_PASSWORD`,
     `APPLE_SIGNING_IDENTITY` (e.g. `Developer ID Application: Name (TEAMID)`), `APPLE_ID`,
     `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.
   - Windows: `WINDOWS_CERTIFICATE` (base64 of the .pfx), `WINDOWS_CERTIFICATE_PASSWORD`.
2. Add the repository variable `ENABLE_SIGNING` = `true`.
3. Run the "Release bundles" workflow, or push a tag like `v0.1.0`.

With credentials present, tauri-action signs and notarizes the macOS app/dmg, and
`scripts/ci-sign-windows.ps1` signs the MSI and NSIS installers. Linux bundles are not signed.
