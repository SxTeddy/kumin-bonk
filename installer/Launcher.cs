// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// KuminBonk.exe: a tiny starter. It runs the official, unmodified Node.js (node\node.exe) with
// launch.cjs, without a black console window, and then exits. Built with tools/build-setup.py.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("KuminBonk")]
[assembly: AssemblyProduct("KuminBonk")]
[assembly: AssemblyCompany("HXZ !")]
[assembly: AssemblyCopyright("Copyright (c) 2026 HXZ !")]

static class Launcher {
  [STAThread]
  static int Main() {
    string root = AppDomain.CurrentDomain.BaseDirectory;
    string node = Path.Combine(root, "node", "node.exe");
    string launch = Path.Combine(root, "launch.cjs");
    if (!File.Exists(node) || !File.Exists(launch)) {
      MessageBox.Show("ไฟล์ของ KuminBonk ไม่ครบ ลองติดตั้งใหม่อีกครั้งนะ", "KuminBonk", MessageBoxButtons.OK, MessageBoxIcon.Warning);
      return 1;
    }
    var psi = new ProcessStartInfo(node, "\"" + launch + "\"") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true };
    psi.EnvironmentVariables["KB_INSTALL"] = root.TrimEnd('\\', '/');
    try { Process.Start(psi); return 0; }
    catch (Exception e) { MessageBox.Show("เปิด KuminBonk ไม่ได้: " + e.Message, "KuminBonk", MessageBoxButtons.OK, MessageBoxIcon.Warning); return 1; }
  }
}
