# UX Contract & State Machine: Stock Management Mobile

This document establishes the interaction rules and state contracts for client implementations.

---

## 1. Zero-CLS Skeleton Loading Contract
- All content cards, summary KPI statistics, and inventory rows must have matching skeleton placeholders.
- Cumulative Layout Shift (CLS) must remain exactly `0.00` during data fetching.

---

## 2. Double-Tap & Idempotency Contract
- When the user taps "ยืนยันรับเข้า" or "ยืนยันเบิกออก":
  1. The submit button is immediately marked `disabled` and displays an animated spinner.
  2. Pointer events are blocked across the form.
  3. A unique `Idempotency-Key` (UUIDv4) is generated and sent in request headers.
  4. If the server responds with HTTP 409 (`IDEMPOTENT_DUPLICATE`), the client treats this as already processed and refreshes state safely.

---

## 3. Operator Name Memory Contract (No-Auth Mode)
- In No-Auth MVP, the client automatically persists:
  `localStorage.setItem('stock_last_operator_name', trimmedName)` upon successful transaction.
- When opening any Receive, Issue, or Count modal, the operator field is pre-filled with this cached name, saving typing friction on mobile screens.

---

## 4. Conflict & Stale Data Contract
- When editing a Part, the client sends `If-Match: <version>` or the current `version`.
- If another device modified the Part in between, the server returns HTTP 412 or conflict error.
- The client displays an informational toast with a 1-tap "รีเฟรชข้อมูลล่าสุด" button instead of silent overwrite.

---

## 5. Offline & Network Retry Contract
- If an API request encounters a network failure or timeout:
  - The client does NOT immediately retry blind duplicate mutations.
  - The client displays an amber toast: "สัญญาณอินเทอร์เน็ตขัดข้อง กำลังตรวจสอบสถานะ..." and checks `/api/health` before offering manual retry.
