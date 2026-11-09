[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $env:USERPROFILE 'source\keydesk-current-2026-11-09'),
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'TRANSFER-MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 'keydesk-source-transfer/v1') { throw '지원하지 않는 소스 전달 형식입니다.' }
function Test-KeydeskFiles([string]$Base) {
    $basePath = [IO.Path]::GetFullPath($Base)
    $prefix = $basePath.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($entry in $manifest.files) {
        $relative = [string]$entry.path
        if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or ($relative -split '[/\\]' | Where-Object { $_ -eq '..' })) {
            throw '목록에 허용하지 않는 경로가 있습니다.'
        }
        $filePath = [IO.Path]::GetFullPath((Join-Path $basePath $relative))
        if (-not $filePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw '소스 폴더 밖의 파일은 사용할 수 없습니다.' }
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "파일이 없습니다: $relative" }
        $item = Get-Item -LiteralPath $filePath -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "연결 파일은 사용할 수 없습니다: $relative" }
        if ($item.Length -ne $entry.bytes) { throw "파일 크기가 다릅니다: $relative" }
        $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
        if ($actual -ne $entry.sha256) { throw "파일 해시가 다릅니다: $relative" }
    }
}
Test-KeydeskFiles $sourceRoot
if ($VerifyOnly) {
    Write-Output ("소스 파일 {0}개 해시 확인 완료: {1}" -f $manifest.files.Count, $sourceRoot)
    return
}
$target = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) { throw '대상 폴더가 이미 있습니다. 기존 앱과 다른 새 폴더를 지정하세요.' }
$parent = Split-Path -Parent $target
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
New-Item -ItemType Directory -Path $target | Out-Null
Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}
Test-KeydeskFiles $target
Write-Output "최신 독립 앱 소스 이전과 해시 확인 완료: $target"
Write-Output '이 경로를 새 Codex 세션에서 여세요. 기존 앱과 실제 데이터는 변경하지 않았습니다.'
Write-Output '이것은 개발 중인 작업본입니다. 남은 CSS 개편과 최신 전체 검증을 이어가야 합니다.'
