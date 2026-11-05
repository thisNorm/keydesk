param(
    [ValidateSet('Start', 'Build', 'Stop', 'Status', 'Backup', 'Restore')]
    [string]$Action = 'Start',
    [string]$From,
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

function Protect-OwnerOnly([string]$taskPath) {
    $taskAcl = Get-Acl -LiteralPath $taskPath
    $taskAcl.SetAccessRuleProtection($true, $false)
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskIdentity, 'FullControl', 'Allow'))
    Set-Acl -LiteralPath $taskPath -AclObject $taskAcl
}

function Start-Database {
    & $taskDocker @taskCompose up -d --no-build --wait --wait-timeout 120 db | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Database did not become healthy. Run Status-Keydesk.cmd.' }
}

function Get-EnvValue([string]$taskPath, [string]$taskName) {
    $taskLine = Get-Content -LiteralPath $taskPath | Where-Object { $_ -like "$taskName=*" } | Select-Object -First 1
    if (-not $taskLine) { return $null }
    return $taskLine.Substring($taskName.Length + 1)
}

# The dump is unreadable without the .env that holds ENCRYPTION_KEY, so both go into one owner-only folder.
function New-KeydeskBackup {
    Start-Database
    $taskDir = Join-Path $taskRepo ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $taskDir | Out-Null
    Protect-OwnerOnly $taskDir
    & $taskDocker @taskCompose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/keydesk.dump && pg_restore -l /tmp/keydesk.dump > /dev/null' | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed. Existing data was not changed.' }
    & $taskDocker @taskCompose cp db:/tmp/keydesk.dump (Join-Path $taskDir 'keydesk.dump') | Out-Host
    $taskCopyExit = $LASTEXITCODE
    & $taskDocker @taskCompose exec -T db rm -f /tmp/keydesk.dump | Out-Host
    if ($taskCopyExit -ne 0) { throw 'Copying the backup out of the database container failed.' }
    Copy-Item -LiteralPath $taskEnv -Destination (Join-Path $taskDir '.env')
    Write-Host "Backup saved: $taskDir"
    Write-Host 'It contains your encryption key. Keep a copy somewhere safe, off this PC.' -ForegroundColor Yellow
    return $taskDir
}

function Restore-KeydeskBackup([string]$taskDir) {
    $taskDump = Join-Path $taskDir 'keydesk.dump'
    $taskBackupEnv = Join-Path $taskDir '.env'
    if (-not (Test-Path -LiteralPath $taskDump) -or -not (Test-Path -LiteralPath $taskBackupEnv)) {
        throw 'Pass -From with a backup folder that contains keydesk.dump and .env.'
    }
    if ((Get-EnvValue $taskBackupEnv 'ENCRYPTION_KEY') -cne (Get-EnvValue $taskEnv 'ENCRYPTION_KEY')) {
        throw 'This backup uses a different encryption key. Stop Keydesk, replace .env with the backup''s .env, then run Restore again.'
    }
    Write-Host 'Restore replaces all current Keydesk data with the backup.' -ForegroundColor Yellow
    if ((Read-Host 'Type RESTORE to continue') -cne 'RESTORE') { throw 'Restore cancelled. Nothing was changed.' }
    $taskSafety = New-KeydeskBackup
    Write-Host "Current data was backed up first: $taskSafety"
    & $taskDocker @taskCompose stop backend | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Stopping Keydesk failed. Nothing was restored.' }
    # Restoring into a fresh database and swapping names drops tables newer than the backup, which a
    # restore over the live schema would keep and the next migration run would trip on.
    $taskRestoreScript = 'set -e; dropdb -U $POSTGRES_USER --if-exists keydesk_restore; dropdb -U $POSTGRES_USER --if-exists keydesk_previous; createdb -U $POSTGRES_USER -O $POSTGRES_USER keydesk_restore; pg_restore -U $POSTGRES_USER -d keydesk_restore --no-owner --exit-on-error /tmp/keydesk-restore.dump; psql -U $POSTGRES_USER -d postgres -v ON_ERROR_STOP=1 -c ''ALTER DATABASE ''$POSTGRES_DB'' RENAME TO keydesk_previous''; psql -U $POSTGRES_USER -d postgres -v ON_ERROR_STOP=1 -c ''ALTER DATABASE keydesk_restore RENAME TO ''$POSTGRES_DB; dropdb -U $POSTGRES_USER keydesk_previous'
    & $taskDocker @taskCompose cp $taskDump db:/tmp/keydesk-restore.dump | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Copying the backup into the database container failed. Nothing was restored.' }
    & $taskDocker @taskCompose exec -T db sh -c $taskRestoreScript | Out-Host
    $taskRestoreExit = $LASTEXITCODE
    & $taskDocker @taskCompose exec -T db rm -f /tmp/keydesk-restore.dump | Out-Host
    if ($taskRestoreExit -ne 0) { throw "Restore failed. If Keydesk does not start, restore the safety backup: $taskSafety" }
    # Cached secrets and sessions in Redis still describe the replaced data.
    & $taskDocker @taskCompose up -d --no-build --wait --wait-timeout 120 redis | Out-Host
    & $taskDocker @taskCompose exec -T redis redis-cli FLUSHALL | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Clearing the Redis cache failed. Run: docker compose exec redis redis-cli FLUSHALL' }
    Write-Host 'Restore finished. Starting Keydesk...'
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
        Protect-OwnerOnly $taskEnv
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
    if ($Action -eq 'Backup') {
        New-KeydeskBackup | Out-Null
        exit 0
    }
    if ($Action -eq 'Restore') {
        if (-not $From) { throw 'Pass -From with the backup folder to restore.' }
        Restore-KeydeskBackup $From
        $NoBrowser = $true
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
