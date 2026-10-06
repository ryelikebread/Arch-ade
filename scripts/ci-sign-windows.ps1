# Signs the MSI and NSIS installers with signtool.
# Runs only when ENABLE_SIGNING is "true" (see .github/workflows/release.yml).
$ErrorActionPreference = "Stop"
$pfx = Join-Path $env:RUNNER_TEMP "cert.pfx"
[IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
$files = Get-ChildItem -Recurse target -Include *.msi, *-setup.exe | Where-Object { $_.FullName -match "bundle" }
foreach ($f in $files) {
  & $signtool.FullName sign /f $pfx /p $env:WINDOWS_CERTIFICATE_PASSWORD /fd sha256 /tr http://timestamp.digicert.com /td sha256 $f.FullName
}
Remove-Item $pfx
