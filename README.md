# KuminBonk

**สร้างโดย HXZ !** · © 2026 HXZ ! — สงวนลิขสิทธิ์ ([เงื่อนไขการใช้งาน](LICENSE))

ของขวัญจาก TikTok LIVE → ตัวละครใน VTube Studio มีท่าตามของขวัญ (โดนปา, รถชน, หมวกหล่นใส่หัว, เครื่องดนตรี, ฯลฯ)
ทำมาสำหรับ TikTok LIVE Studio (ไม่ต้องใช้ OBS) — ของที่ปาบินอยู่ในหน้าต่าง VTube Studio เลย

- อ่านไลฟ์ผ่าน [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) (ไม่ต้องใช้รหัสผ่าน TikTok)
- ควบคุมโมเดลผ่าน [VTube Studio API](https://github.com/DenchiSoft/VTubeStudio)
- หน้าตั้งค่าภาษาไทย: กฎของขวัญ, ตั้งค่าแยกตามหมวดของขวัญ, เล็งหัว, ทดสอบ
- รูปของขวัญจริง 258 ชิ้น · ท่าตามของขวัญ 26 แบบ · ของแพงรูปใหญ่ขึ้น + โชว์กลางจอ
- **เป้าแยกตามหมวด/ชิ้น**: ขนมเข้าปาก, สร้อยที่คอ, รถชนที่ตัว — ลากตั้งเองได้
- 💬 อ่านแชตไลฟ์ออกเสียง หลายเสียง ทุกภาษา + คำต้องห้าม · 🎨 ธีมชมพู / ขาว / ดำ / น้ำเงิน
- อัปเดตอัตโนมัติ ตรวจก่อนใช้ สำรองการตั้งค่า ย้อนเวอร์ชันได้

## เวอร์ชัน
- เวอร์ชันปัจจุบัน: **v1.9.0** — ดู [ประวัติเวอร์ชัน](CHANGELOG.md)
- เวอร์ชันที่จะมา: ดู [แผนเวอร์ชันถัดไป](ROADMAP.md)

## อัปเดตอัตโนมัติ
แอปที่ติดตั้งแล้วจะเช็กโฟลเดอร์ [`updates/`](updates) ของที่เก็บนี้ทุกครั้งที่เปิด แล้วดาวน์โหลดเวอร์ชันใหม่ให้เอง
(`latest.json` บอกเวอร์ชันล่าสุด + ลายเซ็น SHA-256, ไฟล์ `update-<เวอร์ชัน>.json.gz` คือโค้ดชุดใหม่)

ออกเวอร์ชันใหม่: แก้ `VERSION` ใน `src/server.js` และ CHANGELOG → `npm run build` → `node tools/make-update.mjs <เวอร์ชัน>` → commit + push

รูปของขวัญ TikTok ไม่ได้อยู่ในที่เก็บนี้ (เป็นของ TikTok) — มาจากตัวติดตั้งของผู้ใช้เอง

## พัฒนา
```
npm install
node src/server.js          # เปิดที่ http://localhost:3939
node test/mock-vts.js       # VTube Studio จำลองสำหรับทดสอบ
node tools/make-update.mjs <version>   # สร้างไฟล์อัปเดตใน updates/
python3 tools/build-setup.py <version> # ตัวติดตั้ง .exe ไฟล์เดียว (ต้องมี mono-mcs)
python3 tools/package.py <version>     # แบบ zip
```

## ลิขสิทธิ์
KuminBonk สร้างโดย **HXZ !** — Copyright © 2026 HXZ ! All rights reserved.
ใช้ในไลฟ์ของตัวเองได้ฟรี ห้ามแจกต่อ ขาย หรือแก้แล้วเผยแพร่โดยไม่ได้รับอนุญาต ดูรายละเอียดใน [LICENSE](LICENSE)
ไลบรารีของผู้อื่นที่ใช้อยู่ภายใต้สัญญาอนุญาตของแต่ละราย: [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)
