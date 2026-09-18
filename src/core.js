// ==========================================================
// Stock Management Mobile: Pure Core Business Logic
// Zero dependencies, fully deterministic, tested with Node test runner
// ==========================================================

/**
 * Stock Status Metadata for UI display and status calculation
 */
export const STOCK_STATUS = {
  NEGATIVE: 'NEGATIVE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  NORMAL: 'NORMAL',
  OVER_MAX: 'OVER_MAX'
};

export const STOCK_STATUS_CONFIG = {
  [STOCK_STATUS.NEGATIVE]: {
    code: STOCK_STATUS.NEGATIVE,
    label: 'ติดลบ',
    badgeClass: 'badge-negative',
    colorHex: '#e11d48',
    icon: 'minus-circle',
    actionText: 'ต้องรับเข้าชดเชยด่วน'
  },
  [STOCK_STATUS.OUT_OF_STOCK]: {
    code: STOCK_STATUS.OUT_OF_STOCK,
    label: 'หมดสต๊อก',
    badgeClass: 'badge-out',
    colorHex: '#ef4444',
    icon: 'package-x',
    actionText: 'ต้องสั่งซื้อทันที'
  },
  [STOCK_STATUS.LOW_STOCK]: {
    code: STOCK_STATUS.LOW_STOCK,
    label: 'ถึงจุดสั่งซื้อ',
    badgeClass: 'badge-low',
    colorHex: '#f59e0b',
    icon: 'alert-triangle',
    actionText: 'แนะนำให้เติมสต๊อก'
  },
  [STOCK_STATUS.NORMAL]: {
    code: STOCK_STATUS.NORMAL,
    label: 'ปกติ',
    badgeClass: 'badge-normal',
    colorHex: '#16a34a',
    icon: 'check-circle',
    actionText: 'สต๊อกเพียงพอ'
  },
  [STOCK_STATUS.OVER_MAX]: {
    code: STOCK_STATUS.OVER_MAX,
    label: 'ถึงระดับสูงสุด',
    badgeClass: 'badge-max',
    colorHex: '#0284c7',
    icon: 'arrow-up-circle',
    actionText: 'สต๊อกเต็ม/เกิน Max'
  }
};

/**
 * Calculate the stock status based on current quantity, min threshold, and optional max.
 * @param {number} qty - Current balance (integer, can be negative)
 * @param {number} minQty - Reorder point threshold (integer >= 0)
 * @param {number|null|undefined} [maxQty] - Maximum capacity threshold (optional)
 * @returns {string} Stock status code
 */
export function calculateStockStatus(qty, minQty, maxQty = null) {
  const current = Number(qty);
  const min = Number(minQty);
  const max = maxQty !== null && maxQty !== undefined && maxQty !== '' ? Number(maxQty) : null;

  if (current < 0) {
    return STOCK_STATUS.NEGATIVE;
  }
  if (current === 0) {
    return STOCK_STATUS.OUT_OF_STOCK;
  }
  if (current <= min) {
    return STOCK_STATUS.LOW_STOCK;
  }
  if (max !== null && current >= max) {
    return STOCK_STATUS.OVER_MAX;
  }
  return STOCK_STATUS.NORMAL;
}

/**
 * Calculate recommended replenishment quantity to bring stock back to safe levels.
 * @param {number} qty - Current balance
 * @param {number} minQty - Reorder threshold
 * @param {number|null|undefined} [maxQty] - Optional ceiling threshold
 * @returns {number|null} Recommended replenishment count
 */
export function calculateReplenishment(qty, minQty, maxQty = null) {
  const current = Number(qty);
  const min = Number(minQty);
  const max = maxQty !== null && maxQty !== undefined && maxQty !== '' ? Number(maxQty) : null;

  if (max !== null) {
    // If Max is defined, replenish up to Max (e.g. max=20, qty=-3 -> 23)
    return Math.max(0, max - current);
  }

  // If no Max, suggest replenishment when at or below Min
  if (current <= min) {
    const target = min > 0 ? min * 2 : 1;
    return Math.max(1, target - current);
  }

  return null;
}

