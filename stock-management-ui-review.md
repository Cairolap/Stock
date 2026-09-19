# UI/UX Review: Stock Management — ลดความรกและยกระดับความเป็นมืออาชีพ

**สถานะ:** Implemented + Visual QA  
**วันที่:** 19 กันยายน 2026  
**ไฟล์ที่ตรวจ:** `public/index.html`, `public/styles.css`, `public/app.js`, `DESIGN.md`, `UX-CONTRACT.md`  
**ขอบเขต:** ตรวจ source UI และทดสอบหน้าใช้งานจริงทั้ง desktop และ mobile viewport 390px

## สถานะหลังปรับปรุง

- ยุบ KPI หลายสีเป็นแผง `ต้องจัดการวันนี้` จุดเดียว
- เพิ่ม `ทำรายการ` เป็นทางเข้ากลางสำหรับรับเข้า เบิกออก และเช็คสต๊อก
- เปลี่ยนรายการวัสดุเป็น Stock Rail พร้อม action เดียวต่อการ์ด
- ลดสีเหลือ Brand teal และ semantic colors เฉพาะสถานะ
- ตัด emoji จาก production UI และลด glow, shadow, radius ที่เกินจำเป็น
- แก้ horizontal overflow ที่พบระหว่างตรวจ viewport 390px
- ผ่าน automated tests 28 รายการ, syntax check และ premium strict audit โดยไม่มี finding

## 1. Intent

เป้าหมายของ UI คือช่วยพนักงานคลังและช่างค้นหาวัสดุ ดูยอด รับเข้า เบิกออก และตรวจนับบนโทรศัพท์ให้เร็ว โดยสถานะผิดปกติต้องเห็นทันทีโดยไม่ทำให้หน้าจอดูวุ่นวาย

### ทางเลือกที่เรียบง่ายกว่า

ไม่ควรแก้ความรกด้วยการจัดการ์ดใหม่หรือเพิ่มพื้นที่ว่างอย่างเดียว ควรลดจำนวนสิ่งที่พยายามเด่นพร้อมกัน:

1. ใช้สี Brand เพียงสีเดียวสำหรับ interaction
2. ใช้สีสถานะเฉพาะข้อมูลผิดปกติ ไม่ใช้เป็นสีประจำทุกปุ่ม
3. ตัด FAB รับเข้า/เบิกออกที่ซ้ำกับ navigation แล้วแทนด้วยปุ่มเดียว `ทำรายการ`
4. เปลี่ยน Dashboard จากการ์ดสรุป 4 สีเป็นจุดตัดสินใจเดียว `ต้องจัดการวันนี้`
5. ให้ “แถบระดับสต๊อก” เป็นลายเซ็นภาพเพียงจุดเดียวของระบบ

นี่เป็นการเปลี่ยนโครงลำดับความสำคัญ ไม่ใช่การตกแต่งเพิ่ม

## 2. Findings

### [MAJOR] 1. สีเด่นมากเกินไปและความหมายทับกัน

**Finding:** ระบบกำหนด Brand 1 สี, สถานะ 5 สี และ action อีก 3 สี รวมอย่างน้อย 9 สีที่มีน้ำหนักใกล้เคียงกัน

**Why it matters:** ผู้ใช้แยกไม่ได้ว่าสีใดหมายถึง “กดได้”, “สถานะ”, “อันตราย” หรือ “หมวดงาน” ทำให้หน้าดูรกและใช้เวลาตีความนานขึ้น โดยเฉพาะกลางแจ้งหรือขณะถือโทรศัพท์มือเดียว

**Evidence:** `stock-management-spec.md:64-78` กำหนดสีสถานะ 5 ชุดและ action 3 ชุดแยกจาก Brand; `stock-management-mobile-plan.md:118-119` นำสีเหล่านี้ไปใช้กับการ์ดและปุ่มขนาดใหญ่พร้อมกัน

**Suggested change:**

- ใช้ Deep Teal เป็น Brand/interaction เพียงสีเดียว
- ใช้ Amber สำหรับ `ถึง Min`
- ใช้ Red สำหรับ `หมด/ติดลบ/ลบข้อมูล` โดยแยกด้วยข้อความและไอคอน ไม่เพิ่มชมพูอีกสี
- ใช้ Violet เฉพาะบริบทตรวจนับ เช่น header บาง ๆ หรือ progress ไม่ใช้กับปุ่มทั่วไป
- สถานะ `ปกติ` ใช้ข้อความสี Ink + จุดเขียวเล็ก ไม่ใช้พื้นการ์ดเขียว
- สถานะ `เกิน Max` ใช้ข้อความรองหรือไอคอนข้อมูล ไม่ต้องเป็นสีเด่นเท่าความเสี่ยง

