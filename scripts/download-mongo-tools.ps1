<# Stages portable mongodump.exe + mongorestore.exe into resources/bin/. #>
[CmdletBinding()]
param(
  [string]$Version = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $PSScriptRoot "..\resources\bin"
}
$need = @("mongodump.exe", "mongorestore.exe")
$missing = @($need | Where-Object { -not (Test-Path -LiteralPath (Join-Path $OutDir $_)) })
if ($missing.Count -eq 0) {
  Write-Host "mongodump.exe + mongorestore.exe already staged - skipping download."
  exit 0
}

$versions = @()
if (-not [string]::IsNullOrWhiteSpace($Version)) { $versions += $Version }
$versions += @("100.11.0", "100.10.0", "100.9.4", "100.9.3")

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("gh-tools-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  $done = $false
  foreach ($v in $versions) {
    $zipName = "mongodb-database-tools-windows-x86_64-" + $v + ".zip"
    $url = "https://fastdl.mongodb.org/tools/db/" + $zipName
    $zipPath = Join-Path $tmp $zipName
    try {
      Write-Host ("Trying " + $url + " ...")
      Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    } catch {
      Write-Host ("Not available: " + $zipName)
      continue
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
      foreach ($tool in $need) {
        $entry = $zip.Entries | Where-Object { $_.FullName -like ("*/bin/" + $tool) } | Select-Object -First 1
        if (-not $entry) { throw ($tool + " not found inside " + $zipName) }
        New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $OutDir $tool), $true)
        Write-Host ("Staged: " + $tool)
      }
    } finally {
      $zip.Dispose()
    }
    $done = $true
    break
  }
  if (-not $done) { throw "Could not download Database Tools (tried: $($versions -join ', ')). Place mongodump.exe/mongorestore.exe in resources/bin/ manually." }
  foreach ($tool in $need) {
    $verLine = & (Join-Path $OutDir $tool) --version | Select-Object -First 1
    Write-Host ($tool + ": " + $verLine)
  }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
