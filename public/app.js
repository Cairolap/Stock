// ==========================================================
// Stock Management Mobile: Client Application Controller
// Vanilla ES Module with Local Operator Memory, Dual Responsive Views,
// and Client-Side WebP Image Compression (<350 KB)
// ==========================================================

import {
  formatTabularNumber,
  MOVEMENT_KIND_CONFIG,
  calculateCountVariance,
  COUNT_LINE_STATUS,
  COUNT_LINE_STATUS_CONFIG,
  calculateStockCountSummary
} from './core.js';
import { compressImageToWebP } from './image-scaler.js';

// Application State
const state = {
  activeTab: 'dashboard',
  activeStatusFilter: '',
  searchQuery: '',
  currentPage: 1,
  limit: 25,
  totalPages: 1,
  totalParts: 0,
  parts: [],
  selectedPart: null,
  activeMovementKind: 1, // 1: Receive, 2: Issue
  stagedImageBlob: null,

  // Phase 3: Movement Ledger & Reversals
  movements: [],
  activeMovementKindFilter: '',
  movementSearchQuery: '',
  currentMovementsPage: 1,
  totalMovements: 0,
  totalMovementsPages: 1,
  selectedMovementForReversal: null,

  // Phase 4: Stock Count Audit Session
  countActiveSubtab: 'active',
  countFilter: '',
  countSearchQuery: '',
  countParts: [],
  countDraft: {}, // partId -> { countedQty: number, difference: number, status: string, reason: string }
  countHistory: [],
  selectedCountSession: null
};

const OPERATOR_STORAGE_KEY = 'stock_last_operator_name';

// DOM References
const partsContainer = document.getElementById('parts-container');
const desktopTableBody = document.getElementById('desktop-table-body');
const paginationInfo = document.getElementById('pagination-info');
const valCurrentPage = document.getElementById('val-current-page');
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');

const searchInput = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');
const filterChips = document.querySelectorAll('#filter-chips-container .chip');

// KPI elements
const valNegative = document.getElementById('val-negative-count');
const valOut = document.getElementById('val-out-count');
const valLow = document.getElementById('val-low-count');
const valTotal = document.getElementById('val-total-parts');

// Movement Modal
const modalMovement = document.getElementById('modal-movement');
const formMovement = document.getElementById('form-movement');
const movementModalTitle = document.getElementById('movement-modal-title');
const labelActionType = document.getElementById('label-action-type');
const movementQuantity = document.getElementById('movement-quantity');
const movementOperator = document.getElementById('movement-operator');
const boxNegativeWarning = document.getElementById('box-negative-warning');
const btnSubmitMovement = document.getElementById('btn-submit-movement');

// Create Part Modal
const modalCreatePart = document.getElementById('modal-create-part');
const formCreatePart = document.getElementById('form-create-part');
const btnOpenCreatePart = document.getElementById('btn-open-create-part');
const btnCloseCreateModal = document.getElementById('btn-close-create-modal');

// Edit Part Modal
const modalEditPart = document.getElementById('modal-edit-part');
const formEditPart = document.getElementById('form-edit-part');
const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
const btnOpenImageFromEdit = document.getElementById('btn-open-image-from-edit');
const btnDeletePart = document.getElementById('btn-delete-part');
const btnSubmitEditPart = document.getElementById('btn-submit-edit-part');

// Image Upload Modal
const modalUploadImage = document.getElementById('modal-upload-image');
const btnCloseImageModal = document.getElementById('btn-close-image-modal');
const imgPartNo = document.getElementById('img-part-no');
const inputFileImage = document.getElementById('input-file-image');
const dropzoneImage = document.getElementById('dropzone-image');
const imagePreviewContainer = document.getElementById('image-preview-container');
const previewImgElement = document.getElementById('preview-img-element');
const compressionStatsText = document.getElementById('compression-stats-text');
const btnCancelImageUpload = document.getElementById('btn-cancel-image-upload');
const btnConfirmImageUpload = document.getElementById('btn-confirm-image-upload');
const boxRemoveExistingImage = document.getElementById('box-remove-existing-image');
const btnRemoveImage = document.getElementById('btn-remove-image');

// Delete Confirmation Modal
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
const deleteConfirmPartNo = document.getElementById('delete-confirm-part-no');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnExecuteDelete = document.getElementById('btn-execute-delete');

const toastContainer = document.getElementById('toast-container');

/**
 * Display toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:1rem;">✕</button>
  `;

  toast.querySelector('button').onclick = () => toast.remove();
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format timestamp in Thai Buddhist date format with time
 */
