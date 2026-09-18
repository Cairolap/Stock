// ==========================================================
// Stock Management Mobile: Local Development & Preview Server
// Lightweight zero-dependency HTTP server for testing UI & API
// ==========================================================

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateStockStatus,
  calculateReplenishment,
  validatePartInput,
  validatePartUpdateInput,
  validateMovementInput,
  validateReversalInput,
  calculatePagination,
  exportMovementsToCSV,
  STOCK_STATUS_CONFIG,
  MOVEMENT_KIND,
  MOVEMENT_KIND_CONFIG,
  COUNT_LINE_STATUS,
  COUNT_LINE_STATUS_CONFIG,
  calculateCountVariance,
  validateStockCountSubmission,
  calculateStockCountSummary
} from '../src/core.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp'
};

const imageStore = new Map();

// In-Memory Database for Preview
let nextPartId = 6;
let parts = [
  {
    id: 1,
    part_no: 'BEARING-6204',
    description: 'ตลับลูกปืนฝายาง Deep Groove Ball Bearing',
    brand_name: 'SKF',
    qty: -2,
    min_qty: 5,
    max_qty: 20,
    unit: 'ตลับ',
    location: 'Rack A-01',
    image_key: null,
    active: 1,
    version: 3
  },
  {
    id: 2,
    part_no: 'V-BELT-A32',
    description: 'สายพานร่องวี V-Belt Size A-32',
    brand_name: 'Mitsuboshi',
    qty: 0,
    min_qty: 4,
    max_qty: 15,
    unit: 'เส้น',
    location: 'Rack B-04',
    image_key: null,
    active: 1,
    version: 1
  },
  {
    id: 3,
    part_no: 'OIL-SEAL-TC25',
    description: 'ซีลน้ำมันเพลา TC 25-47-10 NBR',
    brand_name: 'NOK',
    qty: 3,
    min_qty: 5,
    max_qty: 15,
    unit: 'ตัว',
    location: 'Bin C-12',
    image_key: null,
    active: 1,
    version: 2
  },
  {
    id: 4,
    part_no: 'PNEU-FITTING-8MM',
    description: 'ข้อต่อลมตรง One-touch Fitting 8mm x R1/4',
    brand_name: 'SMC',
    qty: 45,
    min_qty: 10,
    max_qty: 100,
    unit: 'ตัว',
    location: 'Bin D-08',
    image_key: null,
    active: 1,
    version: 1
  },
  {
    id: 5,
    part_no: 'HEX-BOLT-M8X25',
    description: 'น็อตหกเหลี่ยมสแตนเลส 304 M8x25 เกลียวตลอด',
    brand_name: 'Thai Bolt',
    qty: 220,
    min_qty: 50,
    max_qty: 200,
    unit: 'ตัว',
    location: 'Shelf E-01',
    image_key: null,
    active: 1,
    version: 1
  }
];

let movements = [
  {
    id: 1,
    request_key: 'seed-1',
    part_id: 1,
    kind: 2,
    delta: -5,
    operator_name: 'ช่างวิชัย แผนกซ่อม',
    reference: 'JOB-LINE-2',
    note: 'เบิกเปลี่ยนเครื่องจักรอัดไฮดรอลิกไลน์ 2 (ยอดติดลบ)',
    created_at: Math.floor(Date.now() / 1000) - 10800
  },
  {
    id: 2,
    request_key: 'seed-2',
    part_id: 4,
    kind: 1,
    delta: 50,
    operator_name: 'สมศักดิ์ คลังกลาง',
    reference: 'PO-6709-081',
    note: 'รับเข้าจากผู้จำหน่าย SMC Thailand',
    created_at: Math.floor(Date.now() / 1000) - 7200
  },
  {
    id: 3,
    request_key: 'seed-3',
    part_id: 5,
    kind: 1,
    delta: 100,
    operator_name: 'สมศักดิ์ คลังกลาง',
    reference: 'PO-6709-082',
    note: 'รับเข้าสต๊อกประจำเดือนตามแผนสั่งซื้อ',
    created_at: Math.floor(Date.now() / 1000) - 3600
  },
  {
    id: 4,
    request_key: 'seed-4',
    part_id: 3,
    kind: 2,
    delta: -2,
    operator_name: 'ช่างอนุชา ซ่อมบำรุง',
    reference: 'REQ-MNT-44',
    note: 'เบิกเปลี่ยนซีลปั๊มน้ำหล่อเย็นตัวที่ 1',
  }
];

