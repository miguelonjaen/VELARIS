param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$RendererDirectory,
    [string]$OutputDirectory,
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $ProjectRoot).Path
$package = Get-Content -LiteralPath (Join-Path $projectPath 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($package.name -ne 'gaulos') { throw 'Expected the GAULOS desktop project.' }
$electronPackage = Get-Content -LiteralPath (Join-Path $projectPath 'node_modules\electron\package.json') -Raw -Encoding utf8 | ConvertFrom-Json
$builderCli = Join-Path $projectPath 'node_modules\electron-builder\cli.js'
if (-not (Test-Path -LiteralPath $builderCli)) { throw 'The existing electron-builder installation is missing.' }
$stagingParent = Join-Path $projectPath '.packaging'
New-Item -ItemType Directory -Path $stagingParent -Force | Out-Null
$stageName = "windows-$($package.version)-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$stagePath = Join-Path $stagingParent $stageName
New-Item -ItemType Directory -Path $stagePath | Out-Null
if (-not (Resolve-Path -LiteralPath $stagePath).Path.StartsWith("$projectPath\.packaging\")) { throw 'Staging path is outside the project packaging directory.' }

if (-not $RendererDirectory) { $RendererDirectory = Join-Path $projectPath 'dist' }
$rendererPath = (Resolve-Path -LiteralPath $RendererDirectory).Path
Copy-Item -LiteralPath $rendererPath -Destination (Join-Path $stagePath 'dist') -Recurse
foreach ($directory in @('dist-main','public','link','updater','build')) {
    Copy-Item -LiteralPath (Join-Path $projectPath $directory) -Destination $stagePath -Recurse
}
foreach ($file in @('package.json','package-lock.json','electron-main.js','electron-preload.js','aisBridge.js','map-server.js','ollama-local.js','ollama-route-intent.js','route-conversation-schema.json','route-reference-catalog.json')) {
    Copy-Item -LiteralPath (Join-Path $projectPath $file) -Destination $stagePath
}
Set-Content -LiteralPath (Join-Path $stagingParent 'last-stage.txt') -Value $stagePath -Encoding utf8
Write-Output "Packaging copy: $stagePath"

Push-Location -LiteralPath $stagePath
try {
    # Only the isolated copy is installed. Versions are taken from package-lock.json.
    & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw 'Installing locked production dependencies in the isolated copy failed.' }
} finally { Pop-Location }
if ($PrepareOnly) { return }

$outputPath = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $projectPath 'dist_electron' }
& node.exe $builderCli --projectDir $stagePath --win --x64 --publish never "--config.electronVersion=$($electronPackage.version)" "--config.directories.output=$outputPath"
if ($LASTEXITCODE -ne 0) { throw 'Building the Windows installer failed.' }
$expectedInstaller = Join-Path $outputPath "GAULOS-Setup-$($package.version).exe"
if (-not (Test-Path -LiteralPath $expectedInstaller)) { throw 'The expected installer was not produced.' }
& node.exe (Join-Path $projectPath 'scripts\verify-release.cjs') (Join-Path $outputPath 'win-unpacked\resources\app.asar') $rendererPath
if ($LASTEXITCODE -ne 0) { throw 'The packaged application failed the release checks.' }
$hash = Get-FileHash -LiteralPath $expectedInstaller -Algorithm SHA256
Set-Content -LiteralPath "$expectedInstaller.sha256" -Value "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($expectedInstaller))" -Encoding ascii
Write-Output "Installer: $expectedInstaller"
