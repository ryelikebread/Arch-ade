#!/usr/bin/env bash
# Imports the Developer ID certificate into a temporary keychain on the CI runner.
# Runs only when ENABLE_SIGNING is "true" (see .github/workflows/release.yml).
set -euo pipefail
: "${APPLE_CERTIFICATE:?base64 .p12 missing}"
: "${APPLE_CERTIFICATE_PASSWORD:?missing}"
KEYCHAIN=build.keychain
KEYCHAIN_PASSWORD="$(openssl rand -base64 24)"
echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import certificate.p12 -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
rm certificate.p12
