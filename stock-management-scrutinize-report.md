# Scrutiny Audit Report: Stock Management Mobile Spec & Architecture

**Target**: `E:\Antigravity\Web App\Stock\stock-management-spec.md` & `stock-management-mobile-plan.md`  
**Reviewer**: Antigravity Audit Agent (`/scrutinize`)  
**Auditing Date**: 2026-09-18  
**Verdict**: **FIX-THEN-SHIP**  

---

## 1. Intent — What is this actually trying to do?

The specification defines a lightweight, mobile-first inventory management application for shopfloor warehouse workers and technicians built entirely on Cloudflare Workers, Static Assets, D1 (SQLite), and R2.

### Is there a simpler, smaller, or more elegant way?
- **Ledger Design**: Using a single table `movements` and letting SQLite Triggers automatically manage `parts.qty` and `parts.version` is the most elegant, zero-overhead architectural pattern for D1. It eliminates the need for distributed transactions, row-level locks, or double-writing code in the Worker.
- **Negative Balance Decision**: Allowing negative balances directly mirrors shopfloor reality (emergency withdrawals before supplier invoice entry). Attempting to enforce non-negative balances without 100% barcode gatekeeping always leads to workers taking physical parts unrecorded.
- **No-Auth MVP**: Using Cloudflare Access in Phase 0 was overly burdensome for day-1 site rollout. Removing login and capturing `operator_name` in every transaction is the right pragmatic cut.

---

## 2. Trace — End-to-End Code & Data Path Walkthrough

### Trace A: Negative Balance Issuance
- **Input**: Technician issues 5 pieces of `BEARING-6204` when current system `qty = 2`.
- **Path**: `Client Form` -> `POST /api/parts/8/issue` -> Worker checks `qty > 0` and `operatorName` -> `INSERT INTO movements (kind: 2, delta: -5)` -> SQLite trigger fires -> `UPDATE parts SET qty = 2 + (-5) = -3, version = version + 1`.
- **Observation**:
  - The SQLite calculation `2 + (-5) = -3` succeeds without arithmetic error.
  - The trigger constraint in the new spec does NOT block `< 0`.
  - Status helper function evaluates `qty < 0` -> returns `'NEGATIVE'`.
  - UI renders high-visibility Badge: `--status-negative` (`#e11d48`).
- **Holds?**: **Holds**, but requires reconciling conflicting documentation in the original plan.

### Trace B: Stock Count Adjustment on Negative Items
- **Input**: Current system `qty = -3`. Physical count on shelf is `2`.
- **Path**:
  - `difference = counted_qty - system_qty = 2 - (-3) = +5`.
  - `INSERT INTO movements (kind: 3, delta: +5)`.
  - `parts.qty = -3 + (+5) = +2`.
- **Observation**:
  - Mathematical outcome matches physical reality (`2` pieces on shelf).
- **Potential Seam/Bug**:
  - If another user issues 1 piece while the stock count draft was open, `system_qty` changed from `-3` to `-4`.
  - If the client calculates `difference` using the stale `-3`, it submits `+5`, leaving system at `-4 + 5 = +1` (mismatched with physical count `2`).
- **Holds?**: **Requires adjustment rule** — The Worker must compute `difference = counted_qty - live_current_qty` at the moment of `batch()` execution, NOT trusting client-side stale difference.

### Trace C: Unauthenticated Operator Audit Trail
- **Input**: Request with empty or blank operator name `"   "`.
- **Path**: If Worker only checks truthy `if (!body.operatorName)`, a string of spaces bypasses validation.
- **Observation**: The ledger would record an anonymous movement.
- **Holds?**: **Fails without strict trimmed validation**.

---

## 3. Findings & Evidence (Ordered by Severity)

