<# Stages portable mongod.exe into resources/bin/ for electron-builder extraResources. #>
[CmdletBinding()]
param(
  [string]$Version = "7.0.14",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $PSScriptRoot "..\resources\bin"
}
$target = Join-Path $OutDir "mongod.exe"
if (Test-Path -LiteralPath $target) {
  Write-Host ("mongod.exe already staged at " + $target + " - skipping download.")
  exit 0
}

$zipName = "mongodb-windows-x86_64-" + $Version + ".zip"
$url = "https://fastdl.mongodb.org/windows/" + $zipName
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("gh-mongo-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zipPath = Join-Path $tmp $zipName

try {
  Write-Host ("Downloading " + $url + " ...")
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  Write-Host "Extracting mongod.exe only ..."
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -like "*/bin/mongod.exe" } | Select-Object -First 1
    if (-not $entry) { throw ("mongod.exe not found inside " + $zipName) }
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
  } finally {
    $zip.Dispose()
  }
  Write-Host ("Staged: " + $target)
  $verLine = & $target --version | Select-Object -First 1
  Write-Host $verLine
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
