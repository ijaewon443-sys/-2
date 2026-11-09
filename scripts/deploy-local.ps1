$ErrorActionPreference = 'Stop'
$image = "$($env:DOCKERHUB_USERNAME.ToLowerInvariant())/digit-lens:sha-$env:IMAGE_SHA"
$name = 'digit-lens'
$backup = 'digit-lens-previous'

function Docker([string[]] $Arguments) {
    & docker.exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments -join ' ') failed ($LASTEXITCODE)" }
}
function Test-Service {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $index = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/' -TimeoutSec 2
            $model = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/model/model.json' -TimeoutSec 2
            $json = $model.Content | ConvertFrom-Json
            if ($index.StatusCode -eq 200 -and $index.Content.Contains('app.js') -and $json.weightsManifest) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'Service or model endpoint did not become ready on port 8080.'
}

Docker @('info')
Docker @('pull', $image)
$existing = & docker.exe ps -a --filter "name=^/$name$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing containers.' }
$staleBackup = & docker.exe ps -a --filter "name=^/$backup$" --format '{{.Names}}'
if ($staleBackup) { throw "Container $backup already exists; inspect it before deploying." }
if ($existing) {
    $managed = & docker.exe inspect --format '{{ index .Config.Labels "app.digit-lens.managed" }}' $name
    if ($LASTEXITCODE -ne 0 -or $managed -ne 'true') { throw "Container $name exists but is not managed by this deployment." }
    Docker @('stop', $name)
    Docker @('rename', $name, $backup)
}
try {
    Docker @('run', '-d', '--name', $name, '--label', 'app.digit-lens.managed=true', '--restart', 'unless-stopped', '-p', '127.0.0.1:8080:80', $image)
    Test-Service
} catch {
    & docker.exe logs $name 2>&1 | Out-Host
    & docker.exe rm -f $name 2>&1 | Out-Host
    if ($existing) {
        & docker.exe rename $backup $name
        & docker.exe start $name
    }
    throw
}
if ($existing) { Docker @('rm', $backup) }
Write-Host "Deployed $image at http://127.0.0.1:8080/"

