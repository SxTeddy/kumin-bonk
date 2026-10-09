# KuminBonk - created by hxz - Copyright (c) 2026 hxz - see LICENSE
# KuminBonk installer: copies the app, downloads the official Node.js runtime (verified), makes shortcuts.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Host.UI.RawUI.WindowTitle = 'ติดตั้ง KuminBonk'
$src  = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Programs\KuminBonk'
$exe  = Join-Path $dest 'KuminBonk.exe'
$appVersion = '__VERSION__'

function Step($t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Magenta }

try {
  Write-Host ''
  Write-Host '  ======================================' -ForegroundColor Magenta
  Write-Host "     ติดตั้ง KuminBonk v$appVersion" -ForegroundColor Magenta
  Write-Host '  ======================================' -ForegroundColor Magenta

  Step 'ปิด KuminBonk ที่เปิดอยู่ (ถ้ามี)...'
  Get-Process -Name KuminBonk -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500

  Step 'คัดลอกไฟล์โปรแกรม...'
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $vdir = Join-Path $dest "versions\$appVersion"
  if (Test-Path $vdir) { Remove-Item -Recurse -Force $vdir }
  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'versions') | Out-Null
  Copy-Item -Recurse -Force (Join-Path $src 'app') $vdir
  Set-Content -Path (Join-Path $vdir '.complete') -Value $appVersion -NoNewline
  Set-Content -Path (Join-Path $dest 'current.txt') -Value $appVersion -NoNewline
  if (Test-Path (Join-Path $dest 'app')) { Remove-Item -Recurse -Force (Join-Path $dest 'app') }  # layout of v1.3
  Copy-Item -Force (Join-Path $src 'icon.ico'), (Join-Path $src 'uninstall.ps1'), (Join-Path $src 'launch.cjs') $dest

  $needNode = $true
  if (Test-Path $exe) { if ((Get-Item $exe).VersionInfo.ProductVersion -like '22.*') { $needNode = $false } }
  if ($needNode) {
    Step 'ดาวน์โหลด Node.js (ตัวรันโปรแกรม ~30 MB) จาก nodejs.org ... รอสักครู่'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $tmp = "$exe.download"
    $ok = $false
    foreach ($base in @('https://nodejs.org/dist/v22.22.0', 'https://nodejs.org/dist/latest-v22.x')) {
      try {
        Invoke-WebRequest "$base/win-x64/node.exe" -OutFile $tmp -UseBasicParsing
        $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
        if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
        $line = ($sums -split "`n") | Where-Object { $_ -match '\swin-x64/node\.exe\s*$' } | Select-Object -First 1
        $want = ($line -split '\s+')[0].ToLower()
        $got  = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
        if ($want -and $got -eq $want) { $ok = $true; break }
        Write-Host '  ไฟล์ไม่ตรงกับลายเซ็นของ nodejs.org ลองแหล่งถัดไป...' -ForegroundColor Yellow
      } catch { Write-Host "  ดาวน์โหลดจาก $base ไม่ได้ ลองแหล่งถัดไป..." -ForegroundColor Yellow }
    }
    if (-not $ok) { if (Test-Path $tmp) { Remove-Item $tmp -Force }; throw 'ดาวน์โหลด Node.js ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
    Step 'ตรวจไฟล์ถูกต้องแล้ว (SHA-256 ตรงกับ nodejs.org)'
    # Mark it as a windowed app so no black console window appears.
    $b = [IO.File]::ReadAllBytes($tmp)
    $pe = [BitConverter]::ToInt32($b, 0x3c)
    $b[$pe + 24 + 68] = 2; $b[$pe + 24 + 69] = 0
    [IO.File]::WriteAllBytes($tmp, $b)
    Move-Item -Force $tmp $exe
  }

  Step 'สร้างทางลัดบนเดสก์ท็อปและเมนู Start...'
  $ws = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $s = $ws.CreateShortcut((Join-Path $d 'KuminBonk.lnk'))
    $s.TargetPath = $exe
    $s.Arguments = 'launch.cjs'
    $s.WorkingDirectory = $dest
    $s.IconLocation = (Join-Path $dest 'icon.ico') + ',0'
    $s.Description = 'KuminBonk - ของขวัญ TikTok สู่ VTube Studio'
    $s.Save()
  }

  # Show up in Settings > Apps so it can be uninstalled like any app.
  $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KuminBonk'
  New-Item -Path $key -Force | Out-Null
  $un = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\uninstall.ps1`""
  Set-ItemProperty $key -Name DisplayName -Value 'KuminBonk'
  Set-ItemProperty $key -Name DisplayVersion -Value $appVersion
  Set-ItemProperty $key -Name Publisher -Value 'kmxlrinf'
  Set-ItemProperty $key -Name DisplayIcon -Value "$dest\icon.ico"
  Set-ItemProperty $key -Name InstallLocation -Value $dest
  Set-ItemProperty $key -Name UninstallString -Value $un
  Set-ItemProperty $key -Name NoModify -Value 1 -Type DWord
  Set-ItemProperty $key -Name NoRepair -Value 1 -Type DWord

  Step 'ติดตั้งเสร็จแล้ว! กำลังเปิด KuminBonk ...'
  Start-Process -FilePath $exe -ArgumentList 'launch.cjs' -WorkingDirectory $dest
  Start-Sleep -Seconds 3
  exit 0
} catch {
  Write-Host ''
  Write-Host "  ติดตั้งไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ''
  exit 1
}