/**
 * Normalize and validate Part creation/update payload.
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validatePartInput(input = {}) {
  const errors = [];
  const partNo = (input.part_no || '').trim().toUpperCase();
  const description = (input.description || '').trim();
  const unit = (input.unit || 'ชิ้น').trim();
  const location = input.location ? input.location.trim() : null;
  const brandName = input.brand_name ? input.brand_name.trim() : null;

  if (!partNo) {
    errors.push('Part Number จำเป็นต้องระบุ');
  } else if (partNo.length < 2 || partNo.length > 50) {
    errors.push('Part Number ต้องมีความยาว 2 - 50 ตัวอักษร');
  }

  if (!description) {
    errors.push('รายละเอียดวัสดุจำเป็นต้องระบุ');
  } else if (description.length < 2 || description.length > 255) {
    errors.push('รายละเอียดต้องมีความยาว 2 - 255 ตัวอักษร');
  }

  const minQty = Number(input.min_qty ?? 0);
  if (!Number.isInteger(minQty) || minQty < 0) {
    errors.push('Min ต้องเป็นจำนวนเต็มที่มากกว่าหรือเท่ากับ 0');
  }

  let maxQty = null;
  if (input.max_qty !== undefined && input.max_qty !== null && input.max_qty !== '') {
    maxQty = Number(input.max_qty);
    if (!Number.isInteger(maxQty)) {
      errors.push('Max ต้องเป็นจำนวนเต็ม');
    } else if (maxQty <= minQty) {
      errors.push('Max ต้องมากกว่าค่า Min');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      part_no: partNo,
      description,
      brand_name: brandName,
      min_qty: minQty,
      max_qty: maxQty,
      unit: unit || 'ชิ้น',
      location: location || null
    }
  };
}

/**
 * Validate inventory movement action (Receive or Issue).
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validateMovementInput(input = {}) {
  const errors = [];
  const quantity = Number(input.quantity);
  const operatorName = (input.operator_name || '').trim();
  const reference = input.reference ? input.reference.trim() : null;
  const note = input.note ? input.note.trim() : null;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.push('จำนวนต้องเป็นจำนวนเต็มบวกที่มากกว่า 0');
  }

  if (!operatorName || operatorName.length < 2) {
    errors.push('กรุณาระบุชื่อผู้ทำรายการอย่างน้อย 2 ตัวอักษร');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      quantity,
      operator_name: operatorName,
      reference,
      note
    }
  };
}

/**
 * Image processing configuration constants
 */
export const IMAGE_CONFIG = {
  MAX_DIMENSION_PX: 1280,
  TARGET_SIZE_BYTES: 350 * 1024, // 350 KB
  MAX_UPLOAD_BYTES: 500 * 1024,  // 500 KB ceiling
  DEFAULT_QUALITY: 0.75,
  MIN_QUALITY: 0.50,
  MIME_TYPE: 'image/webp'
};

/**
 * Validate partial updates to Part master (with optimistic concurrency check).
 * @param {object} input
 * @param {object} [existingPart]
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validatePartUpdateInput(input = {}, existingPart = null) {
  const errors = [];
  const sanitized = {};

  if (input.description !== undefined) {
    const desc = String(input.description).trim();
    if (desc.length < 2 || desc.length > 255) {
      errors.push('รายละเอียดต้องมีความยาว 2 - 255 ตัวอักษร');
    } else {
      sanitized.description = desc;
    }
  }

  if (input.brand_name !== undefined) {
    sanitized.brand_name = input.brand_name ? String(input.brand_name).trim() : null;
  }

  if (input.unit !== undefined) {
    const unit = String(input.unit).trim();
    sanitized.unit = unit || 'ชิ้น';
  }

  if (input.location !== undefined) {
    sanitized.location = input.location ? String(input.location).trim() : null;
  }

  let effectiveMin = existingPart ? existingPart.min_qty : 0;
  if (input.min_qty !== undefined && input.min_qty !== null && input.min_qty !== '') {
    const minQty = Number(input.min_qty);
    if (!Number.isInteger(minQty) || minQty < 0) {
      errors.push('Min ต้องเป็นจำนวนเต็มที่มากกว่าหรือเท่ากับ 0');
    } else {
      sanitized.min_qty = minQty;
      effectiveMin = minQty;
    }
  }

  if (input.max_qty !== undefined) {
    if (input.max_qty === null || input.max_qty === '') {
      sanitized.max_qty = null;
    } else {
      const maxQty = Number(input.max_qty);
      if (!Number.isInteger(maxQty)) {
        errors.push('Max ต้องเป็นจำนวนเต็ม');
      } else if (maxQty <= effectiveMin) {
        errors.push('Max ต้องมากกว่าค่า Min');
      } else {
        sanitized.max_qty = maxQty;
      }
    }
  }

  // Version check for optimistic locking
  if (input.version !== undefined) {
    const version = Number(input.version);
    if (!Number.isInteger(version) || version < 1) {
      errors.push('Version สำหรับ Optimistic Locking ไม่ถูกต้อง');
    } else {
      sanitized.version = version;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Calculate pagination metadata
 * @param {number} total - Total row count
 * @param {number} [page=1] - Requested page
 * @param {number} [limit=25] - Items per page
 * @returns {object}
 */
