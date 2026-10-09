// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// The KuminBonk installer: one .exe with a cute pink window (like a game launcher's updater).
// It unpacks the app (embedded payload.zip), downloads the official Node.js runtime from nodejs.org
// (SHA-256 verified), makes the Desktop / Start menu shortcuts and registers the app in Settings → Apps.
// Built on Linux with Mono's mcs for .NET Framework 4.x (built into Windows 10/11): see tools/build-setup.sh
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("KuminBonk")]
[assembly: AssemblyProduct("KuminBonk")]
[assembly: AssemblyCompany("HXZ !")]
[assembly: AssemblyCopyright("Copyright (c) 2026 HXZ !")]

static class Program {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  [STAThread]
  static void Main() {
    try { if (Environment.OSVersion.Platform == PlatformID.Win32NT) SetProcessDPIAware(); } catch { }
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new SetupForm());
  }
}

class SetupForm : Form {
  static readonly Color Pink = Color.FromArgb(255, 79, 139), Ink = Color.FromArgb(59, 34, 54), Muted = Color.FromArgb(138, 111, 131);
  static readonly Color Bg = Color.FromArgb(255, 240, 246), Track = Color.FromArgb(251, 227, 236), Red = Color.FromArgb(229, 72, 77);
  static readonly string[] Lines = { "กำลังจัดห้องให้น้องใหม่~", "ปัดฝุ่นนิดนึงนะ", "ห่อของขวัญอยู่ รอแป๊บ", "อีกนิดเดียว ฮึบ!", "ใกล้แล้วว" };

  readonly float k;            // DPI scale
  int S(double v) { return (int)Math.Round(v * k); }
  readonly PictureBox pic;
  readonly Label title, sub, pct, detail;
  readonly Panel track, fill;
  readonly Button btn;
  class Heart { public float X, Y, Speed; public Font Font; public Brush Brush; }
  readonly List<Heart> hearts = new List<Heart>();
  readonly System.Windows.Forms.Timer timer;
  int tick, line;
  bool rotate = true, canClose;
  string version = "?", dest, exe, node;

  public SetupForm() {
    using (var g = CreateGraphics()) k = g.DpiX / 96f;
    Text = "ติดตั้ง KuminBonk";
    ClientSize = new Size(S(460), S(330));
    StartPosition = FormStartPosition.CenterScreen;
    FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
    BackColor = Bg; Font = new Font("Leelawadee UI", 10f);
    DoubleBuffered = true;
    try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

    Color[] hc = { Color.FromArgb(255, 179, 205), Color.FromArgb(255, 134, 176), Color.FromArgb(255, 210, 63) };
    for (int i = 0; i < 8; i++)
      hearts.Add(new Heart { X = S(18 + i * 56), Y = S(40 + (i * 97) % 280), Font = new Font("Segoe UI Symbol", 10 + (i % 3) * 4), Brush = new SolidBrush(hc[i % 3]), Speed = 0.6f + (i % 3) * 0.35f });
    pic = new PictureBox { SizeMode = PictureBoxSizeMode.Zoom, Size = new Size(S(84), S(84)), Left = S(188), Top = S(34), BackColor = Color.Transparent };
    try { pic.Image = Image.FromStream(Res("icon.png")); } catch { }
    Controls.Add(pic);
    title = Lbl("กำลังติดตั้ง KuminBonk", new Font("Leelawadee UI", 15f, FontStyle.Bold), Ink, 132, 34);
    sub = Lbl(Lines[0], Font, Muted, 168, 24);
    track = new Panel { Bounds = new Rectangle(S(50), S(210), S(360), S(16)), BackColor = Track };
    fill = new Panel { Bounds = new Rectangle(0, 0, S(8), S(16)), BackColor = Pink };
    track.Controls.Add(fill); Controls.Add(track);
    pct = Lbl("0%", new Font("Leelawadee UI", 9f, FontStyle.Bold), Pink, 230, 20);
    detail = Lbl("", new Font("Leelawadee UI", 8.5f), Muted, 252, 20);
    btn = new Button { Text = "ปิด", Bounds = new Rectangle(S(180), S(282), S(100), S(34)), Visible = false, FlatStyle = FlatStyle.Flat,
      BackColor = Pink, ForeColor = Color.White, Cursor = Cursors.Hand };
    btn.FlatAppearance.BorderSize = 0;
    btn.Click += (s, e) => { canClose = true; Close(); };
    Controls.Add(btn);
    var credit = new Label { Text = "สร้างโดย HXZ !", ForeColor = Muted, BackColor = Color.Transparent, AutoSize = true,
      Font = new Font("Leelawadee UI", 8f), Left = S(8), Top = S(306) };
    Controls.Add(credit);
    pic.BringToFront(); title.BringToFront(); sub.BringToFront(); track.BringToFront(); pct.BringToFront(); detail.BringToFront(); btn.BringToFront();

    FormClosing += (s, e) => { if (!canClose) e.Cancel = true; };
    timer = new System.Windows.Forms.Timer { Interval = 33 };
    timer.Tick += (s, e) => {
      tick++;
      double t = (tick % 34) / 34.0;
      pic.Top = S(34) - (int)(Math.Abs(Math.Sin(t * Math.PI)) * S(16));
      foreach (var h in hearts) { h.Y -= h.Speed * k; if (h.Y < -S(24)) h.Y = S(330); }
      Invalidate();
      if (rotate && tick % 75 == 0) { line++; sub.Text = Lines[line % Lines.Length]; }
    };
    timer.Start();
    Shown += (s, e) => new Thread(Work) { IsBackground = true }.Start();
  }

