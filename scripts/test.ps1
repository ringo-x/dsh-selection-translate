# Runs the Node unit tests. Prefers in-process isolation, which also works in
# sandboxes that forbid child processes with piped stdio; falls back to the
# default runner on Node versions that predate the flag.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $nodeArguments = @('--test')
  $help = node --help 2>&1 | Out-String
  if ($help -match '--experimental-test-isolation') {
    $nodeArguments += '--experimental-test-isolation=none'
  }

  & node @nodeArguments 'test/*.test.mjs'
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'unit tests failed'
    exit 1
  }
} finally {
  Pop-Location
}
