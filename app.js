// === Defaults ===
const DEFAULT_RISK_LEVELS = [
  { id: 'low',  label: 'Low risk',  emoji: '🟢', color: '#22c55e' },
  { id: 'some', label: 'Some risk', emoji: '🟡', color: '#eab308' },
  { id: 'high', label: 'High risk', emoji: '🔴', color: '#ef4444' },
];

const DEFAULT_CATEGORIES = [
  { id: 'scope',      label: 'Scope' },
  { id: 'tests',      label: 'Test coverage' },
  { id: 'migrations', label: 'Migrations' },
];

const DEFAULT_CRITERIA = {
  'low:scope':  'Single small module',
  'some:scope': 'Multiple modules',
  'high:scope': 'Cross-cutting / many modules',
  'low:tests':  'Full unit + integration',
  'some:tests': 'Partial coverage',
  'high:tests': 'None / manual only',
  'low:migrations':  'None',
  'some:migrations': 'Additive only',
  'high:migrations': 'Destructive or data-mutating',
};

const COLOR_PALETTE = ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#94a3b8', '#0ea5e9', '#f97316'];
const NEW_RL_DEFAULTS = { emoji: '⚪', color: '#94a3b8' };

const STORAGE_KEY = 'rubric-creator:structure:v1';

const DEFAULT_CONFIG = {
  orientation: 'risk-rows', // 'risk-rows' | 'category-rows'
  maxColWidth: 40,          // chars per markdown table cell; 0 disables wrapping
};

const state = {
  riskLevels: [],
  categories: [],
  criteria:   {},
  selections: {},
  config: { ...DEFAULT_CONFIG },
  mode: 'use',
};

// === Init ===
function init() {
  const fromUrl = decodeStructureFromHash();
  if (fromUrl) {
    applyStructure(fromUrl);
  } else {
    const stored = loadStructureFromStorage();
    applyStructure(stored || makeDefaultStructure());
  }
  wireGlobalEvents();
  render();
}

function makeDefaultStructure() {
  return {
    riskLevels: structuredClone(DEFAULT_RISK_LEVELS),
    categories: structuredClone(DEFAULT_CATEGORIES),
    criteria:   structuredClone(DEFAULT_CRITERIA),
  };
}

function applyStructure({ riskLevels, categories, criteria, config }) {
  state.riskLevels = riskLevels;
  state.categories = categories;
  state.criteria   = criteria || {};
  state.config = {
    orientation: config?.orientation === 'category-rows' ? 'category-rows' : 'risk-rows',
    maxColWidth: Number.isFinite(config?.maxColWidth) ? config.maxColWidth : DEFAULT_CONFIG.maxColWidth,
  };
  state.selections = {};
  saveStructureToStorage();
}

// === Storage ===
function saveStructureToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableStructure()));
  } catch (_) { /* localStorage disabled — in-memory only */ }
}

function serializableStructure() {
  return {
    riskLevels: state.riskLevels,
    categories: state.categories,
    criteria:   state.criteria,
    config:     state.config,
  };
}

function loadStructureFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.riskLevels?.length || !parsed.categories) return null;
    return parsed;
  } catch (_) { return null; }
}

// === URL codec ===
// JSON → UTF-8 → base64 → hash fragment. If payloads ever push browser URL
// limits (~tens of KB safe in practice), swap btoa for lz-string compression.
function encodeStructureToHash() {
  const payload = JSON.stringify(serializableStructure());
  return 'r=' + btoa(unescape(encodeURIComponent(payload)));
}

function decodeStructureFromHash() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith('r=')) return null;
  try {
    const json = decodeURIComponent(escape(atob(hash.slice(2))));
    const parsed = JSON.parse(json);
    if (!parsed.riskLevels?.length || !parsed.categories) return null;
    return parsed;
  } catch (_) { return null; }
}

// === Render ===
function render() {
  document.body.dataset.mode = state.mode;
  document.body.dataset.orientation = state.config.orientation;
  document.getElementById('mode-toggle').textContent =
    state.mode === 'edit' ? 'Done editing' : 'Edit rubric';
  const widthInput = document.getElementById('max-width');
  if (widthInput && document.activeElement !== widthInput) {
    widthInput.value = String(state.config.maxColWidth);
  }
  applyCellWidthVar();
  renderTable();
  renderPreview();
}