  // floating hearts are painted on the window itself, so they show through the see-through labels
  protected override void OnPaint(PaintEventArgs e) {
    base.OnPaint(e);
    e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
    foreach (var h in hearts) e.Graphics.DrawString("\u2665", h.Font, h.Brush, h.X, h.Y);
  }

  Label Lbl(string text, Font f, Color c, int top, int h) {
    var l = new Label { Text = text, Font = f, ForeColor = c, BackColor = Color.Transparent, TextAlign = ContentAlignment.MiddleCenter,
      Bounds = new Rectangle(S(10), S(top), S(440), S(h)) };
    Controls.Add(l); return l;
  }
  static Stream Res(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }

  // ---------- UI updates from the worker thread ----------
  void Ui(Action a) { try { if (IsHandleCreated) BeginInvoke(a); } catch { } }
  void Progress(double p, string d) {
    p = Math.Max(0, Math.Min(1, p));
    Ui(() => { fill.Width = Math.Max(S(8), (int)(track.Width * p)); pct.Text = (int)(p * 100) + "%"; if (d != null) detail.Text = d; });
  }
  void Step(string d, double p) { Progress(p, d); }

  // ---------- the actual install ----------
  static bool IsWindows { get { return Environment.OSVersion.Platform == PlatformID.Win32NT; } }
  static string Env(string k) { return Environment.GetEnvironmentVariable(k); }