function formatDateTime(val) {
  if (!val) return '-';
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const pad = (n) => String(n).padStart(2, '0');
  const dStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
  const tStr = `${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
  return `${dStr} ${tStr}`;
}

/**
 * Fetch and render Dashboard KPIs, Urgent Restocks & Recent Movements
 */
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) return;
    const json = await res.json();
    if (!json.success || !json.data) return;

    const { total_parts, negative_count, out_of_stock_count, low_stock_count, urgent_replenishments } = json.data;
    valNegative.textContent = formatTabularNumber(negative_count);
    valOut.textContent = formatTabularNumber(out_of_stock_count);
    valLow.textContent = formatTabularNumber(low_stock_count);
    valTotal.textContent = formatTabularNumber(total_parts);

    // Render Urgent Replenishments List
    const urgentContainer = document.getElementById('urgent-replenishments-container');
    if (urgentContainer) {
      if (!urgent_replenishments || urgent_replenishments.length === 0) {
        urgentContainer.innerHTML = `
          <div style="background: #ffffff; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); padding: 16px; text-align: center; color: var(--status-normal); font-size: 0.88rem;">
            ✅ สต๊อกพัสดุทุกรายการอยู่ในระดับปลอดภัย (ไม่มีรายการต่ำกว่า Min)
          </div>
        `;
      } else {
        urgentContainer.innerHTML = urgent_replenishments.map(p => {
          const isNegative = p.qty < 0;
          return `
            <div class="urgent-item-card ${isNegative ? 'is-negative' : ''}">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong class="num-tabular" style="font-size: 0.95rem;">${escapeHtml(p.part_no)}</strong>
                  <span class="badge ${p.status_config?.badgeClass || 'badge-out'}">${p.status_config?.label || p.status}</span>
                </div>
                <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(p.description)}</div>
                <div style="font-size: 0.8rem; margin-top: 4px;">
                  คงเหลือ: <strong class="num-tabular" style="color: ${p.status_config?.colorHex || 'inherit'}">${formatTabularNumber(p.qty)}</strong> ${escapeHtml(p.unit)}
                  ${p.recommended_replenish ? `· แนะนำเติม: <strong class="num-tabular" style="color: var(--status-low);">+${formatTabularNumber(p.recommended_replenish)}</strong>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');

        urgentContainer.querySelectorAll('.urgent-item-card').forEach(card => {
          card.style.cursor = 'pointer';
          card.onclick = () => {
            const partId = parseInt(card.getAttribute('data-part-id'), 10);
            const part = (urgent_replenishments || []).find(x => x.id === partId);
            if (part) openMovementModal(part, 1);
          };
        });
      }
    }

    // Render Recent Movements Preview
    const recentMovementsContainer = document.getElementById('dashboard-recent-movements-container');
    if (recentMovementsContainer) {
      const movRes = await fetch('/api/movements?limit=5');
      if (movRes.ok) {
        const movJson = await movRes.json();
        const recentList = movJson.data?.movements || [];
        if (recentList.length === 0) {
          recentMovementsContainer.innerHTML = `
            <div style="background: #ffffff; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
              ยังไม่มีประวัติการเคลื่อนไหวสต๊อก
            </div>
          `;
        } else {
          recentMovementsContainer.innerHTML = recentList.map(m => {
            const isPos = m.delta > 0;
            const deltaStr = isPos ? `+${formatTabularNumber(m.delta)}` : formatTabularNumber(m.delta);
            const kindLabel = m.kind_config?.label || 'รายการ';
            const kindClass = m.kind_config?.badgeClass || 'badge-normal';
            return `
              <div class="recent-mini-item">
                <div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span class="badge ${kindClass}" style="font-size: 0.72rem; padding: 2px 6px;">${kindLabel}</span>
                    <strong class="num-tabular">${escapeHtml(m.part_no || '')}</strong>
                    <span class="num-tabular ${isPos ? 'delta-positive' : 'delta-negative'}" style="font-size: 0.82rem; padding: 2px 6px; border-radius: 4px; font-weight: 700;">
                      ${deltaStr} ${escapeHtml(m.unit || '')}
                    </span>
                  </div>
                  <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">
                    โดย ${escapeHtml(m.operator_name || '-')} · ${formatDateTime(m.created_at)}
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

/**
 * Fetch and render Parts Catalog
 */
async function loadParts() {
  partsContainer.innerHTML = `
    <div class="part-card skeleton" style="height: 140px;"></div>
    <div class="part-card skeleton" style="height: 140px;"></div>
    <div class="part-card skeleton" style="height: 140px;"></div>
  `;
  desktopTableBody.innerHTML = `
    <tr><td colspan="8" style="text-align:center; padding: 24px;"><span class="skeleton" style="display:inline-block; width: 60%; height: 20px;"></span></td></tr>
  `;

  try {
    const params = new URLSearchParams({
      page: state.currentPage,
      limit: state.limit,
      q: state.searchQuery,
      status: state.activeStatusFilter
    });

    const res = await fetch(`/api/parts?${params.toString()}`);
    if (!res.ok) throw new Error('API Error');
    const json = await res.json();

    if (!json.success || !json.data) throw new Error('Invalid response');

    state.parts = json.data.parts || [];
    const pagination = json.data.pagination || { total: state.parts.length, page: 1, limit: state.limit, totalPages: 1 };
    state.totalParts = pagination.total;
    state.totalPages = pagination.totalPages;

    renderDualViews();
    renderPagination(pagination);
  } catch (err) {
    const errHtml = `
      <div style="text-align: center; padding: 40px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <p style="color: var(--status-out); font-weight: 600; margin-bottom: 8px;">เกิดข้อผิดพลาดในการโหลดรายการ</p>
        <button class="chip" style="background: var(--brand-primary); color: #fff;" onclick="window.location.reload()">โหลดใหม่</button>
      </div>
    `;
    partsContainer.innerHTML = errHtml;
    desktopTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 30px; color: var(--status-out);">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
  }
}

/**
 * Render both Mobile Cards & Desktop Table
 */
function renderDualViews() {
  if (state.parts.length === 0) {
    const emptyHtml = `
      <div style="text-align: center; padding: 48px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 20px; background: #ffffff; border: 2px solid #fde68a; box-shadow: 0 0 20px rgba(245, 158, 11, 0.28); margin-bottom: 12px;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1l8-4.6z" stroke="#f59e0b" stroke-width="2.2" stroke-linejoin="round"/>
            <path d="M12 11.7l8-4.6M12 11.7v9.8M12 11.7l-8-4.6" stroke="#fbbf24" stroke-width="1.8"/>
          </svg>
        </div>
        <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 4px;">ไม่พบรายการวัสดุ</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          ${state.searchQuery || state.activeStatusFilter ? 'ลองล้างตัวกรองหรือคำค้นหา' : 'ยังไม่มีข้อมูลวัสดุในระบบ'}
        </p>
        <button class="chip" style="background: var(--brand-primary); color: #fff;" id="btn-empty-add">
          + เพิ่มวัสดุรายการแรก
        </button>
      </div>
    `;
    partsContainer.innerHTML = emptyHtml;
    desktopTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted);">ไม่พบรายการวัสดุ</td></tr>`;

    const emptyAddBtn = document.getElementById('btn-empty-add');
    if (emptyAddBtn) emptyAddBtn.onclick = () => openCreatePartModal();
    return;
  }

  // 1. Mobile Cards Render
  partsContainer.innerHTML = state.parts.map(part => {
    const config = part.status_config || {};
    const replenishText = part.recommended_replenish ? `เติม +${formatTabularNumber(part.recommended_replenish)}` : '';
    const imgUrl = part.image_key ? `/api/parts/${part.id}/image?v=${part.version || ''}` : null;

    return `
      <div class="part-card" data-part-id="${part.id}">
        <div class="part-card-header">
          <div style="display: flex; gap: 10px; align-items: center;">
            <div class="part-thumb" data-part-id="${part.id}" title="จัดการรูปภาพ">
              ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(part.part_no)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='📦';">` : '📦'}
            </div>
            <div>
              <div class="part-no-title" style="cursor: pointer;" data-action="edit" data-part-id="${part.id}">${escapeHtml(part.part_no)}</div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px;">
                ${part.brand_name ? `<span class="part-brand-tag">${escapeHtml(part.brand_name)}</span>` : ''}
                ${part.location ? `<span class="part-location-tag">📍 ${escapeHtml(part.location)}</span>` : ''}
              </div>
            </div>
          </div>
          <span class="badge ${config.badgeClass || 'badge-normal'}">
            ${config.label || part.status}
          </span>
        </div>

        <div class="part-desc">${escapeHtml(part.description)}</div>

        <div class="part-metrics-row">
          <div class="metric-item">
            <span class="metric-label">คงเหลือ</span>
            <span class="metric-val num-tabular" style="color: ${config.colorHex || 'inherit'}">
              ${formatTabularNumber(part.qty)} <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-secondary);">${escapeHtml(part.unit)}</span>
            </span>
          </div>
          <div class="metric-item" style="text-align: right;">
            <span class="metric-label">Min / Max</span>
            <span style="font-size: 0.85rem; font-weight: 600;" class="num-tabular">
              ${formatTabularNumber(part.min_qty)} / ${part.max_qty !== null ? formatTabularNumber(part.max_qty) : '-'}
            </span>
          </div>
          ${replenishText ? `
            <div class="metric-item" style="text-align: right;">
              <span class="metric-label">แนะนำ</span>
              <span style="font-size: 0.82rem; font-weight: 700; color: var(--status-low);" class="num-tabular">
                ${replenishText}
              </span>
            </div>
          ` : ''}
        </div>

        <div class="part-actions">
          <button class="btn-sm-action btn-sm-receive" data-action="receive" data-part-id="${part.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
            รับเข้า
          </button>
          <button class="btn-sm-action btn-sm-issue" data-action="issue" data-part-id="${part.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            เบิกออก
          </button>
          <button class="btn-icon" data-action="history" data-part-id="${part.id}" title="ดูประวัติการเคลื่อนไหว">
            ⏱️
          </button>
          <button class="btn-icon" data-action="edit" data-part-id="${part.id}" title="แก้ไขข้อมูล">
            ✏️
          </button>
        </div>
      </div>
    `;
  }).join('');

  // 2. Desktop Table Rows Render
  desktopTableBody.innerHTML = state.parts.map(part => {
    const config = part.status_config || {};
    const replenishText = part.recommended_replenish ? `<span style="font-size: 0.78rem; font-weight:700; color: var(--status-low);">+${formatTabularNumber(part.recommended_replenish)}</span>` : '';
    const imgUrl = part.image_key ? `/api/parts/${part.id}/image?v=${part.version || ''}` : null;

    return `
      <tr data-part-id="${part.id}">
        <td>
          <div class="part-thumb" data-part-id="${part.id}" title="แตะเพื่อเปลี่ยนรูปภาพ">
            ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(part.part_no)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='📦';">` : '📦'}
          </div>
        </td>
        <td>
          <strong class="num-tabular" style="cursor: pointer; color: var(--brand-primary);" data-action="edit" data-part-id="${part.id}">
            ${escapeHtml(part.part_no)}
          </strong>
          ${part.location ? `<div style="font-size: 0.75rem; color: var(--text-muted);">📍 ${escapeHtml(part.location)}</div>` : ''}
        </td>
        <td style="max-width: 260px;">${escapeHtml(part.description)}</td>
        <td>
          ${part.brand_name ? `<span class="part-brand-tag">${escapeHtml(part.brand_name)}</span>` : '-'}
        </td>
        <td style="text-align: center;">
          <span class="num-tabular" style="font-size: 1.1rem; font-weight: 700; color: ${config.colorHex || 'inherit'}">
            ${formatTabularNumber(part.qty)}
          </span>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(part.unit)}</span>
          ${replenishText ? `<div style="margin-top: 2px;">${replenishText}</div>` : ''}
        </td>
        <td style="text-align: right;" class="num-tabular">
          ${formatTabularNumber(part.min_qty)} / ${part.max_qty !== null ? formatTabularNumber(part.max_qty) : '-'}
        </td>
        <td style="text-align: center;">
          <span class="badge ${config.badgeClass || 'badge-normal'}">
            ${config.label || part.status}
          </span>
        </td>
        <td>
          <div class="action-cell">
            <button class="btn-sm-action btn-sm-receive" style="flex:none; padding: 0 10px;" data-action="receive" data-part-id="${part.id}">
              + รับเข้า
            </button>
            <button class="btn-sm-action btn-sm-issue" style="flex:none; padding: 0 10px;" data-action="issue" data-part-id="${part.id}">
              - เบิกออก
            </button>
            <button class="btn-icon" data-action="history" data-part-id="${part.id}" title="ดูประวัติการเคลื่อนไหว">
              ⏱️
            </button>
            <button class="btn-icon" data-action="edit" data-part-id="${part.id}" title="แก้ไข">
              ✏️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  attachActionListeners();
}

function attachActionListeners() {
  // Receive & Issue buttons
  document.querySelectorAll('[data-action="receive"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const partId = parseInt(btn.getAttribute('data-part-id'), 10);
      const part = state.parts.find(p => p.id === partId);
      if (part) openMovementModal(part, 1);
    };
  });

  document.querySelectorAll('[data-action="issue"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const partId = parseInt(btn.getAttribute('data-part-id'), 10);
      const part = state.parts.find(p => p.id === partId);
      if (part) openMovementModal(part, 2);
    };
  });

  // History trigger
  document.querySelectorAll('[data-action="history"]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const partId = parseInt(el.getAttribute('data-part-id'), 10);
      const part = state.parts.find(p => p.id === partId);
      if (part) openPartHistoryModal(part);
    };
  });

  // Edit triggers
  document.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const partId = parseInt(el.getAttribute('data-part-id'), 10);
      const part = state.parts.find(p => p.id === partId);
      if (part) openEditPartModal(part);
    };
  });

  // Thumbnail triggers
  document.querySelectorAll('.part-thumb').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const partId = parseInt(el.getAttribute('data-part-id'), 10);
      const part = state.parts.find(p => p.id === partId);
      if (part) openImageUploadModal(part);
    };
  });
}

/**
 * Render pagination metadata & controls
 */
function renderPagination(pagination) {
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.total, pagination.page * pagination.limit);

  paginationInfo.innerHTML = `
    แสดง <strong>${start} - ${end}</strong> จากทั้งหมด <strong>${pagination.total}</strong> รายการ
  `;

  valCurrentPage.textContent = pagination.page;
  btnPrevPage.disabled = pagination.page <= 1;
  btnNextPage.disabled = pagination.page >= pagination.totalPages;
}

btnPrevPage.onclick = () => {
  if (state.currentPage > 1) {
    state.currentPage -= 1;
    loadParts();
  }
};

