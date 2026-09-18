-- ==========================================================
-- Cloudflare D1 Database Schema: Stock Management Mobile
-- Single Source of Truth Ledger with SQLite Triggers
-- ==========================================================

-- 1. Brands Table (Normalized Brand Names)
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- 2. Parts Table (Inventory Master Catalog)
CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL DEFAULT 0,              -- Managed purely by movements trigger (negative allowed)
  min_qty INTEGER NOT NULL DEFAULT 0,          -- Reorder warning threshold (>= 0)
  max_qty INTEGER DEFAULT NULL,                 -- Maximum ceiling threshold (optional; if set > min_qty)
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  location TEXT DEFAULT NULL,
  image_key TEXT DEFAULT NULL,                 -- R2 Object key, e.g. "parts/1-abc.webp"
  active INTEGER NOT NULL DEFAULT 1,           -- 1 = Active, 0 = Inactive (Soft Deleted)
  version INTEGER NOT NULL DEFAULT 1,          -- Optimistic locking counter
  created_at INTEGER NOT NULL,                 -- Unix epoch seconds
  updated_at INTEGER NOT NULL                  -- Unix epoch seconds
);

-- 3. Stock Counts Table (Audit Sessions)
CREATE TABLE IF NOT EXISTS stock_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status INTEGER NOT NULL DEFAULT 1,           -- 1 = Draft, 2 = Completed, 3 = Cancelled
  operator_name TEXT NOT NULL,                 -- Operator who conducted or confirmed the count
  note TEXT DEFAULT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER DEFAULT NULL
);

-- 4. Movements Table (Append-Only Transaction Ledger)
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,            -- Idempotency key to prevent duplicate submissions
  part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  kind INTEGER NOT NULL,                       -- 1 = Receive, 2 = Issue, 3 = Adjustment, 4 = Reversal
  delta INTEGER NOT NULL,                      -- Signed integer delta (+10, -5, etc.). Must not be 0.
  operator_name TEXT NOT NULL,                 -- Name of operator / requester
  reference TEXT DEFAULT NULL,                 -- Reference document no., job order, or department
  note TEXT DEFAULT NULL,                      -- Optional comment/note
  count_id INTEGER DEFAULT NULL REFERENCES stock_counts(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL                  -- Unix epoch seconds
);

-- 5. Stock Count Lines Table (Count Breakdown)
CREATE TABLE IF NOT EXISTS stock_count_lines (
  count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  system_qty INTEGER NOT NULL,                 -- System balance at count initiation
  counted_qty INTEGER NOT NULL,                -- Physically verified quantity
  difference INTEGER NOT NULL,                 -- counted_qty - system_qty
  reason TEXT DEFAULT NULL,                    -- Discrepancy reason
  PRIMARY KEY (count_id, part_id)
);

-- ==========================================================
-- Indexes for High Performance & Low D1 Row Reads
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_parts_active_min ON parts(active, qty, min_qty) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_movements_part_date ON movements(part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_part ON stock_count_lines(part_id);

-- ==========================================================
-- SQLite Triggers: Autonomous Balance & Concurrency Master
-- ==========================================================
CREATE TRIGGER IF NOT EXISTS trg_apply_movement_delta
AFTER INSERT ON movements
BEGIN
  -- Validate that delta is non-zero
  SELECT CASE
    WHEN NEW.delta = 0 THEN
      RAISE(ABORT, 'INVALID_DELTA: Movement delta must not be zero.')
    WHEN (SELECT active FROM parts WHERE id = NEW.part_id) = 0 THEN
      RAISE(ABORT, 'INACTIVE_PART: Cannot record movements on an inactive part.')
  END;

  -- Atomically apply the delta, increment version, and bump updated_at
  -- Note: Negative balance is allowed as confirmed in Phase 0 decisions.
  UPDATE parts
  SET qty = qty + NEW.delta,
      version = version + 1,
      updated_at = NEW.created_at
  WHERE id = NEW.part_id;
END;
