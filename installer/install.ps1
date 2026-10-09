# KuminBonk - created by HXZ ! - Copyright (c) 2026 HXZ ! - see LICENSE
# KuminBonk installer: copies the app, downloads the official Node.js runtime (verified), makes shortcuts.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Host.UI.RawUI.WindowTitle = 'ติดตั้ง KuminBonk'
$src  = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Programs\KuminBonk'
$exe  = Join-Path $dest 'KuminBonk.exe'          # small starter, no console window
$node = Join-Path $dest 'node\node.exe'           # official Node.js, never modified
$appVersion = '__VERSION__'

# ---------- cute installer window (falls back to the console if anything about it fails) ----------
$ui = $null
$state = @{ canClose = $false; tick = 0; line = 0; rotate = $true }
$cuteLines = @('กำลังจัดห้องให้น้องใหม่~', 'ปัดฝุ่นนิดนึงนะ', 'ห่อของขวัญอยู่ รอแป๊บ', 'อีกนิดเดียว ฮึบ!', 'ใกล้แล้วว')

function New-CuteWindow {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $st = $state; $lines = $cuteLines   # local copies for the event handlers below
  [System.Windows.Forms.Application]::EnableVisualStyles()
  $pink = [Drawing.Color]::FromArgb(255, 79, 139); $ink = [Drawing.Color]::FromArgb(59, 34, 54); $muted = [Drawing.Color]::FromArgb(138, 111, 131)
  $f = New-Object Windows.Forms.Form
  $f.Text = "ติดตั้ง KuminBonk v$appVersion"; $f.ClientSize = New-Object Drawing.Size(460, 330)
  $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedSingle'; $f.MaximizeBox = $false
  $f.BackColor = [Drawing.Color]::FromArgb(255, 240, 246); $f.Font = New-Object Drawing.Font('Leelawadee UI', 10)
  $ico = Join-Path $src 'icon.ico'; if (Test-Path $ico) { $f.Icon = New-Object Drawing.Icon($ico) }
  # floating hearts
  $hearts = @()
  for ($i = 0; $i -lt 7; $i++) {
    $h = New-Object Windows.Forms.Label
    $h.Text = [string][char]0x2665; $h.AutoSize = $true; $h.BackColor = [Drawing.Color]::Transparent
    $h.ForeColor = @([Drawing.Color]::FromArgb(255, 179, 205), [Drawing.Color]::FromArgb(255, 134, 176), [Drawing.Color]::FromArgb(255, 210, 63))[$i % 3]
    $h.Font = New-Object Drawing.Font('Segoe UI Symbol', (10 + ($i % 3) * 4))
    $h.Left = 20 + $i * 62; $h.Top = 60 + (($i * 97) % 260)
    $f.Controls.Add($h); $hearts += $h
  }
  $pic = New-Object Windows.Forms.PictureBox
  $png = Join-Path $src 'app\public\assets\icon.png'
  if (Test-Path $png) { $pic.Image = [Drawing.Image]::FromFile($png) }
  $pic.SizeMode = 'Zoom'; $pic.Size = New-Object Drawing.Size(84, 84); $pic.Left = 188; $pic.Top = 34; $pic.BackColor = [Drawing.Color]::Transparent
  $f.Controls.Add($pic)
  $title = New-Object Windows.Forms.Label
  $title.Text = 'กำลังติดตั้ง KuminBonk'; $title.Font = New-Object Drawing.Font('Leelawadee UI', 15, [Drawing.FontStyle]::Bold)
  $title.ForeColor = $ink; $title.BackColor = [Drawing.Color]::Transparent; $title.TextAlign = 'MiddleCenter'
  $title.SetBounds(10, 132, 440, 34); $f.Controls.Add($title)
  $sub = New-Object Windows.Forms.Label
  $sub.Text = $cuteLines[0]; $sub.ForeColor = $muted; $sub.BackColor = [Drawing.Color]::Transparent; $sub.TextAlign = 'MiddleCenter'
  $sub.SetBounds(10, 168, 440, 24); $f.Controls.Add($sub)
  $track = New-Object Windows.Forms.Panel
  $track.SetBounds(50, 210, 360, 16); $track.BackColor = [Drawing.Color]::FromArgb(251, 227, 236); $f.Controls.Add($track)
  $fill = New-Object Windows.Forms.Panel
  $fill.SetBounds(0, 0, 8, 16); $fill.BackColor = $pink; $track.Controls.Add($fill)
  $pct = New-Object Windows.Forms.Label
  $pct.Text = '0%'; $pct.ForeColor = $pink; $pct.BackColor = [Drawing.Color]::Transparent; $pct.TextAlign = 'MiddleCenter'
  $pct.Font = New-Object Drawing.Font('Leelawadee UI', 9, [Drawing.FontStyle]::Bold); $pct.SetBounds(10, 230, 440, 20); $f.Controls.Add($pct)
  $detail = New-Object Windows.Forms.Label
  $detail.Text = ''; $detail.ForeColor = $muted; $detail.BackColor = [Drawing.Color]::Transparent; $detail.TextAlign = 'MiddleCenter'
  $detail.Font = New-Object Drawing.Font('Leelawadee UI', 8.5); $detail.SetBounds(10, 252, 440, 20); $f.Controls.Add($detail)
  $btn = New-Object Windows.Forms.Button
  $btn.Text = 'ปิด'; $btn.SetBounds(180, 284, 100, 32); $btn.Visible = $false; $btn.FlatStyle = 'Flat'
  $btn.BackColor = $pink; $btn.ForeColor = [Drawing.Color]::White; $btn.FlatAppearance.BorderSize = 0
  $btn.Add_Click({ $st.canClose = $true; $this.FindForm().Close() }.GetNewClosure()); $f.Controls.Add($btn)
  $credit = New-Object Windows.Forms.Label
  $credit.Text = 'สร้างโดย HXZ !'; $credit.ForeColor = $muted; $credit.BackColor = [Drawing.Color]::Transparent
  $credit.Font = New-Object Drawing.Font('Leelawadee UI', 8); $credit.AutoSize = $true; $credit.Left = 8; $credit.Top = 308; $f.Controls.Add($credit)
  $f.Add_FormClosing({ param($s, $e) if (-not $st.canClose) { $e.Cancel = $true } }.GetNewClosure())
  # animation: the icon hops, hearts float up, the cute line changes now and then
  $timer = New-Object Windows.Forms.Timer
  $timer.Interval = 33
  $timer.Add_Tick({
    $st.tick++
    $t = ($st.tick % 34) / 34.0
    $pic.Top = 34 - [int]([Math]::Abs([Math]::Sin($t * [Math]::PI)) * 16)
    foreach ($h in $hearts) { $h.Top -= 1; if ($h.Top -lt -20) { $h.Top = 330 } }
    if ($st.rotate -and ($st.tick % 75) -eq 0) { $st.line++; $sub.Text = $lines[$st.line % $lines.Count] }
  }.GetNewClosure())
  $timer.Start()
  $f.Show(); [System.Windows.Forms.Application]::DoEvents()
  return @{ form = $f; title = $title; sub = $sub; fill = $fill; pct = $pct; detail = $detail; btn = $btn; timer = $timer }
}
function Ui-Pump { if ($ui) { [System.Windows.Forms.Application]::DoEvents() } }
function Ui-Progress($p, $detailText) {
  if (-not $ui) { return }
  $p = [Math]::Max(0, [Math]::Min(1, $p))
  $ui.fill.Width = [Math]::Max(8, [int](360 * $p)); $ui.pct.Text = ('{0}%' -f [int]($p * 100))
  if ($detailText -ne $null) { $ui.detail.Text = $detailText }
  Ui-Pump
}
function Step($t, $p = $null) {
  Write-Host ''; Write-Host "  $t" -ForegroundColor Magenta
  if ($ui) { $ui.detail.Text = $t; if ($p -ne $null) { Ui-Progress $p $null } else { Ui-Pump } }
}
# download with a progress bar (between $from and $to of the whole install)
function Get-WithProgress($url, $out, $from, $to) {
  $req = [Net.HttpWebRequest]::Create($url); $req.UserAgent = 'KuminBonk-Installer'
  $res = $req.GetResponse(); $total = $res.ContentLength
  $in = $res.GetResponseStream(); $fs = [IO.File]::Create($out)
  try {
    $buf = New-Object byte[] 65536; $done = 0; $last = [DateTime]::Now
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $fs.Write($buf, 0, $n); $done += $n
      if (([DateTime]::Now - $last).TotalMilliseconds -gt 60) {
        $last = [DateTime]::Now
        if ($total -gt 0) { Ui-Progress ($from + ($to - $from) * $done / $total) ('ดาวน์โหลดตัวรันโปรแกรม {0:N1} / {1:N1} MB' -f ($done / 1MB), ($total / 1MB)) } else { Ui-Pump }
      }
    }
  } finally { $fs.Close(); $in.Close(); $res.Close() }
}

