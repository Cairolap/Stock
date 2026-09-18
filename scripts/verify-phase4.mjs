import fs from 'fs';

const html = fs.readFileSync('public/index.html', 'utf-8');
const css = fs.readFileSync('public/styles.css', 'utf-8');
const app = fs.readFileSync('public/app.js', 'utf-8');

const requiredIds = [
  'view-stockcount',
  'btn-count-subtab-active',
  'btn-count-subtab-history',
  'count-subview-active',
  'count-subview-history',
  'count-session-title',
  'count-operator-name',
  'btn-reset-count-draft',
  'count-progress-text',
  'count-progress-bar',
  'stat-count-done',
  'stat-count-match',
  'stat-count-diff',
  'stat-count-pending',
  'count-search-input',
  'btn-clear-count-search',
  'count-cards-container',
  'desktop-count-table-container',
  'desktop-count-table-body',
  'count-sticky-bar',
  'bar-counted-qty',
  'bar-match-qty',
  'bar-diff-qty',
  'btn-open-confirm-count',
  'count-history-container',
  'modal-confirm-count',
  'btn-close-confirm-count-modal',
  'btn-cancel-confirm-count',
  'btn-execute-submit-count',
  'rev-total-counted',
  'rev-match-count',
  'rev-diff-count',
  'rev-net-delta',
  'rev-diff-list-count',
  'rev-discrepancy-list',
  'confirm-count-note',
  'modal-count-detail',
  'btn-close-detail-modal',
  'detail-session-title',
  'detail-session-sub',
  'detail-operator',
  'detail-created-at',
  'detail-total-lines',
  'detail-diff-lines',
  'detail-lines-container'
];

let missing = 0;
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) {
    console.error('❌ Missing ID in HTML:', id);
    missing++;
  }
}

if (missing === 0) {
  console.log(`✅ All ${requiredIds.length} required Stock Count DOM IDs are present in index.html!`);
} else {
  console.error(`❌ Total missing IDs: ${missing}`);
  process.exit(1);
}

// Check CSS classes
const requiredCss = [
  '.count-view-tabs',
  '.count-progress-card',
  '.count-progress-track',
  '.count-progress-fill',
  '.count-card',
  '.count-stepper-wrapper',
  '.btn-match-system',
  '.count-variance-badge',
  '.badge-variance-match',
  '.badge-variance-surplus',
  '.badge-variance-deficit',
  '.count-sticky-bar',
  '.history-session-card'
];

let missingCss = 0;
for (const c of requiredCss) {
  if (!css.includes(c)) {
    console.error('❌ Missing CSS rule:', c);
    missingCss++;
  }
}

if (missingCss === 0) {
  console.log(`✅ All ${requiredCss.length} required CSS selectors are present in styles.css!`);
} else {
  process.exit(1);
}

// Verify live preview server endpoints
const base = 'http://localhost:4180';
console.log('Testing live preview server API endpoints at', base);

// 1. GET /api/counts
const res1 = await fetch(base + '/api/counts');
const json1 = await res1.json();
if (!res1.ok || !json1.success || !Array.isArray(json1.data)) {
  console.error('GET /api/counts failed:', json1);
  process.exit(1);
}
console.log(`✅ GET /api/counts returned ${json1.data.length} sessions.`);

// 2. GET /api/counts/1
const res2 = await fetch(base + '/api/counts/1');
const json2 = await res2.json();
if (!res2.ok || !json2.success || !json2.data?.lines) {
  console.error('GET /api/counts/1 failed:', json2);
  process.exit(1);
}
console.log(`✅ GET /api/counts/1 returned session with ${json2.data.lines.length} lines.`);

// 3. POST /api/counts/complete
const res3 = await fetch(base + '/api/counts/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'รอบตรวจนับตรวจสอบความถูกต้อง',
    operator_name: 'นายคลังสินค้า พรหม',
    note: 'ตรวจนับสต๊อกจริงทดสอบ',
    lines: [
      { part_id: 1, counted_qty: 10, reason: 'รับสินค้าเข้าเพิ่ม' },
      { part_id: 3, counted_qty: 15, reason: null }
    ]
  })
});
const json3 = await res3.json();
if (!res3.ok || !json3.success || !json3.data?.count_id) {
  console.error('POST /api/counts/complete failed:', json3);
  process.exit(1);
}
console.log(`✅ POST /api/counts/complete succeeded: created session #AUD-${json3.data.count_id} with ${json3.data.total_counted_lines} lines.`);

console.log('🎉 ALL PHASE 4 VERIFICATIONS PASSED 100%!');
