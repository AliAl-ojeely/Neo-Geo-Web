param(
    [ValidateSet('chrome', 'brave', 'edge')][string]$Browser = 'chrome',
    [ValidateSet('kof2003', 'mslug5')][string]$Game = 'kof2003',
    [ValidateSet('Online', 'Offline', 'Manual')][string]$Mode = 'Online',
    [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Run = 'run-01'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$lab = Join-Path $root 'work/recovery/kof2003-acceptance'
$port = @{chrome = 9381; brave = 9382; edge = 9383}[$Browser]
$endpoint = "http://127.0.0.1:$port"
$driver = @{kof2003 = 'kof2k3fd'; mslug5 = 'mslug5fd'}[$Game]
$fixtureName = if ($Game -eq 'kof2003') { 'fixture' } else { 'fixture-mslug5' }
$fixture = Join-Path $lab $fixtureName
$output = Join-Path $lab "evidence/$Browser/candidate-$Game/$Run/$($Mode.ToLowerInvariant())"
if (Test-Path -LiteralPath $output) { throw "Evidence already exists: $output. Choose a new -Run value." }
# Attach only to the dedicated browser the tester has explicitly opened; never launch or kill browsers.
$null = Invoke-RestMethod "$endpoint/json/version"
if ($Mode -eq 'Manual') {
    & node (Join-Path $PSScriptRoot 'capture_kof2003_acceptance.cjs') $endpoint $Browser $Run $Game
} else {
    $switch = if ($Mode -eq 'Online') { '--online' } else { '--offline-only' }
    & node (Join-Path $root 'tools/browser_game_runner/verify_static.cjs') $endpoint `
        'http://127.0.0.1:8793/Neo-Geo-Web/' $fixture $driver $output $switch "$Game.zip"
}
if ($LASTEXITCODE -ne 0) { throw "Acceptance helper failed with exit code $LASTEXITCODE. Preserve its evidence." }
Write-Host "Evidence saved in $output. Harness PASS does not replace screenshot review or human gameplay acceptance."
