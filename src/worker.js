// ==========================================================
// Stock Management Mobile: Cloudflare Worker API & Static Router
// Compliant with Cloudflare D1, R2, and Workers Static Assets
// ==========================================================

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
  IMAGE_CONFIG,
  COUNT_LINE_STATUS,
  COUNT_LINE_STATUS_CONFIG,
  calculateCountVariance,
  validateStockCountLineInput,
  calculateStockCountSummary,
  validateStockCountSubmission
} from './core.js';

/**
 * Standard JSON response helper
 */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, If-Match',
      ...headers
    }
  });
}

function errorJson(code, message, status = 400, details = null) {
  return json(
    {
      success: false,
      error: { code, message, details }
    },
    status
  );
}

export default {
  /**
   * Main Worker fetch router
   * @param {Request} request
   * @param {object} env
   * @param {object} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, If-Match'
        }
      });
    }

    // Only route /api/* to the Worker logic; all others pass to Static Assets
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response('Static Assets Binding Not Configured', { status: 404 });
    }

    try {
      // ----------------------------------------------------
      // 1. Health check
      // ----------------------------------------------------
      if (pathname === '/api/health' && method === 'GET') {
        return json({
          success: true,
          status: 'healthy',
          timestamp: Math.floor(Date.now() / 1000)
        });
      }

      // Ensure DB binding is present
      if (!env.DB) {
        return errorJson('DB_UNAVAILABLE', 'Database binding not configured on Worker', 500);
      }

      // ----------------------------------------------------
      // 2. Dashboard KPIs & Urgent Restocks
      // ----------------------------------------------------
      if (pathname === '/api/dashboard' && method === 'GET') {
        const todayMidnight = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

        // Fetch counts in parallel
        const [countsResult, todayMovements, urgentItems] = await Promise.all([
          env.DB.prepare(`
            SELECT
              COUNT(*) AS total_parts,
              SUM(CASE WHEN qty < 0 THEN 1 ELSE 0 END) AS negative_count,
              SUM(CASE WHEN qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
              SUM(CASE WHEN qty > 0 AND qty <= min_qty THEN 1 ELSE 0 END) AS low_stock_count
            FROM parts
            WHERE active = 1
          `).first(),
          env.DB.prepare(`
            SELECT COUNT(*) AS count FROM movements WHERE created_at >= ?
          `).bind(todayMidnight).first(),
          env.DB.prepare(`
            SELECT
              p.id, p.part_no, p.description, p.qty, p.min_qty, p.max_qty, p.unit, p.location, p.image_key,
              b.name AS brand_name
            FROM parts p
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.active = 1 AND p.qty <= p.min_qty
            ORDER BY p.qty ASC, p.id ASC
            LIMIT 10
          `).all()
        ]);

        const urgentList = (urgentItems?.results || []).map(p => {
          const status = calculateStockStatus(p.qty, p.min_qty, p.max_qty);
          return {
            id: p.id,
            part_no: p.part_no,
            description: p.description,
            brand_name: p.brand_name,
            qty: p.qty,
            min_qty: p.min_qty,
            max_qty: p.max_qty,
            unit: p.unit,
            location: p.location,
            image_key: p.image_key,
            status,
            status_config: STOCK_STATUS_CONFIG[status],
            recommended_replenish: calculateReplenishment(p.qty, p.min_qty, p.max_qty)
          };
        });

        return json({
          success: true,
          data: {
            total_parts: countsResult?.total_parts || 0,
            negative_count: countsResult?.negative_count || 0,
            out_of_stock_count: countsResult?.out_of_stock_count || 0,
            low_stock_count: countsResult?.low_stock_count || 0,
            today_movements: todayMovements?.count || 0,
            urgent_replenishments: urgentList
          }
        });
      }

      // ----------------------------------------------------
      // 3. Brands list
      // ----------------------------------------------------
      if (pathname === '/api/brands' && method === 'GET') {
        const brands = await env.DB.prepare(`SELECT id, name FROM brands ORDER BY name ASC`).all();
        return json({ success: true, data: brands.results || [] });
      }

      // ----------------------------------------------------
      // 4. Parts Catalog: GET /api/parts (Search, Filter, Pagination)
      // ----------------------------------------------------
      if (pathname === '/api/parts' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        const statusFilter = (url.searchParams.get('status') || '').trim().toUpperCase();
        const brandId = url.searchParams.get('brand_id');
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get('limit') || '25', 10)));
        const offset = (page - 1) * limit;

        const whereClauses = ['p.active = 1'];
        const bindings = [];

        if (q) {
          whereClauses.push('(p.part_no LIKE ? OR p.description LIKE ?)');
          bindings.push(`%${q}%`, `%${q}%`);
        }

        if (brandId) {
          whereClauses.push('p.brand_id = ?');
          bindings.push(parseInt(brandId, 10));
        }

        if (statusFilter === 'NEGATIVE') {
          whereClauses.push('p.qty < 0');
        } else if (statusFilter === 'OUT_OF_STOCK') {
          whereClauses.push('p.qty = 0');
        } else if (statusFilter === 'LOW_STOCK') {
          whereClauses.push('p.qty > 0 AND p.qty <= p.min_qty');
        } else if (statusFilter === 'NORMAL') {
          whereClauses.push('p.qty > p.min_qty AND (p.max_qty IS NULL OR p.qty < p.max_qty)');
        } else if (statusFilter === 'OVER_MAX') {
          whereClauses.push('p.max_qty IS NOT NULL AND p.qty >= p.max_qty');
        }

        const whereSql = whereClauses.join(' AND ');

        // Run count query and data query in parallel
        const [totalResult, listResult] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS total FROM parts p WHERE ${whereSql}`).bind(...bindings).first(),
          env.DB.prepare(`
            SELECT
              p.id, p.part_no, p.description, p.qty, p.min_qty, p.max_qty, p.unit, p.location, p.image_key, p.version, p.created_at, p.updated_at,
              b.name AS brand_name
            FROM parts p
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE ${whereSql}
            ORDER BY p.id DESC
            LIMIT ? OFFSET ?
          `).bind(...bindings, limit, offset).all()
        ]);

        const parts = (listResult?.results || []).map(p => {
          const status = calculateStockStatus(p.qty, p.min_qty, p.max_qty);
          return {
            id: p.id,
            part_no: p.part_no,
            description: p.description,
            brand_name: p.brand_name,
            qty: p.qty,
            min_qty: p.min_qty,
            max_qty: p.max_qty,
            unit: p.unit,
            location: p.location,
            image_key: p.image_key,
            version: p.version,
            status,
            status_config: STOCK_STATUS_CONFIG[status],
            recommended_replenish: calculateReplenishment(p.qty, p.min_qty, p.max_qty)
          };
        });

        return json({
          success: true,
          data: {
            parts,
            pagination: {
              page,
              limit,
              total: totalResult?.total || 0,
              totalPages: Math.ceil((totalResult?.total || 0) / limit)
            }
          }
        });
      }

      // ----------------------------------------------------
      // 5. Create Part: POST /api/parts
      // ----------------------------------------------------
      if (pathname === '/api/parts' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const validation = validatePartInput(body);

        if (!validation.valid) {
          return errorJson('VALIDATION_ERROR', 'ข้อมูลวัสดุไม่ถูกต้อง', 400, validation.errors);
        }

        const { part_no, description, brand_name, min_qty, max_qty, unit, location } = validation.sanitized;
        const now = Math.floor(Date.now() / 1000);

        // Resolve brand_id if brand_name provided
        let brandId = null;
        if (brand_name) {
          await env.DB.prepare(`INSERT OR IGNORE INTO brands (name) VALUES (?)`).bind(brand_name).run();
          const brandRow = await env.DB.prepare(`SELECT id FROM brands WHERE name = ? COLLATE NOCASE`).bind(brand_name).first();
          if (brandRow) brandId = brandRow.id;
        }

        // Check part_no duplicate
        const existing = await env.DB.prepare(`SELECT id FROM parts WHERE part_no = ? COLLATE NOCASE`).bind(part_no).first();
        if (existing) {
          return errorJson('DUPLICATE_PART', `Part Number "${part_no}" มีอยู่ในระบบแล้ว`, 409);
        }

        const insertResult = await env.DB.prepare(`
          INSERT INTO parts (part_no, description, brand_id, qty, min_qty, max_qty, unit, location, created_at, updated_at)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        `).bind(part_no, description, brandId, min_qty, max_qty, unit, location, now, now).run();

        const createdId = insertResult.meta?.last_row_id;

        return json(
          {
            success: true,
            data: {
              id: createdId,
              part_no,
              description,
              brand_name,
              qty: 0,
              min_qty,
              max_qty,
              unit,
              location
            }
          },
          201
        );
      }

      // ----------------------------------------------------
      // Regex router for Part-specific routes: /api/parts/:id(/...)
      // ----------------------------------------------------
      const partRouteMatch = pathname.match(/^\/api\/parts\/(\d+)(?:\/([a-zA-Z0-9_-]+))?$/);
      if (partRouteMatch) {
        const partId = parseInt(partRouteMatch[1], 10);
        const subAction = partRouteMatch[2]; // undefined, 'receive', 'issue', 'movements', 'image'

        // 6. GET /api/parts/:id
        if (!subAction && method === 'GET') {
          const part = await env.DB.prepare(`
            SELECT
              p.*, b.name AS brand_name
            FROM parts p
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ? AND p.active = 1
          `).bind(partId).first();

          if (!part) {
            return errorJson('NOT_FOUND', 'ไม่พบข้อมูลวัสดุที่ระบุ', 404);
          }

          const status = calculateStockStatus(part.qty, part.min_qty, part.max_qty);
          const recentMovements = await env.DB.prepare(`
            SELECT id, kind, delta, operator_name, reference, note, created_at
            FROM movements
            WHERE part_id = ?
            ORDER BY id DESC
            LIMIT 10
          `).bind(partId).all();

          return json({
            success: true,
            data: {
              ...part,
              status,
              status_config: STOCK_STATUS_CONFIG[status],
              recommended_replenish: calculateReplenishment(part.qty, part.min_qty, part.max_qty),
              recent_movements: recentMovements.results || []
            }
          });
        }

        // 6b. PATCH /api/parts/:id (แก้ไขข้อมูลวัสดุ พร้อม Optimistic Concurrency Control)
        if (!subAction && method === 'PATCH') {
          const body = await request.json().catch(() => ({}));
          const part = await env.DB.prepare(`SELECT * FROM parts WHERE id = ? AND active = 1`).bind(partId).first();
          if (!part) return errorJson('NOT_FOUND', 'ไม่พบข้อมูลวัสดุที่ระบุ', 404);

          // Optimistic Locking Check
          const ifMatch = request.headers.get('If-Match');
          const expectedVersion = ifMatch ? parseInt(ifMatch, 10) : (body.version ? parseInt(body.version, 10) : null);
          if (expectedVersion !== null && !isNaN(expectedVersion) && part.version !== expectedVersion) {
            return errorJson('CONFLICT', 'ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชก่อนแก้ไข', 409, { current_version: part.version });
          }

          const validation = validatePartUpdateInput(body, part);
          if (!validation.valid) {
            return errorJson('VALIDATION_ERROR', 'ข้อมูลการแก้ไขไม่ถูกต้อง', 400, validation.errors);
          }

          const updates = validation.sanitized;
          const setClauses = [];
          const bindings = [];

          if (updates.description !== undefined) { setClauses.push('description = ?'); bindings.push(updates.description); }
          if (updates.min_qty !== undefined) { setClauses.push('min_qty = ?'); bindings.push(updates.min_qty); }
          if (updates.max_qty !== undefined) { setClauses.push('max_qty = ?'); bindings.push(updates.max_qty); }
          if (updates.unit !== undefined) { setClauses.push('unit = ?'); bindings.push(updates.unit); }
          if (updates.location !== undefined) { setClauses.push('location = ?'); bindings.push(updates.location); }

          if (updates.brand_name !== undefined) {
            let brandId = null;
            if (updates.brand_name) {
              await env.DB.prepare(`INSERT OR IGNORE INTO brands (name) VALUES (?)`).bind(updates.brand_name).run();
              const brandRow = await env.DB.prepare(`SELECT id FROM brands WHERE name = ? COLLATE NOCASE`).bind(updates.brand_name).first();
              if (brandRow) brandId = brandRow.id;
            }
            setClauses.push('brand_id = ?');
            bindings.push(brandId);
          }

          if (setClauses.length > 0) {
            const now = Math.floor(Date.now() / 1000);
            setClauses.push('version = version + 1', 'updated_at = ?');
            bindings.push(now, partId);

            await env.DB.prepare(`UPDATE parts SET ${setClauses.join(', ')} WHERE id = ?`).bind(...bindings).run();
          }

          const updated = await env.DB.prepare(`
            SELECT p.*, b.name AS brand_name
            FROM parts p
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?
          `).bind(partId).first();

          const status = calculateStockStatus(updated.qty, updated.min_qty, updated.max_qty);
          return json({
            success: true,
            data: {
              ...updated,
              status,
              status_config: STOCK_STATUS_CONFIG[status],
              recommended_replenish: calculateReplenishment(updated.qty, updated.min_qty, updated.max_qty)
            }
          });
        }

        // 6c. DELETE /api/parts/:id (Soft Delete วัสดุ รักษาประวัติการเคลื่อนไหว)
        if (!subAction && method === 'DELETE') {
          const now = Math.floor(Date.now() / 1000);
          const result = await env.DB.prepare(`
            UPDATE parts SET active = 0, version = version + 1, updated_at = ? WHERE id = ? AND active = 1
          `).bind(now, partId).run();

          if (!result.meta?.changes) {
            return errorJson('NOT_FOUND', 'ไม่พบข้อมูลวัสดุที่ระบุหรือถูกลบไปแล้ว', 404);
          }

          return json({ success: true, message: 'ลบรายการพัสดุเรียบร้อยแล้ว (Soft Delete)' });
        }

        // 7. POST /api/parts/:id/receive (รับเข้าวัสดุ)
        if (subAction === 'receive' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const validation = validateMovementInput(body);

          if (!validation.valid) {
            return errorJson('VALIDATION_ERROR', 'ข้อมูลการรับเข้าไม่ถูกต้อง', 400, validation.errors);
          }

          const requestKey = request.headers.get('Idempotency-Key') || `recv-${partId}-${Date.now()}-${Math.random()}`;
          const { quantity, operator_name, reference, note } = validation.sanitized;
          const now = Math.floor(Date.now() / 1000);

          try {
            await env.DB.prepare(`
              INSERT INTO movements (request_key, part_id, kind, delta, operator_name, reference, note, created_at)
              VALUES (?, ?, 1, ?, ?, ?, ?, ?)
            `).bind(requestKey, partId, quantity, operator_name, reference, note, now).run();

            // Fetch new balance updated by Trigger
            const updated = await env.DB.prepare(`SELECT qty, min_qty, max_qty, version FROM parts WHERE id = ?`).bind(partId).first();
            const newStatus = calculateStockStatus(updated.qty, updated.min_qty, updated.max_qty);

            return json({
              success: true,
              data: {
                part_id: partId,
                delta: quantity,
                new_qty: updated.qty,
                version: updated.version,
                status: newStatus,
                status_config: STOCK_STATUS_CONFIG[newStatus]
              }
            });
          } catch (err) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
              return errorJson('IDEMPOTENT_DUPLICATE', 'คำสั่งรับเข้านี้ถูกบันทึกไปแล้ว (Duplicate Request)', 409);
            }
            throw err;
          }
        }

        // 8. POST /api/parts/:id/issue (เบิกออกวัสดุ - ยอดติดลบได้)
        if (subAction === 'issue' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const validation = validateMovementInput(body);

          if (!validation.valid) {
            return errorJson('VALIDATION_ERROR', 'ข้อมูลการเบิกออกไม่ถูกต้อง', 400, validation.errors);
          }

          const requestKey = request.headers.get('Idempotency-Key') || `issue-${partId}-${Date.now()}-${Math.random()}`;
          const { quantity, operator_name, reference, note } = validation.sanitized;
          const now = Math.floor(Date.now() / 1000);
          const delta = -Math.abs(quantity);

          try {
            await env.DB.prepare(`
              INSERT INTO movements (request_key, part_id, kind, delta, operator_name, reference, note, created_at)
              VALUES (?, ?, 2, ?, ?, ?, ?, ?)
            `).bind(requestKey, partId, delta, operator_name, reference, note, now).run();

            // Fetch new balance updated by Trigger
            const updated = await env.DB.prepare(`SELECT qty, min_qty, max_qty, version FROM parts WHERE id = ?`).bind(partId).first();
            const newStatus = calculateStockStatus(updated.qty, updated.min_qty, updated.max_qty);

            return json({
              success: true,
              data: {
                part_id: partId,
                delta,
                new_qty: updated.qty,
                version: updated.version,
                status: newStatus,
                status_config: STOCK_STATUS_CONFIG[newStatus],
                warning: updated.qty < 0 ? 'สต๊อกติดลบ กรุณาประสานงานสั่งซื้อ/รับเข้าชดเชย' : null
              }
            });
          } catch (err) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
              return errorJson('IDEMPOTENT_DUPLICATE', 'คำสั่งเบิกนี้ถูกบันทึกไปแล้ว (Duplicate Request)', 409);
            }
            throw err;
          }
        }

        // 9. GET /api/parts/:id/movements
        if (subAction === 'movements' && method === 'GET') {
          const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit') || '20', 10)));
          const movements = await env.DB.prepare(`
            SELECT id, request_key, kind, delta, operator_name, reference, note, created_at
            FROM movements
            WHERE part_id = ?
            ORDER BY id DESC
            LIMIT ?
          `).bind(partId, limit).all();

          return json({ success: true, data: movements.results || [] });
        }

        // 10. Image routes: GET /api/parts/:id/image & PUT /api/parts/:id/image
        if (subAction === 'image') {
          if (method === 'GET') {
            const part = await env.DB.prepare(`SELECT image_key FROM parts WHERE id = ?`).bind(partId).first();
            if (!part || !part.image_key) {
              return new Response(null, { status: 404 });
            }

            // 1) If in R2
            if (env.IMAGES_BUCKET && !part.image_key.startsWith('d1:')) {
              const object = await env.IMAGES_BUCKET.get(part.image_key);
              if (object) {
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);
                headers.set('Cache-Control', 'public, max-age=86400');
                return new Response(object.body, { headers });
              }
            }

            // 2) Fallback to D1 part_images table (SQLite BLOB)
            const imgRow = await env.DB.prepare(`SELECT mime_type, data FROM part_images WHERE part_id = ?`).bind(partId).first();
            if (imgRow && imgRow.data) {
              const bodyBytes = Array.isArray(imgRow.data)
                ? new Uint8Array(imgRow.data)
                : (imgRow.data instanceof ArrayBuffer || imgRow.data instanceof Uint8Array
                    ? imgRow.data
                    : new Uint8Array(imgRow.data));

              return new Response(bodyBytes, {
                headers: {
                  'Content-Type': imgRow.mime_type || 'image/webp',
                  'Content-Length': String(bodyBytes.byteLength || bodyBytes.length),
                  'Cache-Control': 'public, max-age=86400'
                }
              });
            }

            return new Response(null, { status: 404 });
          }

          if (method === 'PUT') {
            const blob = await request.arrayBuffer();
            if (!blob || blob.byteLength === 0) {
              return errorJson('EMPTY_IMAGE', 'ไฟล์รูปภาพว่างเปล่า', 400);
            }
            if (blob.byteLength > 600 * 1024) {
              return errorJson('IMAGE_TOO_LARGE', 'รูปภาพต้องไม่เกิน 600 KB หลังย่อขนาด', 400);
            }

            const contentType = request.headers.get('Content-Type') || 'image/webp';
            const now = Math.floor(Date.now() / 1000);

            // If R2 Storage Bucket is available, save to R2
            if (env.IMAGES_BUCKET) {
              const newKey = `parts/${partId}-${Date.now()}.webp`;
              await env.IMAGES_BUCKET.put(newKey, blob, {
                httpMetadata: { contentType }
              });

              const currentPart = await env.DB.prepare(`SELECT image_key FROM parts WHERE id = ?`).bind(partId).first();
              await env.DB.prepare(`UPDATE parts SET image_key = ?, updated_at = ? WHERE id = ?`)
                .bind(newKey, now, partId).run();

              if (currentPart?.image_key && !currentPart.image_key.startsWith('d1:')) {
                ctx.waitUntil(env.IMAGES_BUCKET.delete(currentPart.image_key).catch(() => {}));
              }

              return json({ success: true, data: { image_key: newKey, storage: 'R2' } });
            }

            // Fallback: Save to Cloudflare D1 (SQLite BLOB storage)
            const d1Key = `d1:parts/${partId}`;
            await env.DB.prepare(`
              INSERT INTO part_images (part_id, mime_type, data, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(part_id) DO UPDATE SET
                mime_type = excluded.mime_type,
                data = excluded.data,
                updated_at = excluded.updated_at
            `).bind(partId, contentType, new Uint8Array(blob), now).run();

            await env.DB.prepare(`UPDATE parts SET image_key = ?, updated_at = ? WHERE id = ?`)
              .bind(d1Key, now, partId).run();

            return json({ success: true, data: { image_key: d1Key, storage: 'D1' } });
          }

          // DELETE /api/parts/:id/image
          if (method === 'DELETE') {
            const part = await env.DB.prepare(`SELECT image_key FROM parts WHERE id = ?`).bind(partId).first();
            if (part?.image_key) {
              if (env.IMAGES_BUCKET && !part.image_key.startsWith('d1:')) {
                ctx.waitUntil(env.IMAGES_BUCKET.delete(part.image_key).catch(() => {}));
              }
              await env.DB.prepare(`DELETE FROM part_images WHERE part_id = ?`).bind(partId).run();
            }
            await env.DB.prepare(`UPDATE parts SET image_key = NULL, updated_at = ? WHERE id = ?`)
              .bind(Math.floor(Date.now() / 1000), partId).run();
            return json({ success: true, message: 'ลบรูปภาพเรียบร้อยแล้ว' });
          }
        }
      }

      // ----------------------------------------------------
      // 11a. List Stock Count Audit Sessions: GET /api/counts
      // ----------------------------------------------------
      if (pathname === '/api/counts' && method === 'GET') {
        const counts = await env.DB.prepare(`
          SELECT
            c.id, c.status, c.operator_name, c.note, c.started_at, c.completed_at,
            COUNT(l.part_id) AS total_lines,
            SUM(CASE WHEN l.difference != 0 THEN 1 ELSE 0 END) AS discrepancy_lines,
            SUM(CASE WHEN l.difference = 0 THEN 1 ELSE 0 END) AS match_lines,
            COALESCE(SUM(l.difference), 0) AS net_difference,
            COALESCE(SUM(ABS(l.difference)), 0) AS absolute_difference
          FROM stock_counts c
          LEFT JOIN stock_count_lines l ON c.id = l.count_id
          GROUP BY c.id
          ORDER BY c.id DESC
          LIMIT 50
        `).all();

        return json({
          success: true,
          data: counts.results || []
        });
      }

      // ----------------------------------------------------
      // 11b. Get Stock Count Details: GET /api/counts/:id
      // ----------------------------------------------------
      const countDetailMatch = pathname.match(/^\/api\/counts\/(\d+)$/);
      if (countDetailMatch && method === 'GET') {
        const countId = parseInt(countDetailMatch[1], 10);
        const header = await env.DB.prepare(`
          SELECT * FROM stock_counts WHERE id = ?
        `).bind(countId).first();

        if (!header) {
          return errorJson('NOT_FOUND', 'ไม่พบประวัติรอบตรวจนับที่ระบุ', 404);
        }

        const lines = await env.DB.prepare(`
          SELECT
            l.count_id, l.part_id, l.system_qty, l.counted_qty, l.difference, l.reason,
            p.part_no, p.description, p.unit, p.location,
            b.name AS brand_name
          FROM stock_count_lines l
          JOIN parts p ON l.part_id = p.id
          LEFT JOIN brands b ON p.brand_id = b.id
          WHERE l.count_id = ?
          ORDER BY l.part_id ASC
        `).bind(countId).all();

        const lineResults = (lines.results || []).map(l => ({
          ...l,
          variance_status: l.difference === 0 ? COUNT_LINE_STATUS.MATCH : (l.difference > 0 ? COUNT_LINE_STATUS.SURPLUS : COUNT_LINE_STATUS.DEFICIT),
          status_config: COUNT_LINE_STATUS_CONFIG[l.difference === 0 ? COUNT_LINE_STATUS.MATCH : (l.difference > 0 ? COUNT_LINE_STATUS.SURPLUS : COUNT_LINE_STATUS.DEFICIT)]
        }));

        const summary = calculateStockCountSummary(lineResults);

        return json({
          success: true,
          data: {
            ...header,
            summary,
            lines: lineResults
          }
        });
      }

      // ----------------------------------------------------
      // 11c. Complete Stock Count Session: POST /api/counts/complete
      // ----------------------------------------------------
      if (pathname === '/api/counts/complete' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const validation = validateStockCountSubmission(body);

        if (!validation.valid) {
          return errorJson('VALIDATION_ERROR', 'ข้อมูลการตรวจนับไม่ถูกต้อง', 400, validation.errors);
        }

        const { operator_name, note, lines } = validation.sanitized;
        const now = Math.floor(Date.now() / 1000);

        // 1. Create Stock Count header
        const countHeader = await env.DB.prepare(`
          INSERT INTO stock_counts (status, operator_name, note, started_at, completed_at)
          VALUES (2, ?, ?, ?, ?)
        `).bind(operator_name, note, now, now).run();

        const countId = countHeader.meta?.last_row_id;
        const statements = [];

        // 2. Prepare atomic adjustments using LIVE database balance:
        // delta = counted_qty - live_current_qty
        for (const line of lines) {
          const partId = line.part_id;
          const countedQty = line.counted_qty;
          const requestKey = `count-${countId}-part-${partId}-${now}`;
          const reason = line.reason || 'ปรับยอดจากการตรวจนับสต๊อก';

          // Insert movement only if live difference != 0
          statements.push(
            env.DB.prepare(`
              INSERT INTO movements (request_key, part_id, kind, delta, operator_name, reference, note, count_id, created_at)
              SELECT ?, p.id, 3, (? - p.qty), ?, ?, ?, ?, ?
              FROM parts p
              WHERE p.id = ? AND (? - p.qty) != 0
            `).bind(requestKey, countedQty, operator_name, `COUNT-SESSION-#${countId}`, reason, countId, now, partId, countedQty)
          );

          // Record line in stock_count_lines (all lines recorded for audit trail)
          statements.push(
            env.DB.prepare(`
              INSERT INTO stock_count_lines (count_id, part_id, system_qty, counted_qty, difference, reason)
              SELECT ?, p.id, p.qty, ?, (? - p.qty), ?
              FROM parts p
              WHERE p.id = ?
            `).bind(countId, countedQty, countedQty, reason, partId)
          );
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        // Fetch count of adjustments made
        const adjustments = await env.DB.prepare(`
          SELECT COUNT(*) AS count FROM movements WHERE count_id = ?
        `).bind(countId).first();

        return json({
          success: true,
          data: {
            count_id: countId,
            operator_name,
            total_counted_lines: lines.length,
            adjusted_movements_count: adjustments?.count || 0,
            completed_at: now
          }
        }, 201);
      }

      // ----------------------------------------------------
      // 12. Export Movement Ledger CSV: GET /api/movements/export
      // ----------------------------------------------------
      if (pathname === '/api/movements/export' && method === 'GET') {
        const kindParam = url.searchParams.get('kind');
        const partIdParam = url.searchParams.get('part_id');
        const q = (url.searchParams.get('q') || '').trim();

        const whereClauses = [];
        const bindings = [];

        if (kindParam) {
          whereClauses.push('m.kind = ?');
          bindings.push(parseInt(kindParam, 10));
        }

        if (partIdParam) {
          whereClauses.push('m.part_id = ?');
          bindings.push(parseInt(partIdParam, 10));
        }

        if (q) {
          whereClauses.push('(p.part_no LIKE ? OR p.description LIKE ? OR m.reference LIKE ? OR m.operator_name LIKE ?)');
          const term = `%${q}%`;
          bindings.push(term, term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const rowsResult = await env.DB.prepare(`
          SELECT
            m.id, m.created_at, m.kind, m.delta, m.operator_name, m.reference, m.note,
            p.part_no, p.description, p.unit,
            b.name AS brand_name
          FROM movements m
          JOIN parts p ON m.part_id = p.id
          LEFT JOIN brands b ON p.brand_id = b.id
          ${whereSql}
          ORDER BY m.id DESC
          LIMIT 5000
        `).bind(...bindings).all();

        const csvContent = exportMovementsToCSV(rowsResult?.results || []);

        return new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="stock-movements.csv"',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // ----------------------------------------------------
      // 13. Global Movement Ledger: GET /api/movements
      // ----------------------------------------------------
      if (pathname === '/api/movements' && method === 'GET') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get('limit') || '25', 10)));
        const offset = (page - 1) * limit;

        const kindParam = url.searchParams.get('kind');
        const partIdParam = url.searchParams.get('part_id');
        const q = (url.searchParams.get('q') || '').trim();

        const whereClauses = [];
        const bindings = [];

        if (kindParam) {
          whereClauses.push('m.kind = ?');
          bindings.push(parseInt(kindParam, 10));
        }

        if (partIdParam) {
          whereClauses.push('m.part_id = ?');
          bindings.push(parseInt(partIdParam, 10));
        }

        if (q) {
          whereClauses.push('(p.part_no LIKE ? OR p.description LIKE ? OR m.reference LIKE ? OR m.operator_name LIKE ?)');
          const term = `%${q}%`;
          bindings.push(term, term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const [totalResult, rowsResult] = await Promise.all([
          env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM movements m
            JOIN parts p ON m.part_id = p.id
            ${whereSql}
          `).bind(...bindings).first(),
          env.DB.prepare(`
            SELECT
              m.id, m.request_key, m.part_id, m.kind, m.delta, m.operator_name, m.reference, m.note, m.count_id, m.created_at,
              p.part_no, p.description, p.unit,
              b.name AS brand_name
            FROM movements m
            JOIN parts p ON m.part_id = p.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereSql}
            ORDER BY m.id DESC
            LIMIT ? OFFSET ?
          `).bind(...bindings, limit, offset).all()
        ]);

        const total = totalResult?.total || 0;
        const pagination = calculatePagination(total, page, limit);

        const movements = (rowsResult?.results || []).map(m => ({
          ...m,
          kind_config: MOVEMENT_KIND_CONFIG[m.kind] || { label: 'ไม่ระบุ', badgeClass: 'badge-default' },
          is_reversible: m.kind !== 4 && !(m.reference && m.reference.startsWith('REV-#'))
        }));

        return json({
          success: true,
          data: {
            movements,
            pagination
          }
        });
      }

      // ----------------------------------------------------
      // 14. Non-Destructive Compensating Reversal: POST /api/movements/:id/reverse
      // ----------------------------------------------------
      const reverseMatch = pathname.match(/^\/api\/movements\/(\d+)\/reverse$/);
      if (reverseMatch && method === 'POST') {
        const movementId = parseInt(reverseMatch[1], 10);
        const body = await request.json().catch(() => ({}));
        const validation = validateReversalInput(body);

        if (!validation.valid) {
          return errorJson('VALIDATION_ERROR', 'ข้อมูลการยกเลิกรายการไม่ถูกต้อง', 400, validation.errors);
        }

        const original = await env.DB.prepare(`
          SELECT m.*, p.part_no, p.description
          FROM movements m
          JOIN parts p ON m.part_id = p.id
          WHERE m.id = ?
        `).bind(movementId).first();

        if (!original) {
          return errorJson('NOT_FOUND', 'ไม่พบรายการเคลื่อนไหวที่ต้องการยกเลิก', 404);
        }

        if (original.kind === 4) {
          return errorJson('CANNOT_REVERSE_REVERSAL', 'ไม่สามารถยกเลิกรายการประเภท Reversal ซ้ำได้', 400);
        }

        const refCode = `REV-#${movementId}`;
        const alreadyReversed = await env.DB.prepare(`
          SELECT id FROM movements WHERE reference = ?
        `).bind(refCode).first();

        if (alreadyReversed) {
          return errorJson('ALREADY_REVERSED', `รายการนี้ถูกยกเลิกไปแล้ว (รายการยกเลิก #${alreadyReversed.id})`, 409);
        }

        const now = Math.floor(Date.now() / 1000);
        const compensatingDelta = -original.delta;
        const requestKey = `rev-${movementId}-${now}`;
        const { operator_name, reason } = validation.sanitized;
        const reversalNote = `ยกเลิกรายการ #${movementId}: ${reason}`;

        // Insert compensating movement (Trigger updates parts.qty & parts.version)
        const insertResult = await env.DB.prepare(`
          INSERT INTO movements (request_key, part_id, kind, delta, operator_name, reference, note, created_at)
          VALUES (?, ?, 4, ?, ?, ?, ?, ?)
        `).bind(requestKey, original.part_id, compensatingDelta, operator_name, refCode, reversalNote, now).run();

        const reversalId = insertResult.meta?.last_row_id;

        // Get updated part balance
        const updatedPart = await env.DB.prepare(`
          SELECT qty, min_qty, max_qty, version FROM parts WHERE id = ?
        `).bind(original.part_id).first();

        const newStatus = calculateStockStatus(updatedPart.qty, updatedPart.min_qty, updatedPart.max_qty);

        return json({
          success: true,
          data: {
            reversal_id: reversalId,
            original_id: movementId,
            part_id: original.part_id,
            part_no: original.part_no,
            compensating_delta: compensatingDelta,
            new_qty: updatedPart.qty,
            status: newStatus,
            status_config: STOCK_STATUS_CONFIG[newStatus]
          }
        }, 201);
      }

      return errorJson('NOT_FOUND', `Endpoint ${pathname} not found`, 404);
    } catch (err) {
      return errorJson('INTERNAL_SERVER_ERROR', err.message || 'Internal server error', 500);
    }
  }
};
