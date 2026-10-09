# KuminBonk - created by HXZ ! - Copyright (c) 2026 HXZ ! - see LICENSE
# Removes KuminBonk (settings in %APPDATA%\KuminBonk are kept unless you delete them yourself).
$ErrorActionPreference = 'SilentlyContinue'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\KuminBonk'
Get-Process -Name KuminBonk | Where-Object { $_.Path -like "$dest*" } | Stop-Process -Force
Start-Sleep -Milliseconds 500
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { Remove-Item (Join-Path $d 'KuminBonk.lnk') -Force }
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KuminBonk' -Recurse -Force
Set-Location $env:TEMP
Remove-Item $dest -Recurse -Force
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('ถอนการติดตั้ง KuminBonk แล้ว (การตั้งค่ายังเก็บไว้ที่ %APPDATA%\KuminBonk)', 'KuminBonk') | Out-Null