let nextCountId = 2;
let stockCounts = [
  {
    id: 1,
    status: 2,
    operator_name: 'สมศักดิ์ คลังกลาง',
    note: 'ตรวจนับสต๊อกประจำสัปดาห์',
    started_at: Math.floor(Date.now() / 1000) - 86400,
    completed_at: Math.floor(Date.now() / 1000) - 86400 + 1500
  }
];

let stockCountLines = [
  {
    count_id: 1,
    part_id: 4,
    system_qty: 40,
    counted_qty: 45,
    difference: 5,
    reason: 'พบของเกินในชั้นเก็บเพิ่มเติม'
  },
  {
    count_id: 1,
    part_id: 5,
    system_qty: 220,
    counted_qty: 220,
    difference: 0,
    reason: 'ตรวจนับตรงตามระบบ'
  }
];

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4180');
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // 1. Dashboard API
  if (pathname === '/api/dashboard' && method === 'GET') {
    const activeParts = parts.filter(p => p.active === 1);
    const negative = activeParts.filter(p => p.qty < 0).length;
    const out = activeParts.filter(p => p.qty === 0).length;
    const low = activeParts.filter(p => p.qty > 0 && p.qty <= p.min_qty).length;
    const urgent = activeParts
      .filter(p => p.qty <= p.min_qty)
      .sort((a, b) => a.qty - b.qty)
      .map(p => {
        const status = calculateStockStatus(p.qty, p.min_qty, p.max_qty);
        return {
          ...p,
          status,
          status_config: STOCK_STATUS_CONFIG[status],
          recommended_replenish: calculateReplenishment(p.qty, p.min_qty, p.max_qty)
        };
      });

    return sendJson(res, 200, {
      success: true,
      data: {
        total_parts: activeParts.length,
        negative_count: negative,
        out_of_stock_count: out,
        low_stock_count: low,
        today_movements: movements.length,
        urgent_replenishments: urgent
      }
    });
  }

  // 2. Parts Catalog API
  if (pathname === '/api/parts' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || '';

    let filtered = parts.filter(p => p.active === 1);

    if (q) {
      filtered = filtered.filter(p =>
        p.part_no.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.brand_name && p.brand_name.toLowerCase().includes(q))
      );
    }

    if (status) {
      filtered = filtered.filter(p => calculateStockStatus(p.qty, p.min_qty, p.max_qty) === status);
    }

    const decorated = filtered.map(p => {
      const pStatus = calculateStockStatus(p.qty, p.min_qty, p.max_qty);
      return {
        ...p,
        status: pStatus,
        status_config: STOCK_STATUS_CONFIG[pStatus],
        recommended_replenish: calculateReplenishment(p.qty, p.min_qty, p.max_qty)
      };
    });

    return sendJson(res, 200, {
      success: true,
      data: {
        parts: decorated,
        pagination: { page: 1, limit: 30, total: decorated.length, totalPages: 1 }
      }
    });
  }

  // 3. Create Part API
  if (pathname === '/api/parts' && method === 'POST') {
    const body = await readBody(req);
    const valid = validatePartInput(body);
    if (!valid.valid) {
      return sendJson(res, 400, { success: false, error: { message: valid.errors[0] } });
    }

    const { part_no, description, brand_name, min_qty, max_qty, unit, location } = valid.sanitized;
    if (parts.some(p => p.part_no.toLowerCase() === part_no.toLowerCase())) {
      return sendJson(res, 409, { success: false, error: { message: 'Part Number นี้มีอยู่แล้ว' } });
    }

    const newPart = {
      id: nextPartId++,
      part_no,
      description,
      brand_name: brand_name || null,
      qty: 0,
      min_qty,
      max_qty,
      unit,
      location,
      image_key: null,
      active: 1,
      version: 1
    };
    parts.unshift(newPart);
    return sendJson(res, 201, { success: true, data: newPart });
  }

  // 4. Movement Action: Receive or Issue
  const movementMatch = pathname.match(/^\/api\/parts\/(\d+)\/(receive|issue)$/);
  if (movementMatch && method === 'POST') {
    const partId = parseInt(movementMatch[1], 10);
    const action = movementMatch[2]; // receive or issue
    const part = parts.find(p => p.id === partId);
    if (!part) return sendJson(res, 404, { success: false, error: { message: 'ไม่พบวัสดุ' } });

    const body = await readBody(req);
    const valid = validateMovementInput(body);
    if (!valid.valid) {
      return sendJson(res, 400, { success: false, error: { message: valid.errors[0] } });
    }

    const { quantity, operator_name, reference, note } = valid.sanitized;
    const delta = action === 'receive' ? quantity : -quantity;

    part.qty += delta;
    part.version += 1;

    movements.unshift({
      id: movements.length + 1,
      request_key: `req-${Date.now()}`,
      part_id: partId,
      kind: action === 'receive' ? 1 : 2,
      delta,
      operator_name,
      reference,
      note,
      created_at: Math.floor(Date.now() / 1000)
    });

    const status = calculateStockStatus(part.qty, part.min_qty, part.max_qty);

    return sendJson(res, 200, {
      success: true,
      data: {
        part_id: partId,
        delta,
        new_qty: part.qty,
        version: part.version,
        status,
        status_config: STOCK_STATUS_CONFIG[status]
      }
    });
  }

  // 5b. GET /api/parts/:id/movements
  const partMovMatch = pathname.match(/^\/api\/parts\/(\d+)\/movements$/);
  if (partMovMatch && method === 'GET') {
    const partId = parseInt(partMovMatch[1], 10);
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get('limit') || '50', 10)));
    const partMovements = movements.filter(m => m.part_id === partId).slice(0, limit);
    return sendJson(res, 200, {
      success: true,
      data: partMovements
    });
  }

  // 5. Part-specific CRUD: GET, PATCH, DELETE /api/parts/:id
  const partDirectMatch = pathname.match(/^\/api\/parts\/(\d+)$/);
  if (partDirectMatch) {
    const partId = parseInt(partDirectMatch[1], 10);
    const part = parts.find(p => p.id === partId && p.active === 1);
    if (!part) return sendJson(res, 404, { success: false, error: { message: 'ไม่พบวัสดุ' } });

    if (method === 'GET') {
      const status = calculateStockStatus(part.qty, part.min_qty, part.max_qty);
      const partMovements = movements.filter(m => m.part_id === partId).slice(0, 10);
      return sendJson(res, 200, {
        success: true,
        data: {
          ...part,
          status,
          status_config: STOCK_STATUS_CONFIG[status],
          recommended_replenish: calculateReplenishment(part.qty, part.min_qty, part.max_qty),
          recent_movements: partMovements
        }
      });
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      const valid = validatePartUpdateInput(body, part);
      if (!valid.valid) {
        return sendJson(res, 400, { success: false, error: { message: valid.errors[0] } });
      }

      // Concurrency check
      if (body.version && part.version !== body.version) {
        return sendJson(res, 409, { success: false, error: { message: 'ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชก่อน' } });
      }

      const updates = valid.sanitized;
      if (updates.description !== undefined) part.description = updates.description;
      if (updates.brand_name !== undefined) part.brand_name = updates.brand_name;
      if (updates.min_qty !== undefined) part.min_qty = updates.min_qty;
      if (updates.max_qty !== undefined) part.max_qty = updates.max_qty;
      if (updates.unit !== undefined) part.unit = updates.unit;
      if (updates.location !== undefined) part.location = updates.location;

      part.version += 1;
      const status = calculateStockStatus(part.qty, part.min_qty, part.max_qty);

      return sendJson(res, 200, {
        success: true,
        data: {
          ...part,
          status,
          status_config: STOCK_STATUS_CONFIG[status],
          recommended_replenish: calculateReplenishment(part.qty, part.min_qty, part.max_qty)
        }
      });
    }

    if (method === 'DELETE') {
      part.active = 0;
      part.version += 1;
      return sendJson(res, 200, { success: true, message: 'ลบพัสดุเรียบร้อยแล้ว (Soft Delete)' });
    }
  }

  // 6. Image endpoints: /api/parts/:id/image
  const imageMatch = pathname.match(/^\/api\/parts\/(\d+)\/image$/);
  if (imageMatch) {
    const partId = parseInt(imageMatch[1], 10);
    const part = parts.find(p => p.id === partId);
    if (!part) return sendJson(res, 404, { success: false, error: { message: 'ไม่พบวัสดุ' } });

    if (method === 'GET') {
      const imgBuffer = imageStore.get(partId);
      if (!imgBuffer) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Image not found');
      }
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' });
      return res.end(imgBuffer);
    }

    if (method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        return sendJson(res, 400, { success: false, error: { message: 'ไฟล์รูปภาพว่างเปล่า' } });
      }

      imageStore.set(partId, buffer);
      part.image_key = `parts/${partId}.webp`;
      part.version += 1;

      return sendJson(res, 200, { success: true, data: { image_key: part.image_key } });
    }

    if (method === 'DELETE') {
      imageStore.delete(partId);
      part.image_key = null;
      part.version += 1;
      return sendJson(res, 200, { success: true, message: 'ลบรูปภาพเรียบร้อยแล้ว' });
    }
  }

  // 7. Movement CSV Export: GET /api/movements/export
  if (pathname === '/api/movements/export' && method === 'GET') {
    const kindParam = url.searchParams.get('kind');
    const partIdParam = url.searchParams.get('part_id');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let filtered = [...movements];

    if (kindParam) {
      const k = parseInt(kindParam, 10);
      filtered = filtered.filter(m => m.kind === k);
    }

    if (partIdParam) {
      const pid = parseInt(partIdParam, 10);
      filtered = filtered.filter(m => m.part_id === pid);
    }

    if (q) {
      filtered = filtered.filter(m => {
        const part = parts.find(p => p.id === m.part_id);
        const partNo = part ? part.part_no.toLowerCase() : '';
        const desc = part ? part.description.toLowerCase() : '';
        const ref = (m.reference || '').toLowerCase();
        const op = (m.operator_name || '').toLowerCase();
        return partNo.includes(q) || desc.includes(q) || ref.includes(q) || op.includes(q);
      });
    }

    const decorated = filtered.map(m => {
      const part = parts.find(p => p.id === m.part_id) || {};
      return {
        ...m,
        part_no: part.part_no || '',
        description: part.description || '',
        unit: part.unit || '',
        brand_name: part.brand_name || ''
      };
    });

    const csvContent = exportMovementsToCSV(decorated);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stock-movements.csv"',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(csvContent);
  }

  // 8. Global Movement Ledger: GET /api/movements
  if (pathname === '/api/movements' && method === 'GET') {
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get('limit') || '25', 10)));
    const kindParam = url.searchParams.get('kind');
    const partIdParam = url.searchParams.get('part_id');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let filtered = [...movements];

    if (kindParam) {
      const k = parseInt(kindParam, 10);
      filtered = filtered.filter(m => m.kind === k);
    }

    if (partIdParam) {
      const pid = parseInt(partIdParam, 10);
      filtered = filtered.filter(m => m.part_id === pid);
    }

    if (q) {
      filtered = filtered.filter(m => {
        const part = parts.find(p => p.id === m.part_id);
        const partNo = part ? part.part_no.toLowerCase() : '';
        const desc = part ? part.description.toLowerCase() : '';
        const ref = (m.reference || '').toLowerCase();
        const op = (m.operator_name || '').toLowerCase();
        return partNo.includes(q) || desc.includes(q) || ref.includes(q) || op.includes(q);
      });
    }

    const total = filtered.length;
    const pagination = calculatePagination(total, page, limit);
    const sliced = filtered.slice(pagination.offset, pagination.offset + pagination.limit);

    const decorated = sliced.map(m => {
      const part = parts.find(p => p.id === m.part_id) || {};
      return {
        ...m,
        part_no: part.part_no || '',
        description: part.description || '',
        unit: part.unit || '',
        brand_name: part.brand_name || '',
        kind_config: MOVEMENT_KIND_CONFIG[m.kind] || { label: 'ไม่ระบุ', badgeClass: 'badge-default' },
        is_reversible: m.kind !== 4 && !(m.reference && m.reference.startsWith('REV-#'))
      };
    });

    return sendJson(res, 200, {
      success: true,
      data: {
        movements: decorated,
        pagination
      }
    });
  }

  // 9. Reversal Movement: POST /api/movements/:id/reverse
  const previewRevMatch = pathname.match(/^\/api\/movements\/(\d+)\/reverse$/);
  if (previewRevMatch && method === 'POST') {
    const movementId = parseInt(previewRevMatch[1], 10);
    const original = movements.find(m => m.id === movementId);
    if (!original) {
      return sendJson(res, 404, { success: false, error: { message: 'ไม่พบรายการเคลื่อนไหว' } });
    }

    if (original.kind === 4) {
      return sendJson(res, 400, { success: false, error: { message: 'ไม่สามารถยกเลิกรายการประเภท Reversal ซ้ำได้' } });
    }

    const refCode = `REV-#${movementId}`;
    const alreadyReversed = movements.find(m => m.reference === refCode);
    if (alreadyReversed) {
      return sendJson(res, 409, { success: false, error: { message: `รายการนี้ถูกยกเลิกไปแล้ว (รายการยกเลิก #${alreadyReversed.id})` } });
    }

    const body = await readBody(req);
    const valid = validateReversalInput(body);
    if (!valid.valid) {
      return sendJson(res, 400, { success: false, error: { message: valid.errors[0] } });
    }

    const part = parts.find(p => p.id === original.part_id);
    if (!part) {
      return sendJson(res, 404, { success: false, error: { message: 'ไม่พบข้อมูลวัสดุที่เกี่ยวข้อง' } });
    }

    const compensatingDelta = -original.delta;
    part.qty += compensatingDelta;
    part.version += 1;

    const newMovement = {
      id: movements.length + 1,
      request_key: `rev-${movementId}-${Date.now()}`,
      part_id: original.part_id,
      kind: 4,
      delta: compensatingDelta,
      operator_name: valid.sanitized.operator_name,
      reference: refCode,
      note: `ยกเลิกรายการ #${movementId}: ${valid.sanitized.reason}`,
      created_at: Math.floor(Date.now() / 1000)
    };

    movements.unshift(newMovement);

    const status = calculateStockStatus(part.qty, part.min_qty, part.max_qty);

    return sendJson(res, 201, {
      success: true,
      data: {
        reversal_id: newMovement.id,
        original_id: movementId,
        part_id: original.part_id,
        part_no: part.part_no,
        compensating_delta: compensatingDelta,
        new_qty: part.qty,
        status,
        status_config: STOCK_STATUS_CONFIG[status]
      }
    });
  }

  // 10. List Stock Count Sessions: GET /api/counts
  if (pathname === '/api/counts' && method === 'GET') {
    const list = stockCounts.map(c => {
      const lines = stockCountLines.filter(l => l.count_id === c.id);
      const discrepancyLines = lines.filter(l => l.difference !== 0).length;
      const matchLines = lines.filter(l => l.difference === 0).length;
      const netDifference = lines.reduce((acc, cur) => acc + cur.difference, 0);
      const absoluteDifference = lines.reduce((acc, cur) => acc + Math.abs(cur.difference), 0);
      return {
        ...c,
        total_lines: lines.length,
        discrepancy_lines: discrepancyLines,
        match_lines: matchLines,
        net_difference: netDifference,
        absolute_difference: absoluteDifference
      };
    });
    return sendJson(res, 200, { success: true, data: list });
  }

  // 11. Get Stock Count Details: GET /api/counts/:id
  const countDetailMatch = pathname.match(/^\/api\/counts\/(\d+)$/);
  if (countDetailMatch && method === 'GET') {
    const countId = parseInt(countDetailMatch[1], 10);
    const header = stockCounts.find(c => c.id === countId);
    if (!header) {
      return sendJson(res, 404, { success: false, error: { message: 'ไม่พบประวัติรอบตรวจนับ' } });
    }

    const lines = stockCountLines
      .filter(l => l.count_id === countId)
      .map(l => {
        const part = parts.find(p => p.id === l.part_id) || {};
        const variance = calculateCountVariance(l.system_qty, l.counted_qty);
        return {
          ...l,
          part_no: part.part_no || '',
          description: part.description || '',
          unit: part.unit || '',
          location: part.location || null,
          brand_name: part.brand_name || '',
          variance_status: variance.status,
          status_config: variance.statusConfig
        };
      });

    const summary = calculateStockCountSummary(lines);

    return sendJson(res, 200, {
      success: true,
      data: {
        ...header,
        summary,
        lines
      }
    });
  }

  // 12. Complete Stock Count Session: POST /api/counts/complete
  if (pathname === '/api/counts/complete' && method === 'POST') {
    const body = await readBody(req);
    const valid = validateStockCountSubmission(body);
    if (!valid.valid) {
      return sendJson(res, 400, { success: false, error: { message: valid.errors[0] } });
    }

    const { operator_name, note, lines } = valid.sanitized;
    const now = Math.floor(Date.now() / 1000);
    const newCountId = nextCountId++;

    const countHeader = {
      id: newCountId,
      status: 2,
      operator_name,
      note: note || null,
      started_at: now,
      completed_at: now
    };
    stockCounts.unshift(countHeader);

    let adjustedCount = 0;
    for (const line of lines) {
      const part = parts.find(p => p.id === line.part_id);
      if (!part) continue;

      const delta = line.counted_qty - part.qty;
      stockCountLines.push({
        count_id: newCountId,
        part_id: part.id,
        system_qty: part.qty,
        counted_qty: line.counted_qty,
        difference: delta,
        reason: line.reason || 'ปรับยอดจากการตรวจนับสต๊อก'
      });

      if (delta !== 0) {
        adjustedCount++;
        part.qty += delta;
        part.version += 1;

        movements.unshift({
          id: movements.length + 1,
          request_key: `count-${newCountId}-part-${part.id}-${Date.now()}`,
          part_id: part.id,
          kind: 3, // Adjustment
          delta,
          operator_name,
          reference: `COUNT-SESSION-#${newCountId}`,
          note: line.reason || 'ปรับยอดจากการตรวจนับสต๊อก',
          count_id: newCountId,
          created_at: now
        });
      }
    }

    return sendJson(res, 201, {
      success: true,
      data: {
        count_id: newCountId,
        operator_name,
        total_counted_lines: lines.length,
        adjusted_movements_count: adjustedCount,
        completed_at: now
      }
    });
  }

  // 13. Static Files Serving
  try {
    let filePath;
    if (pathname.startsWith('/src/')) {
      filePath = join(srcDir, pathname.replace('/src/', ''));
    } else {
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      filePath = join(publicDir, relPath);
    }

    const ext = extname(filePath);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

const PORT = 4180;
server.listen(PORT, () => {
  console.log(`\n🚀 Stock Management Preview Server running at: http://localhost:${PORT}/\n`);
});