export function calculatePagination(total, page = 1, limit = 25) {
  const safeTotal = Math.max(0, parseInt(total, 10) || 0);
  const safeLimit = Math.min(100, Math.max(5, parseInt(limit, 10) || 25));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.min(totalPages, Math.max(1, parseInt(page, 10) || 1));
  const offset = (safePage - 1) * safeLimit;

  return {
    total: safeTotal,
    page: safePage,
    limit: safeLimit,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    offset
  };
}

/**
 * Formats a number with commas and tabular display alignment.
 * @param {number} num
 * @returns {string}
 */
export function formatTabularNumber(num) {
  const val = Number(num);
  if (isNaN(val)) return '0';
  return new Intl.NumberFormat('th-TH').format(val);
}

/**
 * Movement kinds
 */
export const MOVEMENT_KIND = {
  RECEIVE: 1,
  ISSUE: 2,
  ADJUSTMENT: 3,
  REVERSAL: 4
};

export const MOVEMENT_KIND_CONFIG = {
  [MOVEMENT_KIND.RECEIVE]: {
    code: MOVEMENT_KIND.RECEIVE,
    key: 'RECEIVE',
    label: 'รับเข้า',
    badgeClass: 'badge-receive',
    colorHex: '#16a34a',
    sign: '+'
  },
  [MOVEMENT_KIND.ISSUE]: {
    code: MOVEMENT_KIND.ISSUE,
    key: 'ISSUE',
    label: 'เบิกจ่าย',
    badgeClass: 'badge-issue',
    colorHex: '#ef4444',
    sign: '-'
  },
  [MOVEMENT_KIND.ADJUSTMENT]: {
    code: MOVEMENT_KIND.ADJUSTMENT,
    key: 'ADJUSTMENT',
    label: 'ปรับยอด',
    badgeClass: 'badge-adjust',
    colorHex: '#8b5cf6',
    sign: '±'
  },
  [MOVEMENT_KIND.REVERSAL]: {
    code: MOVEMENT_KIND.REVERSAL,
    key: 'REVERSAL',
    label: 'ยกเลิกรายการ',
    badgeClass: 'badge-reversal',
    colorHex: '#d97706',
    sign: '↺'
  }
};

/**
 * Validate Reversal Movement Input
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validateReversalInput(input = {}) {
  const errors = [];
  const operatorName = (input.operator_name || '').trim();
  const reason = (input.reason || '').trim();

  if (!operatorName || operatorName.length < 2) {
    errors.push('กรุณาระบุชื่อผู้ทำรายการอย่างน้อย 2 ตัวอักษร');
  }
  if (!reason || reason.length < 3) {
    errors.push('กรุณาระบุเหตุผลการยกเลิกรายการอย่างน้อย 3 ตัวอักษร');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      operator_name: operatorName,
      reason
    }
  };
}

/**
 * Helper to escape CSV field values
 */
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Helper to format date for CSV
 */