// Drive a single CSS custom property from the configured char width.
// `ch` units track the rendered "0" glyph, so the visual wrap matches what
// the markdown emitter does textually — close enough for parity, and the
// browser handles word breaking natively (so contenteditable still works).
function applyCellWidthVar() {
  const w = state.config.maxColWidth;
  document.body.style.setProperty('--max-cell-width', w > 0 ? `${Math.floor(Math.max(w / 2, 1))}ch` : 'none');
}

function renderTable() {
  const table = document.getElementById('rubric');
  table.innerHTML = '';

  const catsAsRows = state.config.orientation === 'category-rows';
  const rowItems = catsAsRows ? state.categories : state.riskLevels;
  const colItems = catsAsRows ? state.riskLevels : state.categories;
  const isRiskItem = item => 'emoji' in item;
  const headerFor = item => isRiskItem(item) ? renderRiskHeader(item) : renderCategoryHeader(item);
  const addColAction = catsAsRows ? addRiskLevel : addCategory;
  const addRowAction = catsAsRows ? addCategory   : addRiskLevel;

  // === Header row ===
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner';
  headRow.appendChild(corner);
  colItems.forEach(col => headRow.appendChild(headerFor(col)));
  if (state.mode === 'edit') headRow.appendChild(renderAddButton('col', addColAction));
  thead.appendChild(headRow);
  table.appendChild(thead);

  // === Body rows ===
  const tbody = document.createElement('tbody');
  rowItems.forEach(rowItem => {
    const tr = document.createElement('tr');
    tr.appendChild(headerFor(rowItem));
    colItems.forEach(colItem => {
      const rl  = isRiskItem(rowItem) ? rowItem : colItem;
      const cat = isRiskItem(rowItem) ? colItem : rowItem;
      tr.appendChild(renderCriteriaCell(rl, cat));
    });
    if (state.mode === 'edit') tr.appendChild(document.createElement('td')); // filler under "+ col"
    tbody.appendChild(tr);
  });

  if (state.mode === 'edit') {
    const addTr = document.createElement('tr');
    addTr.className = 'add-row-row';
    const td = document.createElement('td');
    td.colSpan = colItems.length + 2;
    td.className = 'add-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '+ row';
    btn.addEventListener('click', addRowAction);
    td.appendChild(btn);
    addTr.appendChild(td);
    tbody.appendChild(addTr);
  }
  table.appendChild(tbody);
}

function renderAddButton(kind, action) {
  const th = document.createElement('th');
  th.className = kind === 'col' ? 'add-col' : 'add-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = kind === 'col' ? '+ column' : '+ row';
  btn.addEventListener('click', action);
  th.appendChild(btn);
  return th;
}

function renderCategoryHeader(cat) {
  const th = document.createElement('th');
  th.className = 'cat-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'cat-label';
  labelEl.textContent = cat.label;
  if (state.mode === 'edit') {
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.addEventListener('input', () => {
      cat.label = labelEl.textContent;
      saveStructureToStorage();
      renderPreview();
    });
  }
  th.appendChild(labelEl);

  if (state.mode === 'edit') {
    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.textContent = '×';
    remove.title = 'Remove category';
    remove.addEventListener('click', () => removeCategory(cat.id));
    th.appendChild(remove);
  }
  return th;
}

function renderRiskHeader(rl) {
  const th = document.createElement('th');
  th.className = 'rl-header';
  th.style.setProperty('--rl-color', rl.color);

  if (state.mode === 'edit') {
    const emojiEl = document.createElement('span');
    emojiEl.className = 'rl-emoji';
    emojiEl.contentEditable = 'true';
    emojiEl.spellcheck = false;
    emojiEl.textContent = rl.emoji;
    emojiEl.addEventListener('input', () => {
      const v = emojiEl.textContent.trim();
      rl.emoji = Array.from(v)[0] || '';
      saveStructureToStorage();
      renderPreview();
    });

    const labelEl = document.createElement('span');
    labelEl.className = 'rl-label';
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.textContent = rl.label;
    labelEl.addEventListener('input', () => {
      rl.label = labelEl.textContent;
      saveStructureToStorage();
      renderPreview();
    });

    const colorBtn = document.createElement('button');
    colorBtn.className = 'color-swatch';
    colorBtn.style.background = rl.color;
    colorBtn.title = 'Change color';
    colorBtn.addEventListener('click', e => openColorPalette(e, rl));

    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.textContent = '×';
    remove.title = 'Remove risk level';
    remove.addEventListener('click', () => removeRiskLevel(rl.id));

    th.append(emojiEl, labelEl, colorBtn, remove);
  } else {
    th.textContent = `${rl.emoji} ${rl.label}`;
  }
  return th;
}