btnNextPage.onclick = () => {
  if (state.currentPage < state.totalPages) {
    state.currentPage += 1;
    loadParts();
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/**
 * Movement Modal Handler (Receive or Issue)
 */
function openMovementModal(part, kind) {
  state.selectedPart = part;
  state.activeMovementKind = kind;

  document.getElementById('movement-part-id').value = part.id;
  document.getElementById('movement-kind').value = kind;
  document.getElementById('snippet-part-no').textContent = part.part_no;
  document.getElementById('snippet-desc').textContent = part.description;
  document.getElementById('snippet-current-qty').textContent = formatTabularNumber(part.qty);
  document.getElementById('snippet-unit').textContent = part.unit;

  movementQuantity.value = '1';

  const cachedOperator = localStorage.getItem(OPERATOR_STORAGE_KEY) || '';
  movementOperator.value = cachedOperator;

  if (kind === 1) {
    movementModalTitle.textContent = '📥 บันทึกรับเข้าพัสดุ';
    labelActionType.textContent = 'รับเข้า';
    btnSubmitMovement.style.background = 'var(--action-receive)';
    btnSubmitMovement.textContent = 'ยืนยันรับเข้า';
    boxNegativeWarning.style.display = 'none';
  } else {
    movementModalTitle.textContent = '📤 บันทึกเบิกออกพัสดุ';
    labelActionType.textContent = 'เบิกออก';
    btnSubmitMovement.style.background = 'var(--action-issue)';
    btnSubmitMovement.textContent = 'ยืนยันเบิกออก';
    checkNegativeWarning();
  }

  modalMovement.classList.add('open');
}

function closeMovementModal() {
  modalMovement.classList.remove('open');
}

function checkNegativeWarning() {
  if (state.activeMovementKind !== 2 || !state.selectedPart) {
    boxNegativeWarning.style.display = 'none';
    return;
  }
  const qtyToIssue = parseInt(movementQuantity.value || '0', 10);
  const current = Number(state.selectedPart.qty);
  if (current - qtyToIssue < 0) {
    boxNegativeWarning.style.display = 'block';
  } else {
    boxNegativeWarning.style.display = 'none';
  }
}

/**
 * Edit Part Modal Handler
 */
function openEditPartModal(part) {
  state.selectedPart = part;

  document.getElementById('edit-part-id').value = part.id;
  document.getElementById('edit-part-version').value = part.version || 1;
  document.getElementById('edit-part-no').value = part.part_no;
  document.getElementById('edit-desc').value = part.description;
  document.getElementById('edit-brand').value = part.brand_name || '';
  document.getElementById('edit-min').value = part.min_qty;
  document.getElementById('edit-max').value = part.max_qty !== null ? part.max_qty : '';
  document.getElementById('edit-unit').value = part.unit;
  document.getElementById('edit-location').value = part.location || '';

  modalEditPart.classList.add('open');
}

function closeEditPartModal() {
  modalEditPart.classList.remove('open');
}

// Edit Form Submit
formEditPart.onsubmit = async (e) => {
  e.preventDefault();
  if (!state.selectedPart) return;

  const partId = state.selectedPart.id;
  const version = parseInt(document.getElementById('edit-part-version').value, 10);
  const desc = document.getElementById('edit-desc').value.trim();
  const brand = document.getElementById('edit-brand').value.trim();
  const minQty = parseInt(document.getElementById('edit-min').value, 10);
  const maxVal = document.getElementById('edit-max').value.trim();
  const maxQty = maxVal ? parseInt(maxVal, 10) : null;
  const unit = document.getElementById('edit-unit').value.trim();
  const location = document.getElementById('edit-location').value.trim() || null;

  btnSubmitEditPart.disabled = true;
  btnSubmitEditPart.textContent = 'กำลังบันทึก...';

  try {
    const res = await fetch(`/api/parts/${partId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(version)
      },
      body: JSON.stringify({
        description: desc,
        brand_name: brand,
        min_qty: minQty,
        max_qty: maxQty,
        unit,
        location,
        version
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      if (res.status === 409) {
        showToast('ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชข้อมูลล่าสุด', 'warning');
        loadParts();
        closeEditPartModal();
        return;
      }
      throw new Error(json.error?.message || 'บันทึกการแก้ไขไม่สำเร็จ');
    }

    closeEditPartModal();
    showToast(`อัปเดตข้อมูล ${json.data.part_no} สำเร็จ`, 'success');
    loadDashboard();
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSubmitEditPart.disabled = false;
    btnSubmitEditPart.textContent = 'บันทึกการเปลี่ยนแปลง';
  }
};

// Switch from Edit modal to Image upload modal
btnOpenImageFromEdit.onclick = () => {
  if (state.selectedPart) {
    closeEditPartModal();
    openImageUploadModal(state.selectedPart);
  }
};

// Trigger delete from Edit modal
btnDeletePart.onclick = () => {
  if (state.selectedPart) {
    closeEditPartModal();
    openDeleteConfirmModal(state.selectedPart);
  }
};

/**
 * Image Upload & WebP Client-side Compression Modal
 */
function openImageUploadModal(part) {
  state.selectedPart = part;
  state.stagedImageBlob = null;

  imgPartNo.textContent = `${part.part_no} - ${part.description}`;
  imagePreviewContainer.style.display = 'none';
  dropzoneImage.style.display = 'block';
  inputFileImage.value = '';

  if (part.image_key) {
    boxRemoveExistingImage.style.display = 'block';
  } else {
    boxRemoveExistingImage.style.display = 'none';
  }

  modalUploadImage.classList.add('open');
}

function closeImageUploadModal() {
  modalUploadImage.classList.remove('open');
  state.stagedImageBlob = null;
}

dropzoneImage.onclick = () => inputFileImage.click();

async function processSelectedImageFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WebP)', 'error');
    return;
  }

  try {
    dropzoneImage.innerHTML = `<div>⏳ กำลังประมวลผลและย่อรูปภาพ...</div>`;
    const result = await compressImageToWebP(file);
    state.stagedImageBlob = result.blob;

    previewImgElement.src = result.dataUrl;
    if (result.reductionPercent > 0) {
      compressionStatsText.innerHTML = `
        <span>ต้นฉบับ: ${formatBytes(result.originalSize)}</span> ➔
        <span>WebP: ${formatBytes(result.compressedSize)}</span>
        <span class="compression-badge">ประหยัด -${result.reductionPercent}%</span>
      `;
    } else {
      compressionStatsText.innerHTML = `
        <span>ขนาดไฟล์: ${formatBytes(result.compressedSize)}</span>
        <span class="compression-badge" style="background: #e0f2fe; color: #0369a1;">ขนาดกะทัดรัดอยู่แล้ว (&lt; 350 KB)</span>
      `;
    }

    dropzoneImage.style.display = 'none';
    imagePreviewContainer.style.display = 'flex';
  } catch (err) {
    showToast(err.message || 'ไม่สามารถย่อรูปภาพได้', 'error');
  } finally {
    dropzoneImage.innerHTML = `
      <div style="font-size: 2.2rem; margin-bottom: 6px;">📷</div>
      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">ลากไฟล์รูปภาพมาวางที่นี่</div>
      <div style="font-size: 0.82rem; color: var(--brand-primary); font-weight: 500; margin-bottom: 2px;">หรือแตะเพื่อเลือกไฟล์ / ถ่ายรูปจากกล้อง</div>
      <div style="font-size: 0.76rem; color: var(--text-muted);">รองรับ JPG, PNG, WebP (สามารถกด Ctrl+V เพื่อวางรูปได้)</div>
    `;
  }
}

inputFileImage.onchange = () => {
  const file = inputFileImage.files?.[0];
  if (file) processSelectedImageFile(file);
};

// Drag and Drop Event Listeners
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  window.addEventListener(eventName, e => {
    if (modalUploadImage.classList.contains('open')) {
      e.preventDefault();
    }
  }, false);
});

dropzoneImage.addEventListener('dragenter', e => {
  e.preventDefault();
  dropzoneImage.classList.add('drag-active');
});

dropzoneImage.addEventListener('dragover', e => {
  e.preventDefault();
  dropzoneImage.classList.add('drag-active');
});

dropzoneImage.addEventListener('dragleave', e => {
  e.preventDefault();
  dropzoneImage.classList.remove('drag-active');
});

dropzoneImage.addEventListener('drop', e => {
  e.preventDefault();
  dropzoneImage.classList.remove('drag-active');
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    processSelectedImageFile(file);
  }
});

// Clipboard Paste (Ctrl+V) Support
window.addEventListener('paste', e => {
  if (!modalUploadImage.classList.contains('open')) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile();
      if (file) {
        processSelectedImageFile(file);
        break;
      }
    }
  }
});

btnCancelImageUpload.onclick = () => {
  state.stagedImageBlob = null;
  imagePreviewContainer.style.display = 'none';
  dropzoneImage.style.display = 'block';
  inputFileImage.value = '';
};

// Confirm Image Upload
btnConfirmImageUpload.onclick = async () => {
  if (!state.selectedPart || !state.stagedImageBlob) return;

  btnConfirmImageUpload.disabled = true;
  btnConfirmImageUpload.textContent = 'กำลังบันทึกรูปภาพ...';

  try {
    const res = await fetch(`/api/parts/${state.selectedPart.id}/image`, {
      method: 'PUT',
      headers: { 'Content-Type': state.stagedImageBlob.type || 'image/webp' },
      body: state.stagedImageBlob
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'อัปโหลดรูปภาพไม่สำเร็จ');
    }

    closeImageUploadModal();
    showToast(`บันทึกรูปภาพ ${state.selectedPart.part_no} สำเร็จ`, 'success');
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnConfirmImageUpload.disabled = false;
    btnConfirmImageUpload.textContent = 'ยืนยันบันทึกรูปภาพ';
  }
};

// Remove Image from R2
btnRemoveImage.onclick = async () => {
  if (!state.selectedPart) return;

  try {
    const res = await fetch(`/api/parts/${state.selectedPart.id}/image`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'ลบรูปภาพไม่สำเร็จ');

    closeImageUploadModal();
    showToast(`ลบรูปภาพออกจาก R2 สำเร็จ`, 'info');
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

/**
 * Soft Delete Confirmation Modal
 */
function openDeleteConfirmModal(part) {
  state.selectedPart = part;
  deleteConfirmPartNo.textContent = `${part.part_no} (${part.description})`;
  modalConfirmDelete.classList.add('open');
}

function closeDeleteConfirmModal() {
  modalConfirmDelete.classList.remove('open');
}

btnCancelDelete.onclick = closeDeleteConfirmModal;

btnExecuteDelete.onclick = async () => {
  if (!state.selectedPart) return;
  btnExecuteDelete.disabled = true;
  btnExecuteDelete.textContent = 'กำลังลบ...';

  try {
    const res = await fetch(`/api/parts/${state.selectedPart.id}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'ลบรายการไม่สำเร็จ');

    closeDeleteConfirmModal();
    showToast(`ลบพัสดุ ${state.selectedPart.part_no} เรียบร้อยแล้ว`, 'info');
    loadDashboard();
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnExecuteDelete.disabled = false;
    btnExecuteDelete.textContent = 'ยืนยันลบ';
  }
};

/**
 * Part Creation Modal Handler
 */
function openCreatePartModal() {
  formCreatePart.reset();
  modalCreatePart.classList.add('open');
}

function closeCreatePartModal() {
  modalCreatePart.classList.remove('open');
}

// Stepper Button Listeners
document.getElementById('step-minus-10').onclick = () => {
  const cur = parseInt(movementQuantity.value || '1', 10);
  movementQuantity.value = Math.max(1, cur - 10);
  checkNegativeWarning();
};

document.getElementById('step-minus-1').onclick = () => {
  const cur = parseInt(movementQuantity.value || '1', 10);
  movementQuantity.value = Math.max(1, cur - 1);
  checkNegativeWarning();
};

document.getElementById('step-plus-1').onclick = () => {
  const cur = parseInt(movementQuantity.value || '1', 10);
  movementQuantity.value = cur + 1;
  checkNegativeWarning();
};

document.getElementById('step-plus-10').onclick = () => {
  const cur = parseInt(movementQuantity.value || '1', 10);
  movementQuantity.value = cur + 10;
  checkNegativeWarning();
};

movementQuantity.oninput = () => checkNegativeWarning();

// Search & Filter Listeners
searchInput.oninput = () => {
  btnClearSearch.style.display = searchInput.value ? 'block' : 'none';
};

searchInput.onchange = () => {
  state.searchQuery = searchInput.value.trim();
  state.currentPage = 1;
  loadParts();
};

btnClearSearch.onclick = () => {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  state.searchQuery = '';
  state.currentPage = 1;
  loadParts();
};

filterChips.forEach(chip => {
  chip.onclick = () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeStatusFilter = chip.getAttribute('data-status') || '';
    state.currentPage = 1;
    loadParts();
  };
});

// Modal Close Listeners
document.getElementById('btn-close-movement-modal').onclick = closeMovementModal;
btnCloseCreateModal.onclick = closeCreatePartModal;
btnCloseEditModal.onclick = closeEditPartModal;
btnCloseImageModal.onclick = closeImageUploadModal;
btnOpenCreatePart.onclick = openCreatePartModal;

modalMovement.onclick = (e) => { if (e.target === modalMovement) closeMovementModal(); };
modalCreatePart.onclick = (e) => { if (e.target === modalCreatePart) closeCreatePartModal(); };
modalEditPart.onclick = (e) => { if (e.target === modalEditPart) closeEditPartModal(); };
modalUploadImage.onclick = (e) => { if (e.target === modalUploadImage) closeImageUploadModal(); };
modalConfirmDelete.onclick = (e) => { if (e.target === modalConfirmDelete) closeDeleteConfirmModal(); };

// Form Submission: Movement
formMovement.onsubmit = async (e) => {
  e.preventDefault();
  if (!state.selectedPart) return;

  const partId = state.selectedPart.id;
  const kind = state.activeMovementKind;
  const quantity = parseInt(movementQuantity.value, 10);
  const operatorName = movementOperator.value.trim();
  const reference = document.getElementById('movement-reference').value.trim();
  const note = document.getElementById('movement-note').value.trim();

  if (operatorName) {
    localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName);
  }

  btnSubmitMovement.disabled = true;
  btnSubmitMovement.innerHTML = `กำลังบันทึก...`;

  const actionPath = kind === 1 ? 'receive' : 'issue';
  const idempotencyKey = `req-${partId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const res = await fetch(`/api/parts/${partId}/${actionPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        quantity,
        operator_name: operatorName,
        reference,
        note
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'บันทึกรายการไม่สำเร็จ');
    }

    closeMovementModal();
    showToast(
      kind === 1
        ? `รับเข้า ${partId}: +${quantity} สำเร็จ (ยอดใหม่ ${json.data.new_qty})`
        : `เบิกออก ${partId}: -${quantity} สำเร็จ (ยอดใหม่ ${json.data.new_qty})`,
      json.data.new_qty < 0 ? 'warning' : 'success'
    );

    loadDashboard();
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSubmitMovement.disabled = false;
    btnSubmitMovement.textContent = kind === 1 ? 'ยืนยันรับเข้า' : 'ยืนยันเบิกออก';
  }
};

