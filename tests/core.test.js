import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STOCK_STATUS,
  STOCK_STATUS_CONFIG,
  calculateStockStatus,
  calculateReplenishment,
  validatePartInput,
  validatePartUpdateInput,
  validateMovementInput,
  calculatePagination,
  formatTabularNumber,
  MOVEMENT_KIND,
  MOVEMENT_KIND_CONFIG,
  validateReversalInput,
  exportMovementsToCSV,
  COUNT_LINE_STATUS,
  COUNT_LINE_STATUS_CONFIG,
  calculateCountVariance,
  validateStockCountLineInput,
  calculateStockCountSummary,
  validateStockCountSubmission
} from '../src/core.js';

describe('Stock Management Core: Status Calculations', () => {
  it('should return NEGATIVE status when quantity is below zero', () => {
    assert.equal(calculateStockStatus(-5, 10, 20), STOCK_STATUS.NEGATIVE);
    assert.equal(calculateStockStatus(-1, 0, null), STOCK_STATUS.NEGATIVE);
    assert.equal(STOCK_STATUS_CONFIG[STOCK_STATUS.NEGATIVE].label, 'ติดลบ');
  });

  it('should return OUT_OF_STOCK status when quantity is exactly zero', () => {
    assert.equal(calculateStockStatus(0, 5, 20), STOCK_STATUS.OUT_OF_STOCK);
    assert.equal(calculateStockStatus(0, 0, null), STOCK_STATUS.OUT_OF_STOCK);
    assert.equal(STOCK_STATUS_CONFIG[STOCK_STATUS.OUT_OF_STOCK].label, 'หมดสต๊อก');
  });

  it('should return LOW_STOCK when quantity is greater than 0 but less than or equal to minQty', () => {
    assert.equal(calculateStockStatus(1, 5, 20), STOCK_STATUS.LOW_STOCK);
    assert.equal(calculateStockStatus(5, 5, 20), STOCK_STATUS.LOW_STOCK);
    assert.equal(calculateStockStatus(2, 2, null), STOCK_STATUS.LOW_STOCK);
  });

  it('should return NORMAL when quantity is above minQty and below maxQty', () => {
    assert.equal(calculateStockStatus(6, 5, 20), STOCK_STATUS.NORMAL);
    assert.equal(calculateStockStatus(15, 5, 20), STOCK_STATUS.NORMAL);
    assert.equal(calculateStockStatus(100, 5, null), STOCK_STATUS.NORMAL);
  });

  it('should return OVER_MAX when quantity meets or exceeds maxQty', () => {
    assert.equal(calculateStockStatus(20, 5, 20), STOCK_STATUS.OVER_MAX);
    assert.equal(calculateStockStatus(25, 5, 20), STOCK_STATUS.OVER_MAX);
  });
});

describe('Stock Management Core: Replenishment Suggestions', () => {
  it('should calculate replenishment correctly when Max is defined (even with negative stock)', () => {
    // If current is -3 and Max is 20, we need 23 to reach Max
    assert.equal(calculateReplenishment(-3, 5, 20), 23);
    assert.equal(calculateReplenishment(0, 5, 20), 20);
    assert.equal(calculateReplenishment(5, 5, 20), 15);
    assert.equal(calculateReplenishment(20, 5, 20), 0);
    assert.equal(calculateReplenishment(25, 5, 20), 0);
  });

  it('should suggest replenishment when below or at Min if Max is not specified', () => {
    // When Min is 5, target safe level is 10
    assert.equal(calculateReplenishment(-2, 5, null), 12);
    assert.equal(calculateReplenishment(0, 5, null), 10);
    assert.equal(calculateReplenishment(3, 5, null), 7);
    assert.equal(calculateReplenishment(5, 5, null), 5);
    // Above Min without Max: no replenishment needed
    assert.equal(calculateReplenishment(6, 5, null), null);
    assert.equal(calculateReplenishment(100, 5, null), null);
  });
});

