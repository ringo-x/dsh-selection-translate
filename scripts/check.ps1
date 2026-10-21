# Static checks for the selection-translation plugin.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  node --check client.js
  if ($LASTEXITCODE -ne 0) { throw 'client.js syntax check failed' }

  node --check index.js
  if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed' }

  $package = Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json
  Get-Content locale/en.json -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
  Get-Content locale/zh.json -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
  [xml](Get-Content icon.svg -Raw -Encoding UTF8) | Out-Null

  if ($package.name -ne '@local/dsh-selection-translate') {
    throw "unexpected package name: $($package.name)"
  }

  $client = Get-Content client.js -Raw -Encoding UTF8
  if ($client -notmatch [regex]::Escape("id: '$($package.name)'")) {
    throw "client.js module id does not match package name $($package.name)"
  }

  $patch = Join-Path $root $package.dsh.bundle.patch
  if (-not (Test-Path $patch)) {
    throw "bundle patch missing: $($package.dsh.bundle.patch)"
  }

  # Unit tests load the real client.js; a failure here blocks the change.
  & (Join-Path $PSScriptRoot 'test.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'unit tests failed' }

  Write-Host "checks passed: $($package.name)@$($package.version)"
} finally {
  Pop-Location
}