// Form Submission: Create Part
formCreatePart.onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-create-part');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  const partNo = document.getElementById('create-part-no').value.trim();
  const desc = document.getElementById('create-desc').value.trim();
  const brand = document.getElementById('create-brand').value.trim();
  const minQty = parseInt(document.getElementById('create-min').value, 10);
  const maxVal = document.getElementById('create-max').value.trim();
  const maxQty = maxVal ? parseInt(maxVal, 10) : null;
  const unit = document.getElementById('create-unit').value.trim() || 'ชิ้น';
  const location = document.getElementById('create-location').value.trim() || null;

  try {
    const res = await fetch('/api/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_no: partNo,
        description: desc,
        brand_name: brand,
        min_qty: minQty,
        max_qty: maxQty,
        unit,
        location
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'ไม่สามารถเพิ่มวัสดุได้');
    }

    closeCreatePartModal();
    showToast(`เพิ่มพัสดุ ${json.data.part_no} สำเร็จ`, 'success');
    loadDashboard();
    loadParts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึกพัสดุใหม่';
  }
};

// Quick Hero Button Actions (if present)
const btnQuickRecv = document.getElementById('btn-quick-receive');
if (btnQuickRecv) {
  btnQuickRecv.onclick = () => {
    if (state.parts.length > 0) openMovementModal(state.parts[0], 1);
    else openCreatePartModal();
  };
}

const btnQuickIss = document.getElementById('btn-quick-issue');
if (btnQuickIss) {
  btnQuickIss.onclick = () => {
    if (state.parts.length > 0) openMovementModal(state.parts[0], 2);
    else openCreatePartModal();
  };
}