### [MAJOR] 2. Navigation และ action ซ้ำกัน

**Finding:** Mobile มี Bottom navigation 4 เมนูพร้อม Floating Action Buttons สำหรับรับเข้าและเบิกออก

**Why it matters:** พื้นที่ล่างของหน้าจอซึ่งเป็นพื้นที่สำคัญที่สุดถูกใช้โดยหลาย control พร้อมกัน เกิด visual collision และผู้ใช้ไม่แน่ใจว่าควรเริ่มงานจาก navigation, FAB หรือปุ่มบน Dashboard

**Evidence:** `stock-management-spec.md:126` ระบุ Bottom navigation พร้อม FAB สองปุ่ม; `stock-management-mobile-plan.md:106-119` กำหนด Bottom navigation และปุ่มรับเข้า/เบิกออกบนหน้าแรกซ้ำอีกชุด

**Suggested change:** ใช้ Bottom navigation เพียง 4 จุด:

`หน้าแรก` · `วัสดุ` · **`ทำรายการ`** · `ประวัติ`

ปุ่ม `ทำรายการ` เปิด Bottom Sheet ที่มี 3 ตัวเลือก: `รับเข้า`, `เบิกออก`, `เช็คสต๊อก` หากมีรอบตรวจนับค้าง ให้แสดงการ์ด `ทำต่อ` บนหน้าแรกแทนการเพิ่มเมนูถาวร

### [MAJOR] 3. Dashboard เป็นชุด widget มากกว่าหน้าตัดสินใจ

**Finding:** หน้าแรกเริ่มด้วยการ์ดสรุป 4 สี ปุ่มใหญ่ 2 ปุ่ม และรายการเร่งด่วน ทำให้ทุกองค์ประกอบมีน้ำหนักสูงเท่ากัน

**Why it matters:** Dashboard ไม่ตอบคำถามหลักว่า “ตอนนี้ต้องทำอะไร” ผู้ใช้ต้องสแกนหลายกล่องก่อนลงมือ

**Evidence:** `stock-management-mobile-plan.md:115-120` ระบุ summary cards สี่ใบ ตามด้วยปุ่มใหญ่สองปุ่มและรายการต้องเติมด่วน

**Suggested change:** ให้หน้าแรกมีลำดับเดียว:

1. `ต้องจัดการวันนี้` — จำนวนรวมที่ต้องสนใจ
2. แถบย่อย `ติดลบ / หมด / ถึง Min` ที่กดกรองได้
3. รายการเร่งด่วน 5 รายการ
4. ประวัติล่าสุด 3 รายการ

ตัดการ์ด `วัสดุทั้งหมด` และ `รายการวันนี้` ออกจากพื้นที่บนสุด ย้ายเป็นข้อความสถิติรองด้านล่างหรือหน้า Report

### [MAJOR] 4. ภาษา visual เป็น generic dashboard

**Finding:** การ์ดมุมโค้ง 18px, shadow หลายระดับ, shimmer skeleton, spring motion, สีสดหลายกลุ่ม และ floating controls เป็นชุด pattern ที่พบใน dashboard template ทั่วไป

**Why it matters:** แม้แต่ละอย่างดูทันสมัย แต่เมื่อรวมกันจะให้ความรู้สึก “AI-generated SaaS dashboard” และไม่สะท้อนโลกของงานคลังจริง

**Evidence:** `stock-management-spec.md:86-93` กำหนด radius, shadows และ spring motion; `stock-management-spec.md:118` ใช้ shimmer; `stock-management-mobile-plan.md:165-167` ย้ำการ์ดโค้งและ motion ทั่วระบบ

**Suggested change:** ใช้ภาพลักษณ์ **“Inventory Control Label”**:

- แผงข้อมูลพื้นขาว เส้นขอบคม ไม่มี shadow ใน content ปกติ
- Radius 10px เป็นมาตรฐาน; 14px เฉพาะ Bottom Sheet
- Shadow ใช้เฉพาะ overlay และ sticky bottom bar
- Motion ใช้เฉพาะเปิด Bottom Sheet และ feedback หลังบันทึก
- Loading ใช้ spinner/placeholder คงพื้นที่ ไม่ต้อง shimmer ทุกการ์ด

