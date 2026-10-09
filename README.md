# KuminBonk

ของขวัญจาก TikTok LIVE → ตัวละครใน VTube Studio มีท่าตามของขวัญ (โดนปา, รถชน, หมวกหล่นใส่หัว, เครื่องดนตรี, ฯลฯ)
ทำมาสำหรับ TikTok LIVE Studio (ไม่ต้องใช้ OBS) — ของที่ปาบินอยู่ในหน้าต่าง VTube Studio เลย

- อ่านไลฟ์ผ่าน [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) (ไม่ต้องใช้รหัสผ่าน TikTok)
- ควบคุมโมเดลผ่าน [VTube Studio API](https://github.com/DenchiSoft/VTubeStudio)
- หน้าตั้งค่าภาษาไทย: กฎของขวัญ, ตั้งค่าแยกตามหมวดของขวัญ, เล็งหัว, ทดสอบ

## เวอร์ชัน
- เวอร์ชันปัจจุบัน: **v1.4.0** — ดู [ประวัติเวอร์ชัน](CHANGELOG.md)
- เวอร์ชันที่จะมา: ดู [แผนเวอร์ชันถัดไป](ROADMAP.md)

## อัปเดตอัตโนมัติ
แอปที่ติดตั้งแล้วจะเช็ก [Releases](../../releases) ของที่เก็บนี้ทุกครั้งที่เปิด แล้วดาวน์โหลดเวอร์ชันใหม่ให้เอง
(ไฟล์ `update.json.gz` + ลายเซ็น SHA-256 `update.sha256`)

รูปของขวัญ TikTok ไม่ได้อยู่ในที่เก็บนี้ (เป็นของ TikTok) — มาจากตัวติดตั้งของผู้ใช้เอง

## พัฒนา
```
npm install
node src/server.js          # เปิดที่ http://localhost:3939
node test/mock-vts.js       # VTube Studio จำลองสำหรับทดสอบ
node tools/make-update.mjs <version>   # สร้างไฟล์อัปเดต
```