function renderCriteriaCell(rl, cat) {
  const td = document.createElement('td');
  td.className = 'criteria-cell';
  const key = `${rl.id}:${cat.id}`;
  const text = state.criteria[key] || '';

  if (state.selections[cat.id] === rl.id) {
    td.classList.add('selected');
    td.style.setProperty('--rl-color', rl.color);
  }

  if (state.mode === 'edit') {
    td.contentEditable = 'true';
    td.spellcheck = false;
    td.textContent = text;
    td.addEventListener('input', () => {
      state.criteria[key] = td.textContent;
      saveStructureToStorage();
      renderPreview();
    });
  } else {
    td.textContent = text;
    td.addEventListener('click', () => {
      if (state.selections[cat.id] === rl.id) delete state.selections[cat.id];
      else state.selections[cat.id] = rl.id;
      render();
    });
  }
  return td;
}

// === Color palette popover ===
function openColorPalette(evt, rl) {
  evt.stopPropagation();
  closeColorPalette();
  const popover = document.createElement('div');
  popover.className = 'color-palette';
  popover.id = '__palette';
  COLOR_PALETTE.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.style.background = color;
    swatch.addEventListener('click', e => {
      e.stopPropagation();
      rl.color = color;
      saveStructureToStorage();
      closeColorPalette();
      render();
    });
    popover.appendChild(swatch);
  });
  const rect = evt.target.getBoundingClientRect();
  popover.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popover.style.left = `${rect.left   + window.scrollX}px`;
  document.body.appendChild(popover);
  // Defer attaching the dismiss handler until after this click bubbles.
  setTimeout(() => document.addEventListener('click', closeColorPalette, { once: true }), 0);
}

function closeColorPalette() {
  document.getElementById('__palette')?.remove();
}

// === Mutations ===
function genId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 8);
}

function addCategory() {
  state.categories.push({ id: genId('cat'), label: 'New category' });
  saveStructureToStorage();
  render();
}

function removeCategory(catId) {
  state.categories = state.categories.filter(c => c.id !== catId);
  for (const k of Object.keys(state.criteria)) {
    if (k.endsWith(':' + catId)) delete state.criteria[k];
  }
  delete state.selections[catId];
  saveStructureToStorage();
  render();
}

function addRiskLevel() {
  state.riskLevels.push({
    id: genId('rl'),
    label: 'New level',
    emoji: NEW_RL_DEFAULTS.emoji,
    color: NEW_RL_DEFAULTS.color,
  });
  saveStructureToStorage();
  render();
}

function removeRiskLevel(rlId) {
  state.riskLevels = state.riskLevels.filter(r => r.id !== rlId);
  for (const k of Object.keys(state.criteria)) {
    if (k.startsWith(rlId + ':')) delete state.criteria[k];
  }
  for (const catId of Object.keys(state.selections)) {
    if (state.selections[catId] === rlId) delete state.selections[catId];
  }
  saveStructureToStorage();
  render();
}

// === Markdown output ===
function escapeMd(s) {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

// Wrap on word boundaries, then escape each line, then rejoin with <br>.
// GitHub-flavored markdown renders <br> inside table cells as a line break,
// so a long cell stays readable instead of stretching the column.
function wrapAndEscape(text, maxWidth) {
  if (!text) return '';
  const w = Number(maxWidth) || 0;
  if (w <= 0) return escapeMd(text);
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (!cur) { cur = word; continue; }
    if ((cur + ' ' + word).length > w) { lines.push(cur); cur = word; }
    else { cur += ' ' + word; }
  }
  if (cur) lines.push(cur);
  return lines.map(escapeMd).join('<br>');
}

function buildMarkdown() {
  const catsAsRows = state.config.orientation === 'category-rows';
  const rowItems = catsAsRows ? state.categories : state.riskLevels;
  const colItems = catsAsRows ? state.riskLevels : state.categories;
  const w = state.config.maxColWidth;
  const labelOf = item =>
    'emoji' in item ? `${item.emoji} ${item.label}`.trim() : item.label;

  const headerCells = ['', ...colItems.map(c => wrapAndEscape(labelOf(c), w) || ' ')];
  const lines = [
    '| ' + headerCells.join(' | ') + ' |',
    '|' + headerCells.map(() => '---').join('|') + '|',
  ];

  rowItems.forEach(rowItem => {
    const row = [wrapAndEscape(labelOf(rowItem), w) || ' '];
    colItems.forEach(colItem => {
      const rl  = 'emoji' in rowItem ? rowItem : colItem;
      const cat = 'emoji' in rowItem ? colItem : rowItem;
      const text = wrapAndEscape(state.criteria[`${rl.id}:${cat.id}`] || '', w);
      if (state.selections[cat.id] === rl.id) {
        row.push(`**${rl.emoji} ${text || ' '}**`);
      } else {
        row.push(text || ' ');
      }
    });
    lines.push('| ' + row.join(' | ') + ' |');
  });
  return lines.join('\n');
}