### [MAJOR] 5. Emoji ทำให้ภาพลักษณ์ไม่สม่ำเสมอ

**Finding:** ตารางสถานะใช้ emoji เช่น 🚨, ⛔, ⚠️, ✅ และ ℹ️ เป็นไอคอน

**Why it matters:** Emoji มีรูปร่างและสีต่างกันตามระบบปฏิบัติการ ทำให้หน้าตาดูไม่ควบคุมและไม่เป็นระบบเดียวกัน

**Evidence:** `stock-management-spec.md:103-107`

**Suggested change:** ใช้ SVG icon family เดียว เช่น Lucide แบบ stroke 1.75px: `triangle-alert`, `circle-x`, `package-x`, `check`, `gauge`. สีเป็น currentColor และทุกไอคอนมี label ข้อความประกอบ

### [MINOR] 6. Typography ยังไม่มี hierarchy ที่เฉพาะกับงานคลัง

**Finding:** ใช้ Prompt เป็นหลักและ JetBrains Mono สำหรับข้อมูล แต่ยังไม่กำหนดบทบาท น้ำหนัก และขนาดที่ทำให้ Part Number กับจำนวนเด่นอย่างมีวินัย

**Why it matters:** หน้ารายการจำนวนมากจะดูเป็นก้อนข้อความคล้ายกัน และ Prompt เป็นตัวเลือกทั่วไปที่ไม่ได้สร้างบุคลิก industrial precision ตามที่สเปกอ้าง

**Evidence:** `stock-management-spec.md:81-82`

**Suggested change:**

- ใช้ `IBM Plex Sans Thai` น้ำหนัก 400/600 สำหรับ UI และ self-host เฉพาะ WOFF2 ที่ใช้
- ใช้ `IBM Plex Mono` เฉพาะ Part Number และตัวเลขจำนวน
- Part Number: 13px/600, letter spacing 0.02em
- Description: 15px/600, สูงสุด 2 บรรทัด
- Qty: 28px/600 แบบ tabular nums
- Metadata/Min/Max: 12–13px/400 สีรอง

หากไม่ต้องการเพิ่มไฟล์ฟอนต์ ให้ใช้ `Leelawadee UI` เป็นหลักและตัด Prompt ออก แทนการโหลดหลาย family

### [MINOR] 7. Quick stepper สี่ปุ่มทำให้ฟอร์มจำนวนแน่นเกินไป

**Finding:** ช่องจำนวนมี `-10`, `-1`, `+1`, `+10` พร้อม numeric keyboard

**Why it matters:** บนจอ 320–375px control ห้าชิ้นแย่งพื้นที่กันและเพิ่มโอกาสกดผิด โดยผู้ใช้ส่วนใหญ่สามารถพิมพ์จำนวนตรงได้เร็วกว่า

**Evidence:** `stock-management-spec.md:128`

**Suggested change:** ใช้เพียง `−`, input และ `+`; วาง shortcut `+10` เป็น chip เสริมใต้ช่องเฉพาะ flow รับเข้าที่มีการใช้จริงจากข้อมูลภาคสนาม

### [MINOR] 8. เป้าหมาย FCP ไม่สมจริงพอสำหรับ acceptance criterion

**Finding:** กำหนด FCP ต่ำกว่า 0.6 วินาทีบน 4G โดยไม่ระบุ device, latency, cold cache หรือเครื่องมือวัด

**Why it matters:** ทีมอาจลดคุณภาพฟอนต์/ภาพหรือทำ optimization ที่ไม่คุ้มเพื่อไล่ตัวเลขที่วัดซ้ำไม่ได้

**Evidence:** `stock-management-spec.md:23`

**Suggested change:** ใช้เป้าหมาย `LCP < 2.5s p75` บนอุปกรณ์ระดับกลางและ Fast 4G, initial JS gzip < 80KB และ interaction response หลังโหลด < 100ms

## 3. Revised Art Direction

### North Star

**Inventory Control Label** — หน้าตาเหมือนป้ายควบคุมวัสดุที่ออกแบบอย่างแม่นยำ: อ่านรหัสและจำนวนได้ในเสี้ยววินาที พื้นผิวสงบ สีปรากฏเฉพาะตรงที่ต้องตัดสินใจ

### สิ่งที่ต้องไม่เหมือน