// ==========================================================
// Phase 3: Bottom Navigation & View Switching
// ==========================================================
function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.id === `nav-${tabName}`);
  });

  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${tabName}`);
  });

  if (tabName === 'dashboard') {
    loadDashboard();
  } else if (tabName === 'parts') {
    loadParts();
  } else if (tabName === 'movements') {
    loadMovements();
  } else if (tabName === 'stockcount') {
    loadStockCountView();
  }
}

document.getElementById('nav-dashboard').onclick = () => switchTab('dashboard');
document.getElementById('nav-parts').onclick = () => switchTab('parts');
document.getElementById('nav-movements').onclick = () => switchTab('movements');
document.getElementById('nav-stockcount').onclick = () => switchTab('stockcount');

const btnViewAllUrgent = document.getElementById('btn-view-all-urgent');
if (btnViewAllUrgent) {
  btnViewAllUrgent.onclick = () => {
    switchTab('parts');
    // Set filter to LOW_STOCK
    const lowChip = document.querySelector('#filter-chips-container [data-status="LOW_STOCK"]');
    if (lowChip) lowChip.click();
  };
}

const btnViewAllMovements = document.getElementById('btn-view-all-movements');
if (btnViewAllMovements) {
  btnViewAllMovements.onclick = () => switchTab('movements');
}

const btnBackToDashboardFromCount = document.getElementById('btn-back-to-dashboard-from-count');
if (btnBackToDashboardFromCount) {
  btnBackToDashboardFromCount.onclick = () => switchTab('dashboard');
}

const btnOpenCreatePartView = document.getElementById('btn-open-create-part-view');
if (btnOpenCreatePartView) {
  btnOpenCreatePartView.onclick = () => openCreatePartModal();
}

// ==========================================================
// Phase 3: Global Movement Ledger (Load & Render)
// ==========================================================
const movementsContainer = document.getElementById('movements-container');
const desktopMovementsTableBody = document.getElementById('desktop-movements-table-body');
const movementsPaginationInfo = document.getElementById('movements-pagination-info');
const valMovementsCurrentPage = document.getElementById('val-movements-current-page');
const btnMovementsPrevPage = document.getElementById('btn-movements-prev-page');
const btnMovementsNextPage = document.getElementById('btn-movements-next-page');
const movementSearchInput = document.getElementById('movement-search-input');
const btnClearMovementSearch = document.getElementById('btn-clear-movement-search');
const btnExportMovementsCsv = document.getElementById('btn-export-movements-csv');

async function loadMovements() {
  movementsContainer.innerHTML = `
    <div class="movement-card skeleton" style="height: 110px;"></div>
    <div class="movement-card skeleton" style="height: 110px;"></div>
    <div class="movement-card skeleton" style="height: 110px;"></div>
  `;
  desktopMovementsTableBody.innerHTML = `
    <tr><td colspan="9" style="text-align:center; padding: 24px;"><span class="skeleton" style="display:inline-block; width: 60%; height: 20px;"></span></td></tr>
  `;

  try {
    const params = new URLSearchParams({
      page: state.currentMovementsPage,
      limit: 25,
      kind: state.activeMovementKindFilter,
      q: state.movementSearchQuery
    });

    const res = await fetch(`/api/movements?${params.toString()}`);
    if (!res.ok) throw new Error('API Error');
    const json = await res.json();
    if (!json.success || !json.data) throw new Error('Invalid response');

    state.movements = json.data.movements || [];
    const pagination = json.data.pagination || { total: state.movements.length, page: 1, limit: 25, totalPages: 1 };
    state.totalMovements = pagination.total;
    state.totalMovementsPages = pagination.totalPages;

    renderMovements();

    // Update pagination controls
    const startIdx = state.totalMovements === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
    const endIdx = Math.min(pagination.page * pagination.limit, state.totalMovements);
    movementsPaginationInfo.innerHTML = `แสดง <strong>${formatTabularNumber(startIdx)} - ${formatTabularNumber(endIdx)}</strong> จากทั้งหมด <strong>${formatTabularNumber(state.totalMovements)}</strong> รายการ`;
    valMovementsCurrentPage.textContent = pagination.page;
    btnMovementsPrevPage.disabled = !pagination.hasPrev;
    btnMovementsNextPage.disabled = !pagination.hasNext;

  } catch (err) {
    console.error('Failed to load movements:', err);
    movementsContainer.innerHTML = `<div style="color: var(--status-out); text-align: center; padding: 20px;">ไม่สามารถโหลดข้อมูลความเคลื่อนไหวได้</div>`;
    desktopMovementsTableBody.innerHTML = `<tr><td colspan="9" style="color: var(--status-out); text-align: center; padding: 20px;">ไม่สามารถโหลดข้อมูลความเคลื่อนไหวได้</td></tr>`;
  }
}

function renderMovements() {
  if (state.movements.length === 0) {
    const emptyHtml = `
      <div style="text-align: center; padding: 40px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 20px; background: #ffffff; border: 2px solid #f5d0fe; box-shadow: 0 0 20px rgba(217, 70, 239, 0.28); margin-bottom: 12px;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M20 12A8 8 0 0 1 7.2 18.2L3.5 15M4 12A8 8 0 0 1 16.8 5.8L20.5 9" stroke="#d946ef" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="21 4.5 20.5 9 16 9" stroke="#d946ef" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="3 19.5 3.5 15 8 15" stroke="#d946ef" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">ไม่พบรายการเคลื่อนไหวสต๊อก</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          ${state.movementSearchQuery || state.activeMovementKindFilter ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองประเภท' : 'ยังไม่มีประวัติการรับเข้าหรือเบิกจ่ายในระบบ'}
        </div>
      </div>
    `;
    movementsContainer.innerHTML = emptyHtml;
    desktopMovementsTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 40px; color: var(--text-muted);">ไม่พบรายการเคลื่อนไหวสต๊อก</td></tr>`;
    return;
  }

  // 1. Mobile Cards Render
  movementsContainer.innerHTML = state.movements.map(m => {
    const kindConfig = m.kind_config || MOVEMENT_KIND_CONFIG[m.kind] || { label: 'ไม่ระบุ', badgeClass: 'badge-normal' };
    const isPos = m.delta > 0;
    const deltaStr = isPos ? `+${formatTabularNumber(m.delta)}` : formatTabularNumber(m.delta);
    const deltaClass = m.kind === 4 ? 'delta-neutral' : (isPos ? 'delta-positive' : 'delta-negative');
    const isReversalRow = m.kind === 4;

    return `
      <div class="movement-card ${isReversalRow ? 'is-reversal' : ''}">
        <div class="movement-card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge ${kindConfig.badgeClass || 'badge-normal'}">
                ${kindConfig.label}
              </span>
              <strong class="num-tabular" style="font-size: 1rem;">${escapeHtml(m.part_no || '')}</strong>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(m.description || '')}</div>
          </div>
          <div class="movement-delta-badge ${deltaClass}">
            ${deltaStr} <span style="font-size: 0.75rem; font-weight: normal; margin-left: 3px;">${escapeHtml(m.unit || '')}</span>
          </div>
        </div>

        <div class="movement-meta-grid">
          <div class="movement-meta-item">
            <span class="movement-meta-label">ผู้ทำรายการ</span>
            <span style="font-weight: 500;">${escapeHtml(m.operator_name || '-')}</span>
          </div>
          <div class="movement-meta-item">
            <span class="movement-meta-label">เลขอ้างอิง</span>
            <span style="font-weight: 500; font-family: var(--font-mono);">${escapeHtml(m.reference || '-')}</span>
          </div>
          ${m.note ? `
            <div class="movement-meta-item" style="grid-column: span 2;">
              <span class="movement-meta-label">หมายเหตุ</span>
              <span>${escapeHtml(m.note)}</span>
            </div>
          ` : ''}
        </div>

        <div class="movement-card-footer">
          <div>🕒 ${formatDateTime(m.created_at)}</div>
          <div>
            ${m.is_reversible ? `
              <button class="btn-reverse-action" data-action="open-reverse" data-movement-id="${m.id}">
                ↺ ยกเลิกรายการ
              </button>
            ` : (isReversalRow ? `<span style="color: #b45309; font-weight: 600;">↺ รายการชดเชย</span>` : '')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 2. Desktop Table Render
  desktopMovementsTableBody.innerHTML = state.movements.map(m => {
    const kindConfig = m.kind_config || MOVEMENT_KIND_CONFIG[m.kind] || { label: 'ไม่ระบุ', badgeClass: 'badge-normal' };
    const isPos = m.delta > 0;
    const deltaStr = isPos ? `+${formatTabularNumber(m.delta)}` : formatTabularNumber(m.delta);
    const deltaClass = m.kind === 4 ? 'delta-neutral' : (isPos ? 'delta-positive' : 'delta-negative');
    const isReversalRow = m.kind === 4;

    return `
      <tr class="${isReversalRow ? 'is-reversal-row' : ''}">
        <td style="white-space: nowrap; font-size: 0.85rem;">
          ${formatDateTime(m.created_at)}
        </td>
        <td style="text-align: center;">
          <span class="badge ${kindConfig.badgeClass || 'badge-normal'}">
            ${kindConfig.label}
          </span>
        </td>
        <td>
          <strong class="num-tabular" style="color: var(--brand-primary);">${escapeHtml(m.part_no || '')}</strong>
        </td>
        <td style="max-width: 220px;">
          ${escapeHtml(m.description || '')}
        </td>
        <td style="text-align: center;">
          <span class="num-tabular ${deltaClass}" style="padding: 2px 8px; border-radius: 4px; font-weight: 700;">
            ${deltaStr} ${escapeHtml(m.unit || '')}
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.85rem;">
          ${escapeHtml(m.reference || '-')}
        </td>
        <td style="font-size: 0.85rem;">
          ${escapeHtml(m.operator_name || '-')}
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 180px;">
          ${escapeHtml(m.note || '-')}
        </td>
        <td style="text-align: right;">
          ${m.is_reversible ? `
            <button class="btn-reverse-action" data-action="open-reverse" data-movement-id="${m.id}">
              ↺ ยกเลิก
            </button>
          ` : (isReversalRow ? `<span style="font-size: 0.78rem; color: #b45309; font-weight: 600;">ชดเชย</span>` : '-')}
        </td>
      </tr>
    `;
  }).join('');

  // Attach Reversal Click Listeners
  document.querySelectorAll('[data-action="open-reverse"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const movementId = parseInt(btn.getAttribute('data-movement-id'), 10);
      const movement = state.movements.find(x => x.id === movementId);
      if (movement) openReverseModal(movement);
    };
  });
}

// Search & Filter Events for Movements Ledger
let movementSearchDebounceTimer;
movementSearchInput.oninput = () => {
  clearTimeout(movementSearchDebounceTimer);
  movementSearchDebounceTimer = setTimeout(() => {
    state.movementSearchQuery = movementSearchInput.value.trim();
    state.currentMovementsPage = 1;
    btnClearMovementSearch.style.display = state.movementSearchQuery ? 'block' : 'none';
    loadMovements();
  }, 300);
};

btnClearMovementSearch.onclick = () => {
  movementSearchInput.value = '';
  state.movementSearchQuery = '';
  btnClearMovementSearch.style.display = 'none';
  state.currentMovementsPage = 1;
  loadMovements();
};

document.querySelectorAll('#movement-filter-chips .chip').forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll('#movement-filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeMovementKindFilter = chip.getAttribute('data-kind') || '';
    state.currentMovementsPage = 1;
    loadMovements();
  };
});

btnMovementsPrevPage.onclick = () => {
  if (state.currentMovementsPage > 1) {
    state.currentMovementsPage -= 1;
    loadMovements();
  }
};

btnMovementsNextPage.onclick = () => {
  if (state.currentMovementsPage < state.totalMovementsPages) {
    state.currentMovementsPage += 1;
    loadMovements();
  }
};

// CSV Export Trigger
btnExportMovementsCsv.onclick = async () => {
  try {
    showToast('กำลังส่งออกไฟล์รายงาน Excel CSV...', 'info');
    const params = new URLSearchParams({
      kind: state.activeMovementKindFilter,
      q: state.movementSearchQuery
    });
    const res = await fetch(`/api/movements/export?${params.toString()}`);
    if (!res.ok) throw new Error('ไม่สามารถส่งออกรายงานได้');

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    showToast('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว (รองรับ Excel ภาษาไทย)', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================================
// Phase 3: Non-Destructive Compensating Reversals Modal Flow
// ==========================================================
const modalReverseMovement = document.getElementById('modal-reverse-movement');
const btnCloseReverseModal = document.getElementById('btn-close-reverse-modal');
const btnCancelReverse = document.getElementById('btn-cancel-reverse');
const formReverseMovement = document.getElementById('form-reverse-movement');
const reverseMovementId = document.getElementById('reverse-movement-id');
const reverseOperator = document.getElementById('reverse-operator');
const reverseReason = document.getElementById('reverse-reason');
const revSummaryKind = document.getElementById('rev-summary-kind');
const revSummaryPartNo = document.getElementById('rev-summary-part-no');
const revSummaryDesc = document.getElementById('rev-summary-desc');
const revSummaryDelta = document.getElementById('rev-summary-delta');
const revSummaryCompensation = document.getElementById('rev-summary-compensation');
const revSummaryUnit = document.getElementById('rev-summary-unit');

function openReverseModal(movement) {
  state.selectedMovementForReversal = movement;
  reverseMovementId.value = movement.id;

  const kindConfig = movement.kind_config || MOVEMENT_KIND_CONFIG[movement.kind] || { label: 'รายการ' };
  revSummaryKind.textContent = kindConfig.label;
  revSummaryKind.className = `chip ${kindConfig.badgeClass || ''}`;

  revSummaryPartNo.textContent = movement.part_no || '-';
  revSummaryDesc.textContent = movement.description || '-';
  revSummaryUnit.textContent = movement.unit || 'ชิ้น';

  const origDeltaStr = movement.delta > 0 ? `+${movement.delta}` : `${movement.delta}`;
  const compDeltaStr = movement.delta > 0 ? `-${movement.delta}` : `+${Math.abs(movement.delta)}`;

  revSummaryDelta.textContent = origDeltaStr;
  revSummaryCompensation.textContent = compDeltaStr;
  revSummaryCompensation.style.color = movement.delta > 0 ? 'var(--status-out)' : 'var(--action-receive)';

  reverseOperator.value = localStorage.getItem(OPERATOR_STORAGE_KEY) || '';
  reverseReason.value = '';

  modalReverseMovement.classList.add('open');
  reverseReason.focus();
}

function closeReverseModal() {
  modalReverseMovement.classList.remove('open');
  state.selectedMovementForReversal = null;
}

btnCloseReverseModal.onclick = closeReverseModal;
btnCancelReverse.onclick = closeReverseModal;

formReverseMovement.onsubmit = async (e) => {
  e.preventDefault();
  const movement = state.selectedMovementForReversal;
  if (!movement) return;

  const operatorName = reverseOperator.value.trim();
  const reason = reverseReason.value.trim();

  if (!operatorName || operatorName.length < 2) {
    showToast('กรุณาระบุชื่อผู้ขอยกเลิกรายการอย่างน้อย 2 ตัวอักษร', 'warning');
    return;
  }
  if (!reason || reason.length < 3) {
    showToast('กรุณาระบุเหตุผลในการยกเลิกรายการอย่างน้อย 3 ตัวอักษร', 'warning');
    return;
  }

  localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName);

  const btnSubmit = document.getElementById('btn-submit-reverse');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'กำลังประมวลผล...';

  try {
    const res = await fetch(`/api/movements/${movement.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operator_name: operatorName,
        reason
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'ไม่สามารถยกเลิกรายการได้');
    }

    closeReverseModal();
    showToast(`ยกเลิกรายการ #${movement.id} สำเร็จ (สร้างรายการชดเชย #${json.data.reversal_id} ยอดคงเหลือใหม่ ${json.data.new_qty})`, 'success');

    loadDashboard();
    loadParts();
    loadMovements();

    // If Part History modal is open, refresh it
    if (modalPartHistory.classList.contains('open') && state.selectedPart) {
      openPartHistoryModal(state.selectedPart);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = '↺ ยืนยันการยกเลิกรายการ';
  }
};

// ==========================================================
// Phase 3: Part History Modal Flow
// ==========================================================
const modalPartHistory = document.getElementById('modal-part-history');
const btnCloseHistoryModal = document.getElementById('btn-close-history-modal');
const historyPartTitle = document.getElementById('history-part-title');
const historyPartCurrentQty = document.getElementById('history-part-current-qty');
const historyTimelineContainer = document.getElementById('history-timeline-container');