function renderPreview() {
  const md = buildMarkdown();
  document.getElementById('preview-source').textContent = md;
  document.getElementById('preview-rendered').innerHTML = renderMdTable(md);
}

// Minimal renderer for our own output shape: pipe table + `**bold**`.
// Not a general-purpose markdown engine.
function renderMdTable(md) {
  const lines = md.split('\n').filter(l => l.trim());
  if (lines.length < 2) return '';
  const parseRow = line => {
    const cells = [];
    let buf = '';
    for (let i = 1; i < line.length; i++) {
      const c = line[i];
      if (c === '\\' && line[i + 1] === '|')  { buf += '|';  i++; continue; }
      if (c === '\\' && line[i + 1] === '\\') { buf += '\\'; i++; continue; }
      if (c === '|') { cells.push(buf.trim()); buf = ''; continue; }
      buf += c;
    }
    return cells;
  };
  const rows = lines.map(parseRow);
  rows.splice(1, 1); // drop the |---| separator row

  // Escape HTML, then restore the small set of inline tags our markdown emits.
  const renderCell = txt =>
    txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
       .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  let html = '<table class="md-preview"><thead><tr>';
  rows[0].forEach(c => { html += `<th>${renderCell(c)}</th>`; });
  html += '</tr></thead><tbody>';
  for (let i = 1; i < rows.length; i++) {
    html += '<tr>';
    rows[i].forEach((c, j) => {
      const tag = j === 0 ? 'th' : 'td';
      html += `<${tag}>${renderCell(c)}</${tag}>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// === Buttons ===
function wireGlobalEvents() {
  document.getElementById('mode-toggle').addEventListener('click', () => {
    state.mode = state.mode === 'edit' ? 'use' : 'edit';
    render();
  });

  document.getElementById('swap-axes').addEventListener('click', () => {
    state.config.orientation =
      state.config.orientation === 'risk-rows' ? 'category-rows' : 'risk-rows';
    saveStructureToStorage();
    render();
  });

  document.getElementById('max-width').addEventListener('input', e => {
    const raw = parseInt(e.target.value, 10);
    state.config.maxColWidth = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    saveStructureToStorage();
    applyCellWidthVar();
    renderPreview();
  });

  document.getElementById('copy-rubric').addEventListener('click', async e => {
    // Capture the button now — `currentTarget` is nulled by the browser as
    // soon as we `await`, since the synchronous event dispatch has ended.
    const btn = e.currentTarget;
    const ok = await copyToClipboard(buildMarkdown());
    if (ok) flash(btn, 'Copied!');
    else alert('Clipboard access was blocked. Open the markdown source panel below and copy manually.');
  });

  document.getElementById('copy-url').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const url = location.origin + location.pathname + '#' + encodeStructureToHash();
    const ok = await copyToClipboard(url);
    if (ok) flash(btn, 'Copied!');
    else prompt('Copy this URL:', url);
  });

  document.getElementById('reset-selections').addEventListener('click', () => {
    state.selections = {};
    render();
  });

  document.getElementById('new-rubric').addEventListener('click', () => {
    if (confirm('Replace the current rubric with the default? Your edits will be lost.')) {
      applyStructure(makeDefaultStructure());
      render();
    }
  });

  window.addEventListener('hashchange', () => {
    const fromUrl = decodeStructureFromHash();
    if (fromUrl) {
      applyStructure(fromUrl);
      render();
    }
  });
}

function flash(btn, msg) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
}

// Writes `text` to the clipboard. Tries the async Clipboard API first, then
// falls back to a hidden textarea + execCommand('copy') for contexts where
// the async API is unavailable (file://, http on a non-localhost host, some
// embedded browsers). Returns true on success.
async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed; trying execCommand fallback', err);
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (err) {
    console.warn('execCommand copy fallback failed', err);
    return false;
  }
}

init();
