param(
    [ValidateSet('Start', 'Build', 'Stop', 'Status')]
    [string]$Action = 'Start',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskDocker = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
$taskEnv = Join-Path $taskRepo '.env'
$taskImage = 'keydesk:0.167.2-ko'
$taskCompose = @('--context', 'desktop-linux', 'compose', '--project-directory', $taskRepo, '--env-file', $taskEnv, '-f', (Join-Path $taskRepo 'compose.keydesk.yml'))

function Test-DockerEngine {
    $taskProbe = $null
    try {
        $taskProbeInfo = [Diagnostics.ProcessStartInfo]::new()
        $taskProbeInfo.FileName = $taskDocker
        $taskProbeInfo.Arguments = '--context desktop-linux info --format "{{.ServerVersion}}"'
        $taskProbeInfo.UseShellExecute = $false
        $taskProbeInfo.CreateNoWindow = $true
        $taskProbeInfo.RedirectStandardOutput = $true
        $taskProbeInfo.RedirectStandardError = $true
        $taskProbe = [Diagnostics.Process]::Start($taskProbeInfo)
        if (-not $taskProbe.WaitForExit(5000)) {
            $taskProbe.Kill()
            $taskProbe.WaitForExit(1000) | Out-Null
            return $false
        }
        return ($taskProbe.ExitCode -eq 0)
    }
    catch { return $false }
    finally { if ($null -ne $taskProbe) { $taskProbe.Dispose() } }
}

function New-LocalEnvironment {
    $taskExistingVolume = & $taskDocker --context desktop-linux volume ls --quiet --filter 'name=infisical-personal_pg_data'
    if ($LASTEXITCODE -ne 0) { throw 'Could not check existing data volumes.' }
    if ($taskExistingVolume) { throw 'Existing database found, but .env is missing. Restore the original .env before starting.' }
    $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        function New-KeydeskToken([int]$count) {
            $taskBytes = New-Object byte[] $count
            $taskRng.GetBytes($taskBytes)
            return ([BitConverter]::ToString($taskBytes)).Replace('-', '').ToLowerInvariant()
        }
        $taskLines = @(
            ('ENCRYPTION_KEY=' + (New-KeydeskToken 16))
            ('AUTH_SECRET=' + (New-KeydeskToken 32))
            'POSTGRES_USER=infisical'
            ('POSTGRES_PASSWORD=' + (New-KeydeskToken 24))
            'POSTGRES_DB=infisical'
            'DB_CONNECTION_URI=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}'
            'REDIS_URL=redis://redis:6379'
            'SITE_URL=http://localhost:8088'
            'TELEMETRY_ENABLED=false'
        )
        [IO.File]::WriteAllLines($taskEnv, $taskLines, [Text.UTF8Encoding]::new($false))
        $taskAcl = Get-Acl -LiteralPath $taskEnv
        $taskAcl.SetAccessRuleProtection($true, $false)
        $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $taskAcl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskIdentity, 'FullControl', 'Allow'))
        Set-Acl -LiteralPath $taskEnv -AclObject $taskAcl
        Write-Host 'Generated local encryption and database settings in .env.'
    }
    finally { $taskRng.Dispose() }
}

try {
    if (-not (Test-Path -LiteralPath $taskDocker)) { throw 'Install Docker Desktop before starting Keydesk.' }
    if (-not (Test-DockerEngine)) {
        if ($Action -notin @('Start', 'Build')) { throw 'Docker engine is not running.' }
        Write-Host 'Starting Docker Desktop...'
        & $taskDocker desktop start --detach
        if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and try again.' }
        $taskDeadline = (Get-Date).AddSeconds(120)
        do {
            Start-Sleep -Seconds 3
            $taskReady = Test-DockerEngine
        } until ($taskReady -or (Get-Date) -gt $taskDeadline)
        if (-not $taskReady) { throw 'Docker engine is unavailable. Check Docker Desktop.' }
    }

    if (-not (Test-Path -LiteralPath $taskEnv)) {
        if ($Action -notin @('Start', 'Build')) { throw 'Local .env file is missing.' }
        New-LocalEnvironment
    }
    if ($Action -eq 'Stop') {
        & $taskDocker @taskCompose stop
        if ($LASTEXITCODE -ne 0) { throw 'Stopping Keydesk failed.' }
        Write-Host 'Keydesk stopped. Data is preserved.'
        exit 0
    }
    if ($Action -eq 'Status') {
        & $taskDocker @taskCompose ps
        exit $LASTEXITCODE
    }
    & $taskDocker @taskCompose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration is invalid.' }
    $taskImages = & $taskDocker --context desktop-linux image ls --quiet $taskImage
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the local Keydesk image.' }
    if ($Action -eq 'Build' -or -not $taskImages) {
        & $taskDocker @taskCompose build backend
        if ($LASTEXITCODE -ne 0) { throw 'Keydesk build failed. Existing data was not changed.' }
    }
    & $taskDocker @taskCompose up -d --no-build --wait --wait-timeout 300
    if ($LASTEXITCODE -ne 0) { throw 'Keydesk did not become healthy. Run Status-Keydesk.cmd.' }
    $taskResponse = Invoke-WebRequest -Uri 'http://localhost:8088/api/status' -UseBasicParsing -TimeoutSec 15
    if ($taskResponse.StatusCode -ne 200) { throw 'Keydesk health check failed.' }
    Write-Host 'Keydesk is ready: http://localhost:8088'
    if (-not $NoBrowser) { Start-Process 'http://localhost:8088' }
    exit 0
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