- Dashboard สำเร็จรูปที่เต็มไปด้วย colorful cards
- แอป consumer ที่มี floating bubbles และ animation ทุกจุด
- ตาราง Excel ที่ย่อจนอ่านไม่ได้บนโทรศัพท์
- หน้าคลังที่ใช้สีแดง/เขียวเต็มพื้นจนเกิดความล้าทางสายตา

### ลายเซ็นภาพหนึ่งเดียว: Stock Rail

การ์ด Part แต่ละใบมีแถบแนวตั้งกว้าง 4px ด้านซ้าย แสดงสถานะปัจจุบัน และในหน้ารายละเอียดมี meter บาง ๆ แสดงตำแหน่ง `Qty` เทียบ `Min/Max` นี่เป็นจุดที่ใช้สีเด่น ส่วนพื้นการ์ดและปุ่มยังคงสงบ

## 4. Revised Token Direction

```css
:root {
  --canvas: #f3f6f6;
  --surface: #ffffff;
  --surface-subtle: #eaf0f0;
  --ink: #142326;
  --ink-muted: #617174;
  --line: #d7e0e1;

  --brand: #0d6878;
  --brand-hover: #095260;
  --brand-soft: #e5f3f5;

  --warning: #b86800;
  --warning-soft: #fff3d9;
  --danger: #c63f4c;
  --danger-soft: #fdebed;
  --count: #6856b8;
  --count-soft: #f0edfb;
  --success-dot: #34835b;

  --radius-control: 8px;
  --radius-panel: 10px;
  --radius-sheet: 14px;
  --touch-target: 48px;
}
```

กฎสำคัญ:

- หน้าเดียวมีพื้นที่สีอ่อนขนาดใหญ่ได้ไม่เกินหนึ่งจุด
- การ์ดข้อมูลไม่ใช้ gradient และไม่มี shadow
- ปุ่มหลักใช้ Brand เหมือนกันทุก workflow; ความหมายมาจาก label และ icon
- Danger ใช้เฉพาะยอดผิดปกติและ action ลบ ไม่ใช้กับปุ่ม `เบิกออก` ปกติ
- สีสถานะต้องกินพื้นที่ไม่เกินประมาณ 10% ของ viewport

## 5. Mobile Information Architecture ที่แนะนำ

### Bottom navigation

```text
┌─────────┬─────────┬────────────┬─────────┐
│ หน้าแรก │ วัสดุ   │ ทำรายการ  │ ประวัติ │
└─────────┴─────────┴────────────┴─────────┘
```

`ทำรายการ` เปิด Bottom Sheet:

```text
┌─────────────────────────────┐
│ ทำรายการ                   │
│ ┌─────────┐  ┌─────────┐   │
│ │ รับเข้า │  │ เบิกออก │   │
│ └─────────┘  └─────────┘   │
│ [ เช็คสต๊อก / ทำรอบต่อ ]   │
└─────────────────────────────┘
```

### หน้าแรก

```text
┌─────────────────────────────┐
│ Stock                 Sync ✓│
│ [ ค้นหา Part Number... ]   │
├─────────────────────────────┤
│ ต้องจัดการวันนี้       12   │
│ ติดลบ 2 · หมด 3 · ถึง Min 7│
├─────────────────────────────┤
│ เร่งด่วน                    │
│ ▌ BRG-6204            -3 ชิ้น│
│   Bearing 6204      [ติดลบ] │
│ ▌ BELT-A42             0 ชิ้น│
│   V-Belt A42      [หมดสต๊อก]│
│ [ดูทั้งหมด 12 รายการ]       │
├─────────────────────────────┤
│ การเคลื่อนไหวล่าสุด          │
│ รับเข้า +10 · BRG-6204      │
└─────────────────────────────┘
```

ไม่มีการ์ด KPI สี่สี ไม่มี FAB คู่ และไม่มี banner ถ้าไม่มีปัญหาจริง

### การ์ดวัสดุ

```text
┌─────────────────────────────┐
│▌ [รูป] BRG-6204       -3 ชิ้น│
│▌       Bearing 6204          │
│▌       SKF · ชั้น A-03      │
│▌       Min 4 / Max 20 [ติดลบ]│
└─────────────────────────────┘
```