# The installer starts hidden (no black window). If the pink window can't be shown, bring the console back instead.
try { Add-Type -Name ConsoleWin -Namespace KuminBonk -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);' } catch {}
function Show-Console($show) { try { [KuminBonk.ConsoleWin]::ShowWindow([KuminBonk.ConsoleWin]::GetConsoleWindow(), $(if ($show) { 5 } else { 0 })) | Out-Null } catch {} }
try { $ui = New-CuteWindow } catch { $ui = $null }
Show-Console (-not $ui)

try {
  Write-Host ''
  Write-Host '  ======================================' -ForegroundColor Magenta
  Write-Host "     ติดตั้ง KuminBonk v$appVersion" -ForegroundColor Magenta
  Write-Host '  ======================================' -ForegroundColor Magenta

  Step 'ปิด KuminBonk ที่เปิดอยู่ (ถ้ามี)...' 0.02
  Get-Process -Name KuminBonk, node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dest\*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500

  Step 'คัดลอกไฟล์โปรแกรม...' 0.05
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $vdir = Join-Path $dest "versions\$appVersion"
  if (Test-Path $vdir) { Remove-Item -Recurse -Force $vdir }
  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'versions') | Out-Null
  Copy-Item -Recurse -Force (Join-Path $src 'app') $vdir
  Set-Content -Path (Join-Path $vdir '.complete') -Value $appVersion -NoNewline
  Set-Content -Path (Join-Path $dest 'current.txt') -Value $appVersion -NoNewline
  if (Test-Path (Join-Path $dest 'app')) { Remove-Item -Recurse -Force (Join-Path $dest 'app') }  # layout of v1.3
  Copy-Item -Force (Join-Path $src 'icon.ico'), (Join-Path $src 'uninstall.ps1'), (Join-Path $src 'launch.cjs'), (Join-Path $src 'KuminBonk.exe') $dest

  $needNode = $true
  if (Test-Path $node) { if ((Get-Item $node).VersionInfo.ProductVersion -like '22.*') { $needNode = $false } }
  if ($needNode) {
    Step 'ดาวน์โหลด Node.js (ตัวรันโปรแกรม ~30 MB) จาก nodejs.org ... รอสักครู่' 0.1
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    New-Item -ItemType Directory -Force -Path (Split-Path $node) | Out-Null
    $tmp = "$node.download"
    $ok = $false
    foreach ($base in @('https://nodejs.org/dist/v22.22.0', 'https://nodejs.org/dist/latest-v22.x')) {
      try {
        Get-WithProgress "$base/win-x64/node.exe" $tmp 0.1 0.85
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
    Step 'ตรวจไฟล์ถูกต้องแล้ว (SHA-256 ตรงกับ nodejs.org)' 0.88
    Move-Item -Force $tmp $node
  }

  Step 'สร้างทางลัดบนเดสก์ท็อปและเมนู Start...' 0.92
  $ws = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $s = $ws.CreateShortcut((Join-Path $d 'KuminBonk.lnk'))
    $s.TargetPath = $exe
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
  Set-ItemProperty $key -Name Publisher -Value 'HXZ !'
  Set-ItemProperty $key -Name DisplayIcon -Value "$dest\icon.ico"
  Set-ItemProperty $key -Name InstallLocation -Value $dest
  Set-ItemProperty $key -Name UninstallString -Value $un
  Set-ItemProperty $key -Name NoModify -Value 1 -Type DWord
  Set-ItemProperty $key -Name NoRepair -Value 1 -Type DWord

  Step 'ติดตั้งเสร็จแล้ว! กำลังเปิด KuminBonk ...' 1
  if ($ui) { $state.rotate = $false; $ui.title.Text = 'ติดตั้งเสร็จแล้ว!'; $ui.sub.Text = 'กำลังเปิด KuminBonk ให้นะ ' + [char]0x2665; Ui-Pump }
  Start-Process -FilePath $exe -WorkingDirectory $dest
  $until = (Get-Date).AddSeconds(3)
  while ((Get-Date) -lt $until) { Ui-Pump; Start-Sleep -Milliseconds 30 }
  if ($ui) { $state.canClose = $true; $ui.timer.Stop(); $ui.form.Close() }
  exit 0
} catch {
  $msg = $_.Exception.Message
  Write-Host ''
  Write-Host "  ติดตั้งไม่สำเร็จ: $msg" -ForegroundColor Red
  Write-Host ''
  if ($ui) {
    try {
      $state.rotate = $false; $ui.timer.Stop()
      $ui.title.Text = 'ติดตั้งไม่สำเร็จ'; $ui.title.ForeColor = [Drawing.Color]::FromArgb(229, 72, 77)
      $ui.sub.Text = 'ลองเช็กอินเทอร์เน็ต แล้วกดติดตั้งใหม่อีกครั้งนะ'; $ui.detail.Text = $msg
      $ui.btn.Visible = $true; $state.canClose = $true
      while ($ui.form.Visible) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 40 }
    } catch {}
    exit 2   # the window already showed the error
  }
  Show-Console $true
  Read-Host '  กด Enter เพื่อปิด' | Out-Null
  exit 1
}