async function openPartHistoryModal(part) {
  state.selectedPart = part;
  historyPartTitle.textContent = `${part.part_no} — ${part.description}`;
  historyPartCurrentQty.textContent = `${formatTabularNumber(part.qty)} ${part.unit || 'ชิ้น'}`;
  historyTimelineContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">กำลังโหลดประวัติ...</div>`;
  modalPartHistory.classList.add('open');

  try {
    const res = await fetch(`/api/parts/${part.id}/movements?limit=50`);
    if (!res.ok) throw new Error('API Error');
    const json = await res.json();
    const movements = json.data || [];

    if (movements.length === 0) {
      historyTimelineContainer.innerHTML = `
        <div style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 0.88rem;">
          ยังไม่มีประวัติการเคลื่อนไหวของพัสดุนี้
        </div>
      `;
      return;
    }

    historyTimelineContainer.innerHTML = movements.map(m => {
      const isPos = m.delta > 0;
      const deltaStr = isPos ? `+${formatTabularNumber(m.delta)}` : formatTabularNumber(m.delta);
      const deltaClass = m.kind === 4 ? 'delta-neutral' : (isPos ? 'delta-positive' : 'delta-negative');
      const kindConfig = MOVEMENT_KIND_CONFIG[m.kind] || { label: 'รายการ', badgeClass: 'badge-normal' };
      const isReversible = m.kind !== 4 && !(m.reference && m.reference.startsWith('REV-#'));

      return `
        <div class="recent-mini-item" style="flex-direction: column; align-items: stretch; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge ${kindConfig.badgeClass || ''}">${kindConfig.label}</span>
              <span class="num-tabular ${deltaClass}" style="padding: 2px 6px; border-radius: 4px; font-weight: 700;">
                ${deltaStr} ${escapeHtml(part.unit || '')}
              </span>
            </div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">${formatDateTime(m.created_at)}</div>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
            <div>
              โดย <strong>${escapeHtml(m.operator_name || '-')}</strong>
              ${m.reference ? `· อ้างอิง: <span class="num-tabular">${escapeHtml(m.reference)}</span>` : ''}
              ${m.note ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(m.note)}</div>` : ''}
            </div>
            ${isReversible ? `
              <button class="btn-reverse-action" style="flex:none; padding: 4px 8px; font-size: 0.74rem;" data-action="reverse-from-history" data-movement-id="${m.id}">
                ↺ ยกเลิก
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    historyTimelineContainer.querySelectorAll('[data-action="reverse-from-history"]').forEach(btn => {
      btn.onclick = () => {
        const mId = parseInt(btn.getAttribute('data-movement-id'), 10);
        const targetMov = movements.find(x => x.id === mId);
        if (targetMov) {
          openReverseModal({
            ...targetMov,
            part_no: part.part_no,
            description: part.description,
            unit: part.unit
          });
        }
      };
    });

  } catch (err) {
    historyTimelineContainer.innerHTML = `<div style="color: var(--status-out); text-align: center; padding: 20px;">ไม่สามารถโหลดประวัติได้</div>`;
  }
}

function closePartHistoryModal() {
  modalPartHistory.classList.remove('open');
}

btnCloseHistoryModal.onclick = closePartHistoryModal;

// ==========================================================
// Phase 4: Stock Count Audit Session Controller
// ==========================================================

const btnCountSubtabActive = document.getElementById('btn-count-subtab-active');
const btnCountSubtabHistory = document.getElementById('btn-count-subtab-history');
const countSubviewActive = document.getElementById('count-subview-active');
const countSubviewHistory = document.getElementById('count-subview-history');

const countSessionTitle = document.getElementById('count-session-title');
const countOperatorName = document.getElementById('count-operator-name');
const btnResetCountDraft = document.getElementById('btn-reset-count-draft');

const countProgressText = document.getElementById('count-progress-text');
const countProgressBar = document.getElementById('count-progress-bar');
const statCountDone = document.getElementById('stat-count-done');
const statCountMatch = document.getElementById('stat-count-match');
const statCountDiff = document.getElementById('stat-count-diff');
const statCountPending = document.getElementById('stat-count-pending');

const countSearchInput = document.getElementById('count-search-input');
const btnClearCountSearch = document.getElementById('btn-clear-count-search');
const countCardsContainer = document.getElementById('count-cards-container');
const desktopCountTableBody = document.getElementById('desktop-count-table-body');

const barCountedQty = document.getElementById('bar-counted-qty');
const barMatchQty = document.getElementById('bar-match-qty');
const barDiffQty = document.getElementById('bar-diff-qty');
const btnOpenConfirmCount = document.getElementById('btn-open-confirm-count');
const countHistoryContainer = document.getElementById('count-history-container');

// Confirm Modal
const modalConfirmCount = document.getElementById('modal-confirm-count');
const btnCloseConfirmCountModal = document.getElementById('btn-close-confirm-count-modal');
const btnCancelConfirmCount = document.getElementById('btn-cancel-confirm-count');
const btnExecuteSubmitCount = document.getElementById('btn-execute-submit-count');
const revTotalCounted = document.getElementById('rev-total-counted');
const revMatchCount = document.getElementById('rev-match-count');
const revDiffCount = document.getElementById('rev-diff-count');
const revNetDelta = document.getElementById('rev-net-delta');
const revDiffListCount = document.getElementById('rev-diff-list-count');
const revDiscrepancyList = document.getElementById('rev-discrepancy-list');
const confirmCountNote = document.getElementById('confirm-count-note');

// Detail Modal
const modalCountDetail = document.getElementById('modal-count-detail');
const btnCloseDetailModal = document.getElementById('btn-close-detail-modal');
const detailSessionTitle = document.getElementById('detail-session-title');
const detailSessionSub = document.getElementById('detail-session-sub');
const detailOperator = document.getElementById('detail-operator');
const detailCreatedAt = document.getElementById('detail-created-at');
const detailTotalLines = document.getElementById('detail-total-lines');
const detailDiffLines = document.getElementById('detail-diff-lines');
const detailLinesContainer = document.getElementById('detail-lines-container');

const DISCREPANCY_REASONS = [
  'นับตกหล่น / บันทึกผิดพลาด',
  'สินค้าชำรุดเสียหาย',
  'จ่ายของโดยไม่ได้บันทึกเบิก',
  'สินค้าเกินจากการส่งมอบ',
  'อื่นๆ (ระบุในหมายเหตุ)'
];

// Subtab toggling
if (btnCountSubtabActive && btnCountSubtabHistory) {
  btnCountSubtabActive.onclick = () => {
    btnCountSubtabActive.classList.add('active');
    btnCountSubtabHistory.classList.remove('active');
    countSubviewActive.style.display = 'block';
    countSubviewHistory.style.display = 'none';
    state.countActiveSubtab = 'active';
    loadStockCountView();
  };

  btnCountSubtabHistory.onclick = () => {
    btnCountSubtabHistory.classList.add('active');
    btnCountSubtabActive.classList.remove('active');
    countSubviewActive.style.display = 'none';
    countSubviewHistory.style.display = 'block';
    state.countActiveSubtab = 'history';
    loadCountHistory();
  };
}

// Search and Filter Chips for Count
if (countSearchInput) {
  countSearchInput.oninput = () => {
    state.countSearchQuery = countSearchInput.value.trim().toLowerCase();
    btnClearCountSearch.style.display = state.countSearchQuery ? 'block' : 'none';
    renderCountView();
  };

  btnClearCountSearch.onclick = () => {
    countSearchInput.value = '';
    state.countSearchQuery = '';
    btnClearCountSearch.style.display = 'none';
    renderCountView();
  };
}

document.querySelectorAll('#count-filter-chips .chip').forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll('#count-filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.countFilter = chip.getAttribute('data-count-filter') || '';
    renderCountView();
  };
});

if (btnResetCountDraft) {
  btnResetCountDraft.onclick = () => {
    const countCounted = Object.keys(state.countDraft).length;
    if (countCounted === 0) {
      showToast('ยังไม่มีข้อมูลการตรวจนับในแบบร่าง', 'info');
      return;
    }
    if (confirm(`คุณต้องการล้างแบบร่างการตรวจนับทั้งหมด ${countCounted} รายการใช่หรือไม่?`)) {
      state.countDraft = {};
      renderCountView();
      showToast('ล้างแบบร่างการตรวจนับเรียบร้อยแล้ว', 'info');
    }
  };
}

/**
 * Load Stock Count Active View
 */
async function loadStockCountView() {
  if (countOperatorName && !countOperatorName.value) {
    countOperatorName.value = localStorage.getItem(OPERATOR_STORAGE_KEY) || '';
  }

  if (state.countParts.length === 0) {
    try {
      countCardsContainer.innerHTML = `
        <div class="part-card skeleton" style="height: 120px;"></div>
        <div class="part-card skeleton" style="height: 120px;"></div>
      `;
      desktopCountTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px;"><span class="skeleton" style="display:inline-block; width: 60%; height: 20px;"></span></td></tr>`;

      const res = await fetch('/api/parts?limit=200');
      if (!res.ok) throw new Error('API Error');
      const json = await res.json();
      state.countParts = json.data?.parts || [];
    } catch (err) {
      showToast('ไม่สามารถโหลดรายการพัสดุสำหรับตรวจนับได้', 'error');
    }
  }

  renderCountView();
}

/**
 * Update a specific part count in draft
 */
function setCountValue(partId, val) {
  const part = state.countParts.find(p => p.id === partId);
  if (!part) return;

  if (val === '' || val === null || val === undefined) {
    delete state.countDraft[partId];
  } else {
    const num = Math.max(0, parseInt(val, 10));
    if (isNaN(num)) {
      delete state.countDraft[partId];
    } else {
      const variance = calculateCountVariance(part.qty, num);
      const existingReason = state.countDraft[partId]?.reason;
      state.countDraft[partId] = {
        countedQty: num,
        difference: variance.difference,
        status: variance.status,
        statusConfig: variance.statusConfig,
        reason: variance.difference !== 0 ? (existingReason || DISCREPANCY_REASONS[0]) : null
      };
    }
  }
  renderCountView();
}

/**
 * Render Count Active View (Cards + Desktop Table + Progress KPI)
 */
function renderCountView() {
  const total = state.countParts.length;
  const countedPartIds = Object.keys(state.countDraft);
  const counted = countedPartIds.length;
  const pending = Math.max(0, total - counted);

  let matchCount = 0;
  let diffCount = 0;

  countedPartIds.forEach(id => {
    const item = state.countDraft[id];
    if (item.difference === 0) {
      matchCount++;
    } else {
      diffCount++;
    }
  });

  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;

  // Update KPI Bar
  if (countProgressText) countProgressText.textContent = `${counted}/${total} รายการ (${pct}%)`;
  if (countProgressBar) countProgressBar.style.width = `${pct}%`;
  if (statCountDone) statCountDone.textContent = formatTabularNumber(counted);
  if (statCountMatch) statCountMatch.textContent = formatTabularNumber(matchCount);
  if (statCountDiff) statCountDiff.textContent = formatTabularNumber(diffCount);
  if (statCountPending) statCountPending.textContent = formatTabularNumber(pending);

  if (barCountedQty) barCountedQty.textContent = formatTabularNumber(counted);
  if (barMatchQty) barMatchQty.textContent = formatTabularNumber(matchCount);
  if (barDiffQty) barDiffQty.textContent = formatTabularNumber(diffCount);
  if (btnOpenConfirmCount) btnOpenConfirmCount.disabled = counted === 0;

  // Filter parts
  const query = state.countSearchQuery;
  const filter = state.countFilter;

  const filteredParts = state.countParts.filter(part => {
    if (query) {
      const targetStr = `${part.part_no} ${part.description} ${part.location || ''}`.toLowerCase();
      if (!targetStr.includes(query)) return false;
    }

    if (filter === 'PENDING') {
      return state.countDraft[part.id] === undefined;
    } else if (filter === 'MATCH') {
      return state.countDraft[part.id] && state.countDraft[part.id].difference === 0;
    } else if (filter === 'DISCREPANCY') {
      return state.countDraft[part.id] && state.countDraft[part.id].difference !== 0;
    }

    return true;
  });

  if (filteredParts.length === 0) {
    const emptyMsg = `
      <div style="text-align: center; padding: 40px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <p style="color: var(--text-muted); font-size: 0.9rem;">ไม่พบรายการวัสดุที่ตรงกับเงื่อนไขการค้นหา</p>
      </div>
    `;
    countCardsContainer.innerHTML = emptyMsg;
    desktopCountTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--text-muted);">ไม่พบรายการวัสดุ</td></tr>`;
    return;
  }

  // 1. Mobile Cards Render
  countCardsContainer.innerHTML = filteredParts.map(part => {
    const draft = state.countDraft[part.id];
    const isCounted = draft !== undefined;
    let cardClass = 'count-card is-pending';
    let badgeHtml = '<span class="count-variance-badge badge-variance-pending">ยังไม่นับ</span>';
    let valInput = '';

    if (isCounted) {
      valInput = draft.countedQty;
      if (draft.difference === 0) {
        cardClass = 'count-card is-match';
        badgeHtml = '<span class="count-variance-badge badge-variance-match">✅ ตรงกัน (0)</span>';
      } else if (draft.difference > 0) {
        cardClass = 'count-card is-surplus';
        badgeHtml = `<span class="count-variance-badge badge-variance-surplus">🟢 เกิน (+${draft.difference})</span>`;
      } else {
        cardClass = 'count-card is-deficit';
        badgeHtml = `<span class="count-variance-badge badge-variance-deficit">🔴 ขาด (${draft.difference})</span>`;
      }
    }

    const hasDiff = isCounted && draft.difference !== 0;

    return `
      <div class="${cardClass}" data-part-id="${part.id}">
        <div class="count-card-header">
          <div class="count-card-title num-tabular">${escapeHtml(part.part_no)}</div>
          ${badgeHtml}
        </div>
        <div class="count-card-desc">${escapeHtml(part.description)}</div>
        <div class="count-card-meta">
          <span>ระบบ: <strong class="num-tabular" style="color: var(--text-primary);">${formatTabularNumber(part.qty)}</strong> ${escapeHtml(part.unit)}</span>
          ${part.location ? `<span>· 📍 ${escapeHtml(part.location)}</span>` : ''}
          ${part.brand_name ? `<span>· 🏷️ ${escapeHtml(part.brand_name)}</span>` : ''}
        </div>

        <div class="count-control-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="count-stepper-wrapper">
              <button type="button" class="btn-stepper" data-action="count-minus" data-part-id="${part.id}">-</button>
              <input type="number" class="count-input-qty" data-action="count-input" data-part-id="${part.id}" placeholder="-" value="${valInput}" min="0">
              <button type="button" class="btn-stepper" data-action="count-plus" data-part-id="${part.id}">+</button>
            </div>
            <span style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(part.unit)}</span>
          </div>

          <button type="button" class="btn-match-system" data-action="match-system" data-part-id="${part.id}">
            ⚡ ตรงกับระบบ
          </button>
        </div>

        ${hasDiff ? `
          <div class="count-reason-box">
            <label style="font-size: 0.76rem; font-weight: 600; color: var(--status-out);">
              ⚠️ ระบุเหตุผลยอดต่าง:
            </label>
            <select class="count-reason-select" data-action="count-reason" data-part-id="${part.id}">
              ${DISCREPANCY_REASONS.map(r => `<option value="${r}" ${draft.reason === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // 2. Desktop Table Render
  desktopCountTableBody.innerHTML = filteredParts.map(part => {
    const draft = state.countDraft[part.id];
    const isCounted = draft !== undefined;
    let badgeHtml = '<span class="count-variance-badge badge-variance-pending">ยังไม่นับ</span>';
    let valInput = '';

    if (isCounted) {
      valInput = draft.countedQty;
      if (draft.difference === 0) {
        badgeHtml = '<span class="count-variance-badge badge-variance-match">✅ ตรงกัน (0)</span>';
      } else if (draft.difference > 0) {
        badgeHtml = `<span class="count-variance-badge badge-variance-surplus">🟢 เกิน (+${draft.difference})</span>`;
      } else {
        badgeHtml = `<span class="count-variance-badge badge-variance-deficit">🔴 ขาด (${draft.difference})</span>`;
      }
    }

    const hasDiff = isCounted && draft.difference !== 0;

    return `
      <tr data-part-id="${part.id}">
        <td>
          <strong class="num-tabular" style="color: var(--brand-primary);">${escapeHtml(part.part_no)}</strong>
          ${part.brand_name ? `<div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(part.brand_name)}</div>` : ''}
        </td>
        <td>
          <div>${escapeHtml(part.description)}</div>
        </td>
        <td style="text-align: center; font-size: 0.82rem; color: var(--text-secondary);">
          ${part.location ? `📍 ${escapeHtml(part.location)}` : '-'}
        </td>
        <td style="text-align: center;">
          <strong class="num-tabular" style="font-size: 1.05rem;">${formatTabularNumber(part.qty)}</strong>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(part.unit)}</span>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <div class="count-stepper-wrapper">
              <button type="button" class="btn-stepper" data-action="count-minus" data-part-id="${part.id}">-</button>
              <input type="number" class="count-input-qty" data-action="count-input" data-part-id="${part.id}" placeholder="-" value="${valInput}" min="0">
              <button type="button" class="btn-stepper" data-action="count-plus" data-part-id="${part.id}">+</button>
            </div>
            <button type="button" class="btn-match-system" data-action="match-system" data-part-id="${part.id}" title="ตั้งค่าให้นับได้เท่ายอดระบบ">
              ⚡ ตรงระบบ
            </button>
          </div>
        </td>
        <td style="text-align: center;">
          ${badgeHtml}
        </td>
        <td>
          ${hasDiff ? `
            <select class="count-reason-select" data-action="count-reason" data-part-id="${part.id}">
              ${DISCREPANCY_REASONS.map(r => `<option value="${r}" ${draft.reason === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">-</span>`}
        </td>
      </tr>
    `;
  }).join('');

  attachCountListeners();
}

/**
 * Attach Event Listeners to Count Controls
 */
function attachCountListeners() {
  // Stepper Minus
  document.querySelectorAll('[data-action="count-minus"]').forEach(btn => {
    btn.onclick = () => {
      const partId = parseInt(btn.getAttribute('data-part-id'), 10);
      const part = state.countParts.find(p => p.id === partId);
      const current = state.countDraft[partId]?.countedQty;
      if (current === undefined) {
        setCountValue(partId, Math.max(0, (part ? part.qty : 0) - 1));
      } else {
        setCountValue(partId, Math.max(0, current - 1));
      }
    };
  });

  // Stepper Plus
  document.querySelectorAll('[data-action="count-plus"]').forEach(btn => {
    btn.onclick = () => {
      const partId = parseInt(btn.getAttribute('data-part-id'), 10);
      const part = state.countParts.find(p => p.id === partId);
      const current = state.countDraft[partId]?.countedQty;
      if (current === undefined) {
        setCountValue(partId, (part ? part.qty : 0) + 1);
      } else {
        setCountValue(partId, current + 1);
      }
    };
  });

  // Direct Input
  document.querySelectorAll('[data-action="count-input"]').forEach(input => {
    input.onchange = () => {
      const partId = parseInt(input.getAttribute('data-part-id'), 10);
      setCountValue(partId, input.value);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
    };
  });

  // Match System Shortcut
  document.querySelectorAll('[data-action="match-system"]').forEach(btn => {
    btn.onclick = () => {
      const partId = parseInt(btn.getAttribute('data-part-id'), 10);
      const part = state.countParts.find(p => p.id === partId);
      if (part) setCountValue(partId, part.qty);
    };
  });

  // Reason Select
  document.querySelectorAll('[data-action="count-reason"]').forEach(select => {
    select.onchange = () => {
      const partId = parseInt(select.getAttribute('data-part-id'), 10);
      if (state.countDraft[partId]) {
        state.countDraft[partId].reason = select.value;
      }
    };
  });
}

// Open Confirm Count Modal Flow
if (btnOpenConfirmCount) {
  btnOpenConfirmCount.onclick = () => {
    const countedPartIds = Object.keys(state.countDraft);
    if (countedPartIds.length === 0) {
      showToast('กรุณานับสต๊อกอย่างน้อย 1 รายการก่อนกดยืนยัน', 'warning');
      return;
    }

    const operatorName = countOperatorName.value.trim();
    if (!operatorName || operatorName.length < 2) {
      showToast('กรุณาระบุชื่อผู้ตรวจนับอย่างน้อย 2 ตัวอักษร', 'warning');
      countOperatorName.focus();
      return;
    }

    const lines = countedPartIds.map(idStr => {
      const id = parseInt(idStr, 10);
      const part = state.countParts.find(p => p.id === id);
      const draft = state.countDraft[id];
      return {
        part_id: id,
        part_no: part?.part_no || '',
        description: part?.description || '',
        unit: part?.unit || '',
        system_qty: part ? part.qty : 0,
        counted_qty: draft.countedQty,
        difference: draft.difference,
        status: draft.status,
        reason: draft.reason
      };
    });

    const summary = calculateStockCountSummary(lines);
    revTotalCounted.textContent = formatTabularNumber(summary.totalCounted);
    revMatchCount.textContent = formatTabularNumber(summary.matchCount);
    revDiffCount.textContent = formatTabularNumber(summary.discrepancyCount);
    revNetDelta.textContent = summary.netDifference > 0 ? `+${formatTabularNumber(summary.netDifference)}` : formatTabularNumber(summary.netDifference);
    revDiffListCount.textContent = formatTabularNumber(summary.discrepancyCount);

    const diffLines = lines.filter(l => l.difference !== 0);
    if (diffLines.length === 0) {
      revDiscrepancyList.innerHTML = `
        <div style="text-align: center; padding: 18px; color: var(--status-normal); background: var(--bg-app); border-radius: var(--radius-sm); font-size: 0.88rem;">
          ✅ ยอดนับจริงตรงกับยอดระบบทุกรายการ (ไม่มีผลต่างที่ต้องปรับยอด)
        </div>
      `;
    } else {
      revDiscrepancyList.innerHTML = diffLines.map(l => {
        const isPos = l.difference > 0;
        const diffStr = isPos ? `+${l.difference}` : `${l.difference}`;
        const color = isPos ? 'var(--status-max)' : 'var(--status-out)';
        return `
          <div class="count-diff-row">
            <div>
              <strong class="num-tabular">${escapeHtml(l.part_no)}</strong>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(l.description)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                เหตุผล: <span style="color: var(--text-primary); font-weight: 500;">${escapeHtml(l.reason || '-')}</span>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.82rem; color: var(--text-secondary);">
                ระบบ: <span class="num-tabular">${formatTabularNumber(l.system_qty)}</span> ➔ นับได้: <strong class="num-tabular">${formatTabularNumber(l.counted_qty)}</strong>
              </div>
              <div class="num-tabular" style="font-weight: 700; color: ${color}; font-size: 0.95rem; margin-top: 2px;">
                ${diffStr} ${escapeHtml(l.unit)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    confirmCountNote.value = '';
    modalConfirmCount.classList.add('open');
  };
}

if (btnCloseConfirmCountModal) btnCloseConfirmCountModal.onclick = () => modalConfirmCount.classList.remove('open');
if (btnCancelConfirmCount) btnCancelConfirmCount.onclick = () => modalConfirmCount.classList.remove('open');

// Submit Stock Count Execution
if (btnExecuteSubmitCount) {
  btnExecuteSubmitCount.onclick = async () => {
    const operatorName = countOperatorName.value.trim();
    if (!operatorName || operatorName.length < 2) {
      showToast('กรุณาระบุชื่อผู้ตรวจนับอย่างน้อย 2 ตัวอักษร', 'warning');
      return;
    }

    const title = countSessionTitle.value.trim() || 'ตรวจนับสต๊อกสินค้าคงคลัง';
    const note = confirmCountNote.value.trim() || null;

    const lines = Object.keys(state.countDraft).map(idStr => {
      const id = parseInt(idStr, 10);
      const draft = state.countDraft[id];
      return {
        part_id: id,
        counted_qty: draft.countedQty,
        reason: draft.difference !== 0 ? (draft.reason || DISCREPANCY_REASONS[0]) : null
      };
    });

    if (lines.length === 0) {
      showToast('ไม่มีรายการตรวจนับที่จะบันทึก', 'warning');
      return;
    }

    btnExecuteSubmitCount.disabled = true;
    btnExecuteSubmitCount.textContent = '⏳ กำลังบันทึกและปรับยอด...';

    try {
      const res = await fetch('/api/counts/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          operator_name: operatorName,
          note,
          lines
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'ไม่สามารถบันทึกรอบตรวจนับได้');
      }

      localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName);
      showToast(`บันทึกรอบตรวจนับสำเร็จ (สร้างรายการปรับยอด ${json.data.movements_created} รายการ)`, 'success');

      modalConfirmCount.classList.remove('open');
      state.countDraft = {};
      state.countParts = []; // Trigger fresh reload next time

      // Refresh dashboard and parts catalog
      loadDashboard();
      loadParts();

      // Switch to history subtab to show newly created session
      btnCountSubtabHistory.click();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnExecuteSubmitCount.disabled = false;
      btnExecuteSubmitCount.textContent = '💾 ยืนยันและปรับยอดสต๊อก';
    }
  };
}

/**
 * Load Stock Count Audit History
 */
async function loadCountHistory() {
  countHistoryContainer.innerHTML = `
    <div class="part-card skeleton" style="height: 100px;"></div>
    <div class="part-card skeleton" style="height: 100px;"></div>
  `;

  try {
    const res = await fetch('/api/counts');
    if (!res.ok) throw new Error('API Error');
    const json = await res.json();
    const sessions = Array.isArray(json.data) ? json.data : (json.data?.counts || []);

    if (sessions.length === 0) {
      countHistoryContainer.innerHTML = `
        <div style="text-align:center; padding: 48px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📜</div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 4px;">ยังไม่มีประวัติการตรวจนับสต๊อก</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
            เมื่อมีการตรวจนับและยืนยันรอบนับ ประวัติการตรวจนับและผลต่างจะปรากฏที่นี่
          </p>
          <button class="chip" style="background: var(--action-count); color: #fff;" onclick="document.getElementById('btn-count-subtab-active').click()">
            + เริ่มรอบตรวจนับใหม่
          </button>
        </div>
      `;
      return;
    }

    countHistoryContainer.innerHTML = sessions.map(s => {
      const netDeltaStr = s.net_difference > 0 ? `+${formatTabularNumber(s.net_difference)}` : formatTabularNumber(s.net_difference);
      const netDeltaColor = s.net_difference === 0 ? 'var(--status-normal)' : (s.net_difference > 0 ? 'var(--status-max)' : 'var(--status-out)');

      return `
        <div class="history-session-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="chip" style="font-family: var(--font-mono); font-weight: 700; font-size: 0.78rem; background: #ede9fe; color: #6d28d9;">
                  #AUD-${s.id}
                </span>
                <strong style="font-size: 0.95rem;">${escapeHtml(s.title || 'ตรวจนับสต๊อกสินค้าคงคลัง')}</strong>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                โดย ${escapeHtml(s.operator_name)} · ${formatDateTime(s.created_at)}
              </div>
            </div>
            <button class="btn-sm-action" style="flex:none; background: var(--brand-tint); color: var(--brand-primary); font-weight: 600; padding: 4px 10px;" data-action="view-count-detail" data-count-id="${s.id}">
              ดูรายละเอียด ›
            </button>
          </div>

          <div style="display: flex; gap: 12px; font-size: 0.82rem; background: var(--bg-app); padding: 8px 12px; border-radius: var(--radius-sm); flex-wrap: wrap;">
            <div>ตรวจทั้งหมด: <strong class="num-tabular">${formatTabularNumber(s.total_lines)}</strong> รายการ</div>
            <div>ตรงระบบ: <strong class="num-tabular" style="color: var(--status-normal);">${formatTabularNumber(s.match_lines)}</strong></div>
            <div>มียอดต่าง: <strong class="num-tabular" style="color: var(--status-out);">${formatTabularNumber(s.discrepancy_lines)}</strong></div>
            <div>ผลต่างสุทธิ: <strong class="num-tabular" style="color: ${netDeltaColor};">${netDeltaStr}</strong></div>
          </div>

          ${s.note ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">หมายเหตุ: ${escapeHtml(s.note)}</div>` : ''}
        </div>
      `;
    }).join('');

    countHistoryContainer.querySelectorAll('[data-action="view-count-detail"]').forEach(btn => {
      btn.onclick = () => {
        const countId = parseInt(btn.getAttribute('data-count-id'), 10);
        openCountDetailModal(countId);
      };
    });
  } catch (err) {
    countHistoryContainer.innerHTML = `<div style="color: var(--status-out); text-align: center; padding: 24px;">ไม่สามารถโหลดประวัติการตรวจนับได้</div>`;
  }
}

/**
 * Open Stock Count Detail Modal Breakdown
 */
async function openCountDetailModal(countId) {
  modalCountDetail.classList.add('open');
  detailLinesContainer.innerHTML = `<div style="text-align: center; padding: 24px;"><span class="skeleton" style="display:inline-block; width: 60%; height: 20px;"></span></div>`;

  try {
    const res = await fetch(`/api/counts/${countId}`);
    if (!res.ok) throw new Error('API Error');
    const json = await res.json();
    const count = json.data?.count || json.data;
    const lines = json.data?.lines || [];

    if (!count) throw new Error('ไม่พบข้อมูลรอบตรวจนับ');

    detailSessionTitle.textContent = count.title || 'รอบตรวจนับสต๊อก';
    detailSessionSub.textContent = `#AUD-${count.id}`;
    detailOperator.textContent = count.operator_name || '-';
    detailCreatedAt.textContent = formatDateTime(count.created_at);
    detailTotalLines.textContent = formatTabularNumber(lines.length);

    const diffLinesCount = lines.filter(l => l.difference !== 0).length;
    detailDiffLines.textContent = formatTabularNumber(diffLinesCount);

    if (lines.length === 0) {
      detailLinesContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">ไม่มีรายการพัสดุในรอบนี้</div>`;
      return;
    }

    detailLinesContainer.innerHTML = lines.map(l => {
      const isPos = l.difference > 0;
      const isZero = l.difference === 0;
      const badgeClass = isZero ? 'badge-variance-match' : (isPos ? 'badge-variance-surplus' : 'badge-variance-deficit');
      const badgeLabel = isZero ? 'ตรงกัน (0)' : (isPos ? `เกิน (+${l.difference})` : `ขาด (${l.difference})`);

      return `
        <div class="count-diff-row">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong class="num-tabular">${escapeHtml(l.part_no || '')}</strong>
              ${l.brand_name ? `<span class="part-brand-tag">${escapeHtml(l.brand_name)}</span>` : ''}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(l.description || '')}</div>
            ${l.reason ? `<div style="font-size: 0.75rem; color: var(--status-out); margin-top: 2px;">สาเหตุ: ${escapeHtml(l.reason)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              ระบบ: <span class="num-tabular">${formatTabularNumber(l.system_qty)}</span> ➔ นับได้: <strong class="num-tabular">${formatTabularNumber(l.counted_qty)}</strong>
            </div>
            <div style="margin-top: 4px;">
              <span class="count-variance-badge ${badgeClass}">${badgeLabel}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    detailLinesContainer.innerHTML = `<div style="color: var(--status-out); text-align: center; padding: 20px;">ไม่สามารถโหลดรายละเอียดได้</div>`;
  }
}

if (btnCloseDetailModal) btnCloseDetailModal.onclick = () => modalCountDetail.classList.remove('open');

// Initialize App
loadDashboard();
loadParts();
