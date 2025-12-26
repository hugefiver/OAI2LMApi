#!/bin/bash
# Setup script for GitHub Copilot coding agent
# This script runs BEFORE the firewall is enabled, allowing network access
# to download required dependencies like VSCode for testing.

set -e

echo "=== Copilot Coding Agent Setup ==="

# Install pnpm (required by this project)
echo "Installing pnpm..."
npm install -g pnpm@10

# Install project dependencies
echo "Installing project dependencies..."
cd "$GITHUB_WORKSPACE" || cd "$(dirname "$0")/../.."
pnpm install --frozen-lockfile

# Compile the test runner so @vscode/test-electron downloads VSCode
echo "Compiling tests..."
pnpm run compile:tests

# Pre-download VSCode for tests
# The @vscode/test-electron package downloads VSCode on first test run.
# By running the download step here (before the firewall), we cache VSCode.
echo "Pre-downloading VSCode for tests..."
node -e "
(async () => {
  try {
    const testElectron = require('@vscode/test-electron');
    if (!testElectron || !testElectron.downloadAndUnzipVSCode) {
      throw new Error('@vscode/test-electron is not properly installed');
    }
    const path = await testElectron.downloadAndUnzipVSCode('1.107.0');
    console.log('VSCode downloaded to:', path);
  } catch (err) {
    console.error('Failed to download VSCode:', err.message || err);
    process.exit(1);
  }
})();
"

echo "=== Setup Complete ==="