  void Work() {
    try {
      using (var r = new StreamReader(Res("version.txt"))) version = r.ReadToEnd().Trim();
      Ui(() => Text = "ติดตั้ง KuminBonk v" + version);
      dest = Env("KB_SETUP_DEST") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "KuminBonk");
      exe = Path.Combine(dest, "KuminBonk.exe");            // small starter (no console window)
      node = Path.Combine(dest, "node", "node.exe");       // official Node.js, never modified

      Step("ปิด KuminBonk ที่เปิดอยู่ (ถ้ามี)...", 0.02);
      foreach (var p in Process.GetProcessesByName("KuminBonk").Concat(Process.GetProcessesByName("node"))) {
        try { if (p.MainModule.FileName.StartsWith(dest + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(3000); } } catch { }
      }

      Step("คัดลอกไฟล์โปรแกรม...", 0.04);
      Directory.CreateDirectory(Path.Combine(dest, "versions"));
      string vdir = Path.Combine(dest, "versions", version);
      if (Directory.Exists(vdir)) Directory.Delete(vdir, true);
      using (var zip = new ZipArchive(Res("payload.zip"), ZipArchiveMode.Read)) {
        int n = 0, total = zip.Entries.Count;
        foreach (var e in zip.Entries) {
          n++;
          if (string.IsNullOrEmpty(e.Name)) continue; // folder
          string rel = e.FullName.Replace('/', Path.DirectorySeparatorChar);
          if (rel.Contains("..")) throw new Exception("bad file in installer");
          string outPath;
          if (rel.StartsWith("app" + Path.DirectorySeparatorChar)) outPath = Path.Combine(vdir, rel.Substring(4));
          else outPath = Path.Combine(dest, rel);           // icon.ico, uninstall.ps1, launch.cjs
          Directory.CreateDirectory(Path.GetDirectoryName(outPath));
          using (var src = e.Open()) using (var o = File.Create(outPath)) src.CopyTo(o);
          if (n % 20 == 0) Progress(0.04 + 0.06 * n / total, null);
        }
      }
      File.WriteAllText(Path.Combine(vdir, ".complete"), version);
      File.WriteAllText(Path.Combine(dest, "current.txt"), version);
      string oldApp = Path.Combine(dest, "app"); if (Directory.Exists(oldApp)) Directory.Delete(oldApp, true); // layout of v1.3

      // the starter (replaces the KuminBonk.exe of older versions)
      using (var r = Res("launcher.exe")) using (var o = File.Create(exe)) r.CopyTo(o);

      bool needNode = true;
      if (File.Exists(node)) { try { if ((FileVersionInfo.GetVersionInfo(node).ProductVersion ?? "").StartsWith("22.")) needNode = false; } catch { } }
      if (needNode) {
        Step("ดาวน์โหลดตัวรันโปรแกรม (Node.js) จาก nodejs.org...", 0.1);
        GetNode();
      }

      Step("สร้างทางลัดบนเดสก์ท็อปและเมนู Start...", 0.93);
      if (IsWindows && Env("KB_SETUP_DEST") == null) { MakeShortcuts(); Register(); }

      Step("ติดตั้งเสร็จแล้ว!", 1);
      Ui(() => { rotate = false; title.Text = "ติดตั้งเสร็จแล้ว!"; sub.Text = "กำลังเปิด KuminBonk ให้นะ ♥"; });
      if (IsWindows && Env("KB_SETUP_NOLAUNCH") == null)
        Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = dest, UseShellExecute = false });
      Thread.Sleep(2500);
      Ui(() => { canClose = true; Close(); });
    } catch (Exception ex) {
      Ui(() => {
        rotate = false; timer.Stop();
        title.Text = "ติดตั้งไม่สำเร็จ"; title.ForeColor = Red;
        sub.Text = "ลองเช็กอินเทอร์เน็ต แล้วเปิดตัวติดตั้งใหม่อีกครั้งนะ";
        detail.Text = ex.Message; btn.Visible = true; canClose = true;
      });
    }
  }

  void GetNode() {
    try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; } catch { } // TLS 1.2
    Directory.CreateDirectory(Path.GetDirectoryName(node));
    string tmp = node + ".download";
    string[] bases = (Env("KB_SETUP_NODE_BASE") ?? "https://nodejs.org/dist/v22.22.0;https://nodejs.org/dist/latest-v22.x").Split(new[] { ';' });
    foreach (var b in bases) {
      try {
        Download(b + "/win-x64/node.exe", tmp, 0.1, 0.88);
        string sums = Fetch(b + "/SHASUMS256.txt");
        string want = sums.Split(new[] { '\n' }).Select(l => l.Trim()).Where(l => l.EndsWith(" win-x64/node.exe")).Select(l => l.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant()).FirstOrDefault();
        string got;
        using (var sha = SHA256.Create()) using (var f = File.OpenRead(tmp)) got = BitConverter.ToString(sha.ComputeHash(f)).Replace("-", "").ToLowerInvariant();
        if (want == null || want != got) { Step("ไฟล์ไม่ตรงกับลายเซ็นของ nodejs.org ลองแหล่งถัดไป...", 0.1); continue; }
        Step("ตรวจไฟล์ถูกต้องแล้ว (SHA-256 ตรงกับ nodejs.org)", 0.9);
        if (File.Exists(node)) File.Delete(node);
        File.Move(tmp, node);
        return;
      } catch (Exception) {
        Step("ดาวน์โหลดจาก " + b + " ไม่ได้ ลองแหล่งถัดไป...", 0.1);
      }
    }
    try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
    throw new Exception("ดาวน์โหลด Node.js ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }

  static HttpWebRequest Req(string url) {
    var r = (HttpWebRequest)WebRequest.Create(url);
    r.UserAgent = "KuminBonk-Setup"; r.Timeout = 30000; r.ReadWriteTimeout = 60000;
    return r;
  }
  static string Fetch(string url) {
    using (var res = Req(url).GetResponse()) using (var s = new StreamReader(res.GetResponseStream(), Encoding.ASCII)) return s.ReadToEnd();
  }
  void Download(string url, string outPath, double from, double to) {
    using (var res = (HttpWebResponse)Req(url).GetResponse())
    using (var input = res.GetResponseStream())
    using (var o = File.Create(outPath)) {
      long total = res.ContentLength, done = 0;
      var buf = new byte[65536]; int n; var last = DateTime.MinValue;
      while ((n = input.Read(buf, 0, buf.Length)) > 0) {
        o.Write(buf, 0, n); done += n;
        if ((DateTime.Now - last).TotalMilliseconds > 80) {
          last = DateTime.Now;
          if (total > 0) Progress(from + (to - from) * done / total, string.Format("ดาวน์โหลดตัวรันโปรแกรม {0:0.0} / {1:0.0} MB", done / 1048576.0, total / 1048576.0));
        }
      }
    }
  }

  // Desktop + Start menu shortcuts through the Windows Script Host COM object (no extra libraries needed)
  void MakeShortcuts() {
    var shellType = Type.GetTypeFromProgID("WScript.Shell");
    object shell = Activator.CreateInstance(shellType);
    foreach (var dir in new[] { Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.Programs) }) {
      object lnk = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { Path.Combine(dir, "KuminBonk.lnk") });
      var t = lnk.GetType();
      t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exe });
      t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { dest });
      t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { Path.Combine(dest, "icon.ico") + ",0" });
      t.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { "KuminBonk - ของขวัญ TikTok สู่ VTube Studio" });
      t.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
    }
  }

  // Show up in Settings → Apps so it can be uninstalled like any app
  void Register() {
    using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KuminBonk")) {
      key.SetValue("DisplayName", "KuminBonk");
      key.SetValue("DisplayVersion", version);
      key.SetValue("Publisher", "HXZ !");
      key.SetValue("DisplayIcon", Path.Combine(dest, "icon.ico"));
      key.SetValue("InstallLocation", dest);
      key.SetValue("UninstallString", "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(dest, "uninstall.ps1") + "\"");
      key.SetValue("NoModify", 1, Microsoft.Win32.RegistryValueKind.DWord);
      key.SetValue("NoRepair", 1, Microsoft.Win32.RegistryValueKind.DWord);
    }
  }
}