describe('Stock Management Core: Part Input Validation', () => {
  it('should accept valid part input and normalize fields', () => {
    const res = validatePartInput({
      part_no: ' bearing-6204 ',
      description: ' Deep Groove Ball Bearing ',
      brand_name: ' SKF ',
      min_qty: '5',
      max_qty: '25',
      unit: ' ชิ้น ',
      location: ' A-12 '
    });

    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.sanitized.part_no, 'BEARING-6204');
    assert.equal(res.sanitized.description, 'Deep Groove Ball Bearing');
    assert.equal(res.sanitized.brand_name, 'SKF');
    assert.equal(res.sanitized.min_qty, 5);
    assert.equal(res.sanitized.max_qty, 25);
    assert.equal(res.sanitized.unit, 'ชิ้น');
    assert.equal(res.sanitized.location, 'A-12');
  });

  it('should reject missing or invalid Part Number and Description', () => {
    const res = validatePartInput({
      part_no: '',
      description: ' '
    });

    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Part Number')));
    assert.ok(res.errors.some(e => e.includes('รายละเอียด')));
  });

  it('should reject negative min_qty or max_qty <= min_qty', () => {
    const res = validatePartInput({
      part_no: 'V-BELT-A32',
      description: 'V-Belt Size A-32',
      min_qty: -1
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Min')));

    const res2 = validatePartInput({
      part_no: 'V-BELT-A32',
      description: 'V-Belt Size A-32',
      min_qty: 10,
      max_qty: 10
    });
    assert.equal(res2.valid, false);
    assert.ok(res2.errors.some(e => e.includes('Max')));
  });
});

describe('Stock Management Core: Movement Input Validation', () => {
  it('should accept valid movement input with operator name', () => {
    const res = validateMovementInput({
      quantity: '10',
      operator_name: ' สมชาย ใจดี ',
      reference: ' PO-1001 ',
      note: ' จัดส่งรอบเช้า '
    });

    assert.equal(res.valid, true);
    assert.equal(res.sanitized.quantity, 10);
    assert.equal(res.sanitized.operator_name, 'สมชาย ใจดี');
    assert.equal(res.sanitized.reference, 'PO-1001');
    assert.equal(res.sanitized.note, 'จัดส่งรอบเช้า');
  });

  it('should reject zero, negative or non-numeric quantities', () => {
    assert.equal(validateMovementInput({ quantity: 0, operator_name: 'สมชาย' }).valid, false);
    assert.equal(validateMovementInput({ quantity: -5, operator_name: 'สมชาย' }).valid, false);
    assert.equal(validateMovementInput({ quantity: 1.5, operator_name: 'สมชาย' }).valid, false);
    assert.equal(validateMovementInput({ quantity: 'abc', operator_name: 'สมชาย' }).valid, false);
  });

  it('should reject empty or whitespace-only operator name (No-Auth Auditing Rule)', () => {
    assert.equal(validateMovementInput({ quantity: 5, operator_name: '' }).valid, false);
    assert.equal(validateMovementInput({ quantity: 5, operator_name: '   ' }).valid, false);
    assert.equal(validateMovementInput({ quantity: 5, operator_name: 'A' }).valid, false);
  });
});

describe('Stock Management Core: Formatting Utilities', () => {
  it('should format numbers with tabular comma separation and keep negative sign', () => {
    assert.equal(formatTabularNumber(1000), '1,000');
    assert.equal(formatTabularNumber(-25), '-25');
    assert.equal(formatTabularNumber(0), '0');
  });
});

describe('Stock Management Core: Phase 2 Part Updates & Pagination', () => {
  it('should validate partial updates and optimistic version', () => {
    const existing = { min_qty: 5, max_qty: 20 };
    const res = validatePartUpdateInput({
      description: 'Updated Description',
      min_qty: 8,
      max_qty: 25,
      version: 2
    }, existing);

    assert.equal(res.valid, true);
    assert.equal(res.sanitized.description, 'Updated Description');
    assert.equal(res.sanitized.min_qty, 8);
    assert.equal(res.sanitized.max_qty, 25);
    assert.equal(res.sanitized.version, 2);
  });

  it('should reject invalid max_qty <= effective min_qty', () => {
    const existing = { min_qty: 10, max_qty: 20 };
    const res = validatePartUpdateInput({
      max_qty: 10,
      version: 1
    }, existing);

    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Max ต้องมากกว่าค่า Min')));
  });

  it('should calculate pagination correctly', () => {
    const p1 = calculatePagination(55, 1, 25);
    assert.equal(p1.totalPages, 3);
    assert.equal(p1.hasPrev, false);
    assert.equal(p1.hasNext, true);
    assert.equal(p1.offset, 0);

    const p2 = calculatePagination(55, 2, 25);
    assert.equal(p2.hasPrev, true);
    assert.equal(p2.hasNext, true);
    assert.equal(p2.offset, 25);

    const p3 = calculatePagination(55, 3, 25);
    assert.equal(p3.hasPrev, true);
    assert.equal(p3.hasNext, false);
    assert.equal(p3.offset, 50);
  });
});

describe('Stock Management Core: Phase 3 Movement Kinds & Reversals', () => {
  it('should define correct movement kinds and configurations', () => {
    assert.equal(MOVEMENT_KIND.RECEIVE, 1);
    assert.equal(MOVEMENT_KIND.ISSUE, 2);
    assert.equal(MOVEMENT_KIND.ADJUSTMENT, 3);
    assert.equal(MOVEMENT_KIND.REVERSAL, 4);

    assert.equal(MOVEMENT_KIND_CONFIG[MOVEMENT_KIND.RECEIVE].label, 'รับเข้า');
    assert.equal(MOVEMENT_KIND_CONFIG[MOVEMENT_KIND.ISSUE].label, 'เบิกจ่าย');
    assert.equal(MOVEMENT_KIND_CONFIG[MOVEMENT_KIND.ADJUSTMENT].label, 'ปรับยอด');
    assert.equal(MOVEMENT_KIND_CONFIG[MOVEMENT_KIND.REVERSAL].label, 'ยกเลิกรายการ');
  });

  it('should validate reversal input properly', () => {
    const valid = validateReversalInput({
      operator_name: ' สมชาย ช่างกล ',
      reason: ' บันทึกผิดพลาด เบิกเกินจำนวนจริง '
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.sanitized.operator_name, 'สมชาย ช่างกล');
    assert.equal(valid.sanitized.reason, 'บันทึกผิดพลาด เบิกเกินจำนวนจริง');

    const invalidOperator = validateReversalInput({
      operator_name: '',
      reason: 'เหตุผลยาวพอสมควร'
    });
    assert.equal(invalidOperator.valid, false);
    assert.ok(invalidOperator.errors.some(e => e.includes('ชื่อผู้ทำรายการ')));

    const invalidReason = validateReversalInput({
      operator_name: 'สมชาย',
      reason: ' '
    });
    assert.equal(invalidReason.valid, false);
    assert.ok(invalidReason.errors.some(e => e.includes('เหตุผล')));
  });

  it('should export movements to Excel-compatible CSV with UTF-8 BOM', () => {
    const mockMovements = [
      {
        id: 1,
        created_at: 1726700000,
        kind: MOVEMENT_KIND.RECEIVE,
        part_no: 'BEARING-6204',
        description: 'ตลับลูกปืนฝายาง "เกรด A"',
        brand_name: 'SKF',
        delta: 10,
        unit: 'ตลับ',
        reference: 'PO-1001',
        operator_name: 'สมศักดิ์, ผู้จัดการคลัง',
        note: 'รับเข้าปกติ'
      },
      {
        id: 2,
        created_at: 1726703600,
        kind: MOVEMENT_KIND.ISSUE,
        part_no: 'BEARING-6204',
        description: 'ตลับลูกปืนฝายาง',
        brand_name: 'SKF',
        delta: -3,
        unit: 'ตลับ',
        reference: 'JOB-99',
        operator_name: 'วิชัย',
        note: null
      }
    ];

    const csv = exportMovementsToCSV(mockMovements);

    // Ensure UTF-8 BOM is first char for Excel Thai compatibility
    assert.equal(csv.charCodeAt(0), 0xFEFF);

    // Ensure header columns exist
    assert.ok(csv.includes('ID,วันเวลา,ประเภท,รหัสวัสดุ,ชื่อวัสดุ,ยี่ห้อ,จำนวนเปลี่ยนแปลง,หน่วยนับ,เลขอ้างอิง,ผู้ทำรายการ,หมายเหตุ'));

    // Check row 1 properly escapes quotes and commas
    assert.ok(csv.includes('BEARING-6204'));
    assert.ok(csv.includes('"ตลับลูกปืนฝายาง ""เกรด A"""'));
    assert.ok(csv.includes('"สมศักดิ์, ผู้จัดการคลัง"'));
    assert.ok(csv.includes('+10'));

    // Check row 2 negative delta
    assert.ok(csv.includes('-3'));
    assert.ok(csv.includes('เบิกจ่าย'));
  });
});

describe('Stock Management Core: Phase 4 Stock Count & Variance Reconciliation', () => {
  it('should calculate variance and status correctly for match, surplus, and deficit', () => {
    // 1. Match
    const match = calculateCountVariance(10, 10);
    assert.equal(match.difference, 0);
    assert.equal(match.status, COUNT_LINE_STATUS.MATCH);
    assert.equal(match.statusConfig.label, 'ตรงกัน');

    // 2. Surplus
    const surplus = calculateCountVariance(5, 8);
    assert.equal(surplus.difference, 3);
    assert.equal(surplus.status, COUNT_LINE_STATUS.SURPLUS);
    assert.equal(surplus.statusConfig.label, 'ยอดเกิน');

    // 3. Deficit
    const deficit = calculateCountVariance(15, 12);
    assert.equal(deficit.difference, -3);
    assert.equal(deficit.status, COUNT_LINE_STATUS.DEFICIT);
    assert.equal(deficit.statusConfig.label, 'ยอดขาด');

    // 4. Negative balance reconciliation
    // e.g. System is -2 (due to emergency issue), but physical count shows 0
    const negRec = calculateCountVariance(-2, 0);
    assert.equal(negRec.difference, 2);
    assert.equal(negRec.status, COUNT_LINE_STATUS.SURPLUS);
  });

  it('should validate single stock count line inputs', () => {
    const valid = validateStockCountLineInput({
      part_id: '3',
      counted_qty: '5',
      reason: 'นับตรวจประจำเดือน'
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.sanitized.part_id, 3);
    assert.equal(valid.sanitized.counted_qty, 5);
    assert.equal(valid.sanitized.reason, 'นับตรวจประจำเดือน');

    // Reject negative counted qty
    const invalidQty = validateStockCountLineInput({
      part_id: 1,
      counted_qty: -1
    });
    assert.equal(invalidQty.valid, false);
    assert.ok(invalidQty.errors.some(e => e.includes('มากกว่าหรือเท่ากับ 0')));

    // Reject invalid part_id
    const invalidPart = validateStockCountLineInput({
      part_id: 0,
      counted_qty: 10
    });
    assert.equal(invalidPart.valid, false);
    assert.ok(invalidPart.errors.some(e => e.includes('Part ID')));
  });

  it('should aggregate stock count summary statistics', () => {
    const lines = [
      { system_qty: 10, counted_qty: 10 }, // match
      { system_qty: 5, counted_qty: 8 },   // surplus +3
      { system_qty: 20, counted_qty: 15 }, // deficit -5
      { system_qty: 0, counted_qty: '' }   // untouched/skipped
    ];

    const summary = calculateStockCountSummary(lines);
    assert.equal(summary.totalItems, 4);
    assert.equal(summary.totalCounted, 3);
    assert.equal(summary.matchCount, 1);
    assert.equal(summary.surplusCount, 1);
    assert.equal(summary.deficitCount, 1);
    assert.equal(summary.discrepancyCount, 2);
    assert.equal(summary.netDifference, -2); // +3 + (-5) = -2
    assert.equal(summary.absoluteDifference, 8); // 3 + 5 = 8
  });

  it('should validate full stock count submission', () => {
    const valid = validateStockCountSubmission({
      operator_name: ' สมชาย ช่างคลัง ',
      note: ' ตรวจนับสิ้นไตรมาส 3 ',
      lines: [
        { part_id: 1, counted_qty: 5, reason: 'ปกติ' },
        { part_id: 2, counted_qty: 8, reason: 'พบของเกิน' }
      ]
    });

    assert.equal(valid.valid, true);
    assert.equal(valid.sanitized.operator_name, 'สมชาย ช่างคลัง');
    assert.equal(valid.sanitized.lines.length, 2);

    // Missing operator
    const invalidOp = validateStockCountSubmission({
      operator_name: '',
      lines: [{ part_id: 1, counted_qty: 5 }]
    });
    assert.equal(invalidOp.valid, false);
    assert.ok(invalidOp.errors.some(e => e.includes('ผู้ยืนยัน')));

    // Empty lines
    const emptyLines = validateStockCountSubmission({
      operator_name: 'สมชาย',
      lines: []
    });
    assert.equal(emptyLines.valid, false);
    assert.ok(emptyLines.errors.some(e => e.includes('อย่างน้อย 1 รายการ')));
  });
});

