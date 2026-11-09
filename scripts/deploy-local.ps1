$ErrorActionPreference = 'Stop'
$image = "$($env:DOCKERHUB_USERNAME.ToLowerInvariant())/digit-lens:sha-$env:IMAGE_SHA"
$network = 'digit-lens-net'
$proxy = 'digit-lens-proxy'
$legacy = 'digit-lens'
$target = 'digit-lens-' + $env:IMAGE_SHA.Substring(0,12)
$probeDir = Join-Path $env:RUNNER_TEMP ("digit-probe-" + $env:GITHUB_RUN_ID + '-' + $env:GITHUB_RUN_ATTEMPT)
New-Item -ItemType Directory -Force -Path $probeDir | Out-Null
$env:NEW_IMAGE = $image
$env:OLD_IMAGE = 'unknown'
$env:DEPLOY_ERROR = ''
$probe = $null
$legacyStopped = $false
$migrating = $false
function Docker([string[]] $ArgsList) {
    $output = & docker.exe @ArgsList
    if ($LASTEXITCODE -ne 0) { throw "docker $($ArgsList -join ' ') failed ($LASTEXITCODE)" }
    return $output
}
function Exists([string] $Name) {
    $v = & docker.exe ps -a --filter "name=^/$Name$" --format '{{.Names}}'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker containers' }
    return ($v -eq $Name)
}
function Ready([string] $Name) {
    for ($i=0; $i -lt 30; $i++) {
        & docker.exe exec $Name wget -q -O /dev/null http://127.0.0.1/model/model.json 2>$null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw "Container $Name did not become ready"
}
function Config([string] $Upstream) {
    return "server { listen 80; location / { proxy_pass http://${Upstream}:80; proxy_set_header Host `$host; proxy_http_version 1.1; } }"
}
function Wait-Probes([string] $Phase, [int] $Count) {
    for ($i=0; $i -lt 180; $i++) {
        if ($probe.HasExited) { throw 'Browser probe exited unexpectedly' }
        $file = Join-Path $probeDir 'attempts.jsonl'
        if (Test-Path $file) {
            $rows = @(Get-Content $file | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} } | Where-Object { $_.phase -eq $Phase })
            if ($rows.Count -ge $Count) {
                if (!($rows | Where-Object { $_.ok })) { throw "No successful $Phase inference" }
                return
            }
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for $Phase probes"
}
try {
    Docker @('info') | Out-Null
    Docker @('pull', $image) | Out-Null
    Docker @('pull', 'nginx:1.27.5-alpine') | Out-Null
    $networks = Docker @('network','ls','--filter',"name=^${network}$",'--format','{{.Name}}')
    if ($networks -notcontains $network) { Docker @('network','create',$network) | Out-Null }
    if (Exists $proxy) {
        $oldConfig = (Docker @('exec',$proxy,'cat','/etc/nginx/conf.d/default.conf')) -join ' '
        if ($oldConfig -notmatch 'proxy_pass http://([a-zA-Z0-9-]+):80') { throw 'Cannot determine existing proxy upstream' }
        $oldTarget = $Matches[1]
        $env:OLD_IMAGE = (Docker @('inspect','--format','{{.Config.Image}}',$oldTarget)) -join ''
    } else {
        $migrating = $true
        if (!(Exists $legacy)) { throw 'No existing managed digit-lens container to migrate' }
        $details = (Docker @('inspect',$legacy) | ConvertFrom-Json)[0]
        $managed = $details.Config.Labels.'app.digit-lens.managed'
        if ($managed -ne 'true') { throw 'Existing container is not managed by Digit Lens' }
        $env:OLD_IMAGE = (Docker @('inspect','--format','{{.Config.Image}}',$legacy)) -join ''
        $oldTarget = 'digit-lens-legacy-backend'
        if (!(Exists $oldTarget)) { Docker @('run','-d','--name',$oldTarget,'--network',$network,'--restart','unless-stopped',$env:OLD_IMAGE) | Out-Null }
        Ready $oldTarget
    }
    if (!(Exists $target)) { Docker @('run','-d','--name',$target,'--network',$network,'--restart','unless-stopped',$image) | Out-Null }
    Ready $target
    Set-Content -Encoding ASCII -Path (Join-Path $probeDir 'phase') -Value 'before'
    $probeScript = Join-Path $PSScriptRoot 'deployment-probe.js'
    $probe = Start-Process -FilePath 'node.exe' -ArgumentList @("`"$probeScript`"", "`"$probeDir`"") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $probeDir 'stdout.log') -RedirectStandardError (Join-Path $probeDir 'stderr.log')
    Wait-Probes 'before' 3
    Set-Content -Encoding ASCII -Path (Join-Path $probeDir 'phase') -Value 'during'
    if (!(Exists $proxy)) {
        Docker @('stop',$legacy) | Out-Null
        $legacyStopped = $true
        $conf = Config $oldTarget
        $command = "echo '$conf' > /etc/nginx/conf.d/default.conf; exec nginx -g 'daemon off;'"
        Docker @('run','-d','--name',$proxy,'--network',$network,'--restart','unless-stopped','-p','127.0.0.1:8080:80','nginx:1.27.5-alpine','sh','-c',$command) | Out-Null
        $legacyStopped = $false
    }
    $conf = Config $target
    $command = "echo '$conf' > /etc/nginx/conf.d/default.conf; nginx -t && nginx -s reload"
    Docker @('exec',$proxy,'sh','-c',$command) | Out-Null
    Wait-Probes 'during' 5
    Set-Content -Encoding ASCII -Path (Join-Path $probeDir 'phase') -Value 'after'
    Wait-Probes 'after' 3
    $afterRows = @(Get-Content (Join-Path $probeDir 'attempts.jsonl') | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.phase -eq 'after' -and $_.ok -and $_.version -eq $env:IMAGE_SHA })
    if (!$afterRows.Count) { throw 'No successful inference observed with the new version after the switch' }
} catch {
    $env:DEPLOY_ERROR = $_.Exception.Message
    Write-Error -ErrorAction Continue $env:DEPLOY_ERROR
    if ($migrating -and (Exists $proxy)) { & docker.exe rm -f $proxy | Out-Null; $legacyStopped = $true }
    if ($legacyStopped) { & docker.exe start $legacy | Out-Null }
} finally {
    if ($probe) {
        New-Item -ItemType File -Force -Path (Join-Path $probeDir 'stop') | Out-Null
        if (!$probe.WaitForExit(60000)) { $probe.Kill(); $env:DEPLOY_ERROR += ' Probe did not exit in time.' }
    }
    & node (Join-Path $PSScriptRoot 'deployment-summary.js') $probeDir
    if ($LASTEXITCODE -ne 0 -or $env:DEPLOY_ERROR) { exit 1 }
}