### [MAJOR] Finding 1: Inconsistency Between Original Plan and New Spec Regarding Negative Balance
- **Finding**: `stock-management-mobile-plan.md` still contains lingering references stating that negative balances are disallowed (lines 58, 87, 265, 383), whereas Phase 0 confirmed allowing negative balances.
- **Why it matters**: Developers implementing Phase 1 might read `plan.md` and re-introduce the `CHECK (qty >= 0)` constraint in SQLite, causing runtime crash when a negative issue occurs.
- **Evidence**:
  - `plan.md` line 58: *"ค่าเริ่มต้นของ MVP คือไม่อนุญาตให้เบิกเกินจำนวนคงเหลือ"*
  - `plan.md` line 265: *"trigger ตรวจ ... ยอดใหม่ไม่ต่ำกว่า 0"*
- **Suggested Change**: Synchronize `stock-management-mobile-plan.md` lines to explicitly state that negative balances are permitted and tracked with the `NEGATIVE` status badge.

### [MAJOR] Finding 2: Stale Delta Calculation in Stock Count Complete Batch
- **Finding**: In `stock-management-spec.md` Section 5.3 Endpoint 4, `difference` calculation is shown as `countedQty - system_qty`. If a transaction occurs between start of counting and confirmation, the final quantity will not match the physical count.
- **Why it matters**: The core promise of stock count is: *"After confirmation, system quantity MUST equal counted quantity"*.
- **Evidence**:
  - If System is 10, Worker starts count.
  - Another user issues 2 (System becomes 8).
  - Worker counts 10. Client difference = `10 - 10 = 0` (no adjustment created).
  - Final system remains 8 instead of physical 10!
- **Suggested Change**: In the SQL batch for `POST /api/counts/complete`, compute delta directly in SQL using the live current balance:
  ```sql
  INSERT INTO movements (request_key, part_id, kind, delta, operator_name, count_id, created_at)
  SELECT ?1, ?2, 3, (?3 - parts.qty), ?4, ?5, ?6
  FROM parts WHERE parts.id = ?2 AND (?3 - parts.qty) != 0;
  ```
  This guarantees `live_qty + delta = counted_qty` regardless of concurrent movements.

### [MINOR] Finding 3: Operator Name Friction in No-Auth Mode
- **Finding**: Because there is no login system, forcing users to manually type their full name on every single Issue and Receive transaction on a mobile screen creates severe friction and typo inconsistency (e.g., "สมชาย", "นายสมชาย", "ช่างสมชาย").
- **Why it matters**: Users will start typing "." or "a" to bypass the input, degrading the audit ledger.
- **Suggested Change**: Implement Client-Side Name Memory:
  - Cache the last entered `operator_name` in `localStorage`.
  - Pre-fill the field automatically on subsequent forms.
  - Add a quick dropdown or chip selector of recent operators on that device.

### [NIT] Finding 4: Negative Stock Sorting Priority on Dashboard
- **Finding**: The original spec dashboard query sorted by `qty <= min_qty`. Negative items have the lowest values (e.g. `-5 < 0`), but sorting strictly by `qty ASC` would place a Part with `-1` after `-5`.
- **Why it matters**: A Part with `-5` is indeed more severely indebted than `-1`, so `ORDER BY qty ASC` is mathematically correct. Ensure the D1 index `idx_parts_active_min` supports `qty < 0`.
- **Suggested Change**: Explicitly verify query: `SELECT * FROM parts WHERE active = 1 AND qty <= min_qty ORDER BY qty ASC LIMIT 10`.

---

## 4. Verdict & Next Steps

### Verdict: **FIX-THEN-SHIP**

**Rationale**:  
The architecture, D1 schema, and frontend design tokens are exceptionally solid, lean, and purpose-built for Cloudflare. The 2 Major findings (synchronizing the plan document to avoid developer confusion, and calculating stock count adjustment delta against live database balance) are straightforward to address immediately.

### Action Items:
1. Update `stock-management-mobile-plan.md` to align sections 3.1, 4.2, 8, and 12 with the confirmed negative balance policy.
2. Update `stock-management-spec.md` with the live-delta stock count SQL formula and local operator caching.
3. Proceed to Phase 1 implementation (Foundation: Cloudflare Worker, D1 migrations, and Core unit tests).
