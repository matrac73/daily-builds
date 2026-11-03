# Build dist\Fouet.exe (PyInstaller, single file, no console) and dist\FouetSetup.exe (Inno Setup).
# Requirements: Python 3.8+ with `pip install pyinstaller pillow`, Inno Setup 6 (winget install JRSoftware.InnoSetup).
param([switch]$SkipInstaller)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $version = (Select-String -Path fouet.py -Pattern '^__version__ = "(.+)"').Matches[0].Groups[1].Value
    Write-Host "Building Fouet $version"

    py packaging\make_icon.py packaging\fouet.ico
    if ($LASTEXITCODE) { throw 'icon generation failed' }

    New-Item -ItemType Directory -Force build | Out-Null
    $parts = ($version.Split('.') + @('0', '0', '0'))[0..3] -join ', '
    @"
VSVersionInfo(
  ffi=FixedFileInfo(filevers=($parts), prodvers=($parts)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', 'Mathieu Ract'),
      StringStruct('FileDescription', 'Fouet - pixel-art whip for your desktop'),
      StringStruct('FileVersion', '$version'),
      StringStruct('ProductName', 'Fouet'),
      StringStruct('ProductVersion', '$version'),
      StringStruct('LegalCopyright', 'MIT License (c) 2026 Mathieu Ract'),
      StringStruct('OriginalFilename', 'Fouet.exe')])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"@ | Set-Content build\version_info.txt -Encoding utf8

    py -m PyInstaller --noconfirm --clean --onefile --noconsole --name Fouet `
        --icon "$root\packaging\fouet.ico" --version-file "$root\build\version_info.txt" `
        --distpath dist --workpath build\pyi --specpath build fouet.py
    if ($LASTEXITCODE) { throw 'PyInstaller failed' }

    if (-not $SkipInstaller) {
        $iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
            Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $iscc) { throw 'Inno Setup 6 not found (winget install JRSoftware.InnoSetup)' }
        & $iscc /Q "/DAppVersion=$version" packaging\fouet.iss
        if ($LASTEXITCODE) { throw 'Inno Setup failed' }
    }
    Get-ChildItem dist\*.exe | ForEach-Object { '{0}  {1:N1} MB' -f $_.Name, ($_.Length / 1MB) }
} finally {
    Pop-Location
}