function formatCSVDateTime(val) {
  if (!val) return '';
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Export movement ledger to Thai Excel-compatible CSV (UTF-8 with BOM)
 * @param {Array<object>} movements
 * @returns {string} CSV content prefixed with BOM
 */
export function exportMovementsToCSV(movements = []) {
  const BOM = '\uFEFF';
  const headers = [
    'ID',
    'วันเวลา',
    'ประเภท',
    'รหัสวัสดุ',
    'ชื่อวัสดุ',
    'ยี่ห้อ',
    'จำนวนเปลี่ยนแปลง',
    'หน่วยนับ',
    'เลขอ้างอิง',
    'ผู้ทำรายการ',
    'หมายเหตุ'
  ];

  const rows = movements.map(m => {
    const kindConfig = MOVEMENT_KIND_CONFIG[m.kind] || { label: 'ไม่ระบุ' };
    const deltaStr = m.delta > 0 ? `+${m.delta}` : String(m.delta);
    return [
      escapeCSV(m.id),
      escapeCSV(formatCSVDateTime(m.created_at)),
      escapeCSV(kindConfig.label),
      escapeCSV(m.part_no || ''),
      escapeCSV(m.description || ''),
      escapeCSV(m.brand_name || ''),
      escapeCSV(deltaStr),
      escapeCSV(m.unit || ''),
      escapeCSV(m.reference || ''),
      escapeCSV(m.operator_name || ''),
      escapeCSV(m.note || '')
    ].join(',');
  });

  return BOM + [headers.join(','), ...rows].join('\r\n');
}

/**
 * Stock count line status enumeration and display configurations
 */
export const COUNT_LINE_STATUS = {
  MATCH: 'MATCH',
  SURPLUS: 'SURPLUS',
  DEFICIT: 'DEFICIT'
};

export const COUNT_LINE_STATUS_CONFIG = {
  [COUNT_LINE_STATUS.MATCH]: {
    code: COUNT_LINE_STATUS.MATCH,
    label: 'ตรงกัน',
    badgeClass: 'badge-count-match',
    colorHex: '#16a34a',
    sign: '='
  },
  [COUNT_LINE_STATUS.SURPLUS]: {
    code: COUNT_LINE_STATUS.SURPLUS,
    label: 'ยอดเกิน',
    badgeClass: 'badge-count-surplus',
    colorHex: '#0284c7',
    sign: '+'
  },
  [COUNT_LINE_STATUS.DEFICIT]: {
    code: COUNT_LINE_STATUS.DEFICIT,
    label: 'ยอดขาด',
    badgeClass: 'badge-count-deficit',
    colorHex: '#ef4444',
    sign: '-'
  }
};

/**
 * Calculate discrepancy variance between system balance and counted quantity.
 * @param {number} systemQty - Current recorded balance in system
 * @param {number} countedQty - Physical quantity counted
 * @returns {{ difference: number, status: string, statusConfig: object }}
 */
export function calculateCountVariance(systemQty, countedQty) {
  const sys = Number(systemQty);
  const cnt = Number(countedQty);
  const difference = cnt - sys;

  let status = COUNT_LINE_STATUS.MATCH;
  if (difference > 0) {
    status = COUNT_LINE_STATUS.SURPLUS;
  } else if (difference < 0) {
    status = COUNT_LINE_STATUS.DEFICIT;
  }

  return {
    difference,
    status,
    statusConfig: COUNT_LINE_STATUS_CONFIG[status]
  };
}

/**
 * Validate a single stock count line input.
 * @param {object} line
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validateStockCountLineInput(line = {}) {
  const errors = [];
  const partId = parseInt(line.part_id, 10);
  const countedQty = Number(line.counted_qty);
  const reason = line.reason ? String(line.reason).trim() : null;

  if (!Number.isInteger(partId) || partId <= 0) {
    errors.push('รหัสพัสดุ (Part ID) ไม่ถูกต้อง');
  }

  if (!Number.isInteger(countedQty) || countedQty < 0) {
    errors.push('จำนวนที่นับได้ต้องเป็นจำนวนเต็มที่มากกว่าหรือเท่ากับ 0');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      part_id: partId,
      counted_qty: countedQty,
      reason
    }
  };
}

/**
 * Calculate statistical summary for a set of count lines.
 * @param {Array<object>} lines - Array of count line items
 * @returns {object} Summary counts and differences
 */
export function calculateStockCountSummary(lines = []) {
  let totalCounted = 0;
  let matchCount = 0;
  let surplusCount = 0;
  let deficitCount = 0;
  let netDifference = 0;
  let absoluteDifference = 0;

  for (const line of lines) {
    if (line.counted_qty === null || line.counted_qty === undefined || line.counted_qty === '') {
      continue;
    }
    totalCounted++;
    const sys = Number(line.system_qty ?? 0);
    const cnt = Number(line.counted_qty);
    const diff = cnt - sys;
    netDifference += diff;
    absoluteDifference += Math.abs(diff);

    if (diff === 0) {
      matchCount++;
    } else if (diff > 0) {
      surplusCount++;
    } else {
      deficitCount++;
    }
  }

  return {
    totalItems: lines.length,
    totalCounted,
    matchCount,
    surplusCount,
    deficitCount,
    discrepancyCount: surplusCount + deficitCount,
    netDifference,
    absoluteDifference
  };
}

/**
 * Validate stock count session submission.
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
export function validateStockCountSubmission(input = {}) {
  const errors = [];
  const operatorName = (input.operator_name || '').trim();
  const note = input.note ? String(input.note).trim() : null;
  const rawLines = Array.isArray(input.lines) ? input.lines : [];

  if (!operatorName || operatorName.length < 2) {
    errors.push('กรุณาระบุชื่อผู้ยืนยันการตรวจนับอย่างน้อย 2 ตัวอักษร');
  }

  if (rawLines.length === 0) {
    errors.push('ต้องมีรายการตรวจนับอย่างน้อย 1 รายการ');
  }

  const sanitizedLines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const res = validateStockCountLineInput(rawLines[i]);
    if (!res.valid) {
      errors.push(`รายการที่ ${i + 1}: ${res.errors.join(', ')}`);
    } else {
      sanitizedLines.push(res.sanitized);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      operator_name: operatorName,
      note,
      lines: sanitizedLines
    }
  };
}