- กดทั้งการ์ดเพื่อดูรายละเอียด
- การกระทำเร็วอยู่ในหน้า Detail หรือเมนู `ทำรายการ` ไม่วางปุ่มหลายอันบนทุกการ์ด
- รูป 56×56px, aspect ratio คงที่, placeholder เป็น outline icon
- Qty ชิดขวาและใหญ่ที่สุด รองจาก Part Number

## 6. Screen-by-Screen Reduction

| หน้าจอ | ตัดออก | คงไว้ / เพิ่ม |
|---|---|---|
| หน้าแรก | KPI cards 4 สี, FAB คู่, decorative greeting | Search, action summary, urgent list, recent movement |
| รายการวัสดุ | ปุ่ม action ทุกแถว, badge หลายสีเต็มใบ | Stock rail, Qty, Part Number, filter chips สูงสุด 4 ตัว |
| รายละเอียด | card ซ้อนหลายชั้น | ภาพ + identity block, stock meter, metadata list, sticky `ทำรายการ` |
| รับเข้า/เบิกออก | stepper 4 ปุ่ม, สีเต็มพื้นตาม action | Part summary คงที่, input ใหญ่, reference/note แบบ progressive disclosure |
| เช็คสต๊อก | แสดง Min/Max/Brand ทุกบรรทัด | Part Number, description, system qty, counted qty, difference |
| ประวัติ | icon/สีทุกแถว | เส้นเวลาเรียบ, `+/- qty` เป็นจุดเด่น, filter ด้านบน |

## 7. Copy ที่ควรปรับ

| เดิม | แนะนำ | เหตุผล |
|---|---|---|
| `ถึงระดับสูงสุด` | `เต็มตาม Max` | สั้นและสัมพันธ์กับภาษาหน้างาน |
| `ถึงจุดสั่งซื้อ` | `ถึง Min` | ผู้ใช้เห็นคำเดียวกับค่าที่ตั้งไว้ |
| `รีบรับเข้าชดเชยด่วน` | `ยอดติดลบ ตรวจสอบเอกสารรับเข้า` | บอกการแก้ที่ชัดกว่า |
| `กำลังตรวจสอบสถานะ...` | `เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง` | ไม่แสร้งว่าระบบกำลังทำสิ่งที่พิสูจน์ไม่ได้ |
| `ทำรายการ` | คงไว้ | ครอบคลุมรับเข้า เบิกออก และตรวจนับได้โดยไม่เพิ่ม navigation |

## 8. Implementation Priority

1. แก้ information architecture: Bottom navigation + action sheet
2. ลด palette และแยก Brand ออกจาก status semantics
3. สร้าง shared Part Card พร้อม Stock Rail
4. สร้างหน้า Home ใหม่โดยใช้ action summary เดียว
5. เปลี่ยน emoji เป็น SVG icon family เดียว
6. ลด radius/shadow/motion และกำหนด typography hierarchy
7. ทดสอบที่ 320px, 375px และ 430px พร้อมข้อความไทยยาวและจำนวนติดลบ
8. ถ่าย screenshot ทุกหน้าหลักแล้วทำ visual review รอบสอง

## 9. Verification Checklist

- หนึ่ง viewport มี primary action เพียงหนึ่งจุด
- ไม่มี action ซ้ำระหว่าง content, FAB และ navigation
- เมื่อปิดสี ผู้ใช้ยังแยกสถานะจากข้อความและไอคอนได้
- สีแดงปรากฏเฉพาะสิ่งผิดปกติหรือ destructive action
- การ์ด Part แสดง Part Number, description และ Qty ได้ภายใน 2–3 วินาทีของการสแกนสายตา
- Bottom bar ไม่บังคีย์บอร์ดและเผื่อ safe-area
- ที่ 200% zoom ไม่มี control ซ้อนหรือข้อความถูกตัดจนเสียความหมาย
- ภาพ placeholder และภาพจริงมี geometry เดียวกัน ไม่เกิด layout shift
- reduced motion ปิด animation ที่ไม่จำเป็นทั้งหมด
- ไม่มี emoji เป็น icon ใน production UI

## 10. Verdict

**READY FOR USER REVIEW** — Major findings ถูกนำไปใช้แล้ว และ visual QA ยืนยันว่าโครงหลักอ่านง่ายขึ้น แผงทำรายการใช้งานได้ และรายการวัสดุไม่ล้นจอมือถือ งานที่ยังเหมาะกับรอบถัดไปคือเก็บรายละเอียดหน้าตรวจนับและลด quick stepper จากสี่ปุ่มหลังมีข้อมูลการใช้งานจริง
