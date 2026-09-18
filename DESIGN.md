# Design System & UI Specifications: Stock Management Mobile

Designed according to `/frontend-design` principles: **Industrial & Technical Precision ผสานป้ายสีสถานะคลังสินค้าสดใส (Vibrant Warehouse Semantics)**.

---

## 1. Color System & Semantic Status Hierarchy

Color in a warehouse is a safety and workflow signal. We use an HSL-tailored palette with high contrast (WCAG 2.2 AA compliant):

| Role / Status | Token | Hex Color | Visual Indicator | Purpose |
|---|---|---|---|---|
| **Negative Stock** | `--status-negative` | `#e11d48` | Deep Rose / Crimson Badge | 🚨 Items with balance < 0 (emergency issue without receipt) |
| **Out of Stock** | `--status-out` | `#ef4444` | Pure Red Badge | ⛔ Zero balance (`qty == 0`) |
| **Low Stock** | `--status-low` | `#f59e0b` | Amber Orange Badge | ⚠️ At or below reorder point (`0 < qty <= min`) |
| **Normal** | `--status-normal` | `#16a34a` | Emerald Green Badge | ✅ Ample stock (`qty > min`) |
| **Over Max** | `--status-max` | `#0284c7` | Vivid Sky Blue Badge | ℹ️ At or over maximum capacity (`qty >= max`) |
| **Action: Receive** | `--action-receive` | `#16a34a` | Green Button | Inbound inventory entry |
| **Action: Issue** | `--action-issue` | `#ea580c` | Coral / Orange Red Button | Outbound inventory issue |
| **Action: Count** | `--action-count` | `#7c3aed` | Violet / Purple Button | Stock audit session |

---

## 2. Typography & Optical Numerics

- **Headings & Body**: Google Font `Prompt` (with fallback to `Leelawadee UI`, `-apple-system`, `sans-serif`) for natural, crisp Thai and Latin reading.
- **Quantities & Part Numbers**: `JetBrains Mono`, `Fira Code` with `font-variant-numeric: tabular-nums` to ensure exact column alignment and instant optical comparisons on handheld screens.

---

## 3. Ergonomics & Mobile-First Controls

1. **Touch Targets**: All tappable elements, buttons, and bottom nav tabs are guaranteed to be at least `48 × 48px`.
2. **One-Thumb Floating Actions**: In addition to standard buttons, the bottom navigation keeps the primary tabs (`หน้าหลัก`, `วัสดุ`, `เคลื่อนไหว`, `ตรวจนับ`) right beneath the operator's thumb.
3. **Safe Area Insets**: Handled automatically via `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)` for modern bezel-less smartphones.
4. **Quick-Step Steppers**: Number inputs are accompanied by quick delta steppers (`-10`, `-1`, `+1`, `+10`) so technicians wearing gloves can tap quickly without needing the soft keyboard.
