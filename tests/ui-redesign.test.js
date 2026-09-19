import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'public', 'styles.css'), 'utf8');
const app = readFileSync(join(root, 'public', 'app.js'), 'utf8');
const design = readFileSync(join(root, 'DESIGN.md'), 'utf8');

test('dashboard uses a single attention hierarchy instead of four KPI cards', () => {
  assert.match(html, /class="attention-panel"/);
  assert.match(html, /id="val-attention-count"/);
  assert.doesNotMatch(html, /class="kpi-grid"/);
});

test('mobile navigation exposes one canonical action entry', () => {
  assert.match(html, /id="nav-action"/);
  assert.match(html, /id="modal-action-menu"/);
  assert.match(app, /function openActionMenu/);
  assert.match(app, /function closeActionMenu/);
});

test('part list uses stock rail and production copy without emoji filters', () => {
  assert.match(app, /class="stock-rail/);
  assert.match(css, /\.stock-rail/);
  assert.doesNotMatch(html, />🚨 ติดลบ</);
  assert.doesNotMatch(html, />⛔ หมดสต๊อก</);
  assert.doesNotMatch(html, />⚠️ ถึงจุดสั่งซื้อ</);
});

test('durable design context records the refined art direction', () => {
  assert.match(design, /Inventory Control Label/);
  assert.match(design, /Stock Rail/);
});
