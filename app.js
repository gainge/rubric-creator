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

const state = {
  riskLevels: [],
  categories: [],
  criteria:   {},
  selections: {},
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

function applyStructure({ riskLevels, categories, criteria }) {
  state.riskLevels = riskLevels;
  state.categories = categories;
  state.criteria   = criteria || {};
  state.selections = {};
  saveStructureToStorage();
}

// === Storage ===
function saveStructureToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      riskLevels: state.riskLevels,
      categories: state.categories,
      criteria:   state.criteria,
    }));
  } catch (_) { /* localStorage disabled — in-memory only */ }
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
  const payload = JSON.stringify({
    riskLevels: state.riskLevels,
    categories: state.categories,
    criteria:   state.criteria,
  });
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
  document.getElementById('mode-toggle').textContent =
    state.mode === 'edit' ? 'Done editing' : 'Edit rubric';
  renderTable();
  renderPreview();
}

function renderTable() {
  const table = document.getElementById('rubric');
  table.innerHTML = '';

  // Header
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'corner';
  headRow.appendChild(corner);

  state.categories.forEach(cat => {
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
      remove.title = 'Remove column';
      remove.addEventListener('click', () => removeCategory(cat.id));
      th.appendChild(remove);
    }
    headRow.appendChild(th);
  });

  if (state.mode === 'edit') {
    const addTh = document.createElement('th');
    addTh.className = 'add-col';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '+ column';
    btn.addEventListener('click', addCategory);
    addTh.appendChild(btn);
    headRow.appendChild(addTh);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  state.riskLevels.forEach(rl => {
    const tr = document.createElement('tr');

    const rlHeader = document.createElement('th');
    rlHeader.className = 'rl-header';
    rlHeader.style.setProperty('--rl-color', rl.color);

    if (state.mode === 'edit') {
      const emojiEl = document.createElement('span');
      emojiEl.className = 'rl-emoji';
      emojiEl.contentEditable = 'true';
      emojiEl.spellcheck = false;
      emojiEl.textContent = rl.emoji;
      emojiEl.addEventListener('input', () => {
        // Keep emoji compact — grab first grapheme-ish chunk
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
      remove.title = 'Remove row';
      remove.addEventListener('click', () => removeRiskLevel(rl.id));

      rlHeader.append(emojiEl, labelEl, colorBtn, remove);
    } else {
      rlHeader.textContent = `${rl.emoji} ${rl.label}`;
    }
    tr.appendChild(rlHeader);

    state.categories.forEach(cat => {
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
      tr.appendChild(td);
    });

    if (state.mode === 'edit') {
      // Filler cell aligned with "+ column" header
      tr.appendChild(document.createElement('td'));
    }
    tbody.appendChild(tr);
  });

  if (state.mode === 'edit') {
    const addTr = document.createElement('tr');
    addTr.className = 'add-row-row';
    const td = document.createElement('td');
    td.colSpan = state.categories.length + 2;
    td.className = 'add-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '+ row';
    btn.addEventListener('click', addRiskLevel);
    td.appendChild(btn);
    addTr.appendChild(td);
    tbody.appendChild(addTr);
  }

  table.appendChild(tbody);
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

function buildMarkdown() {
  const cats = state.categories;
  const headerCells = ['', ...cats.map(c => escapeMd(c.label) || ' ')];
  const lines = [
    '| ' + headerCells.join(' | ') + ' |',
    '|' + headerCells.map(() => '---').join('|') + '|',
  ];
  state.riskLevels.forEach(rl => {
    const row = [`${rl.emoji} ${escapeMd(rl.label)}`.trim()];
    cats.forEach(cat => {
      const text = escapeMd(state.criteria[`${rl.id}:${cat.id}`] || '');
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

  const renderCell = txt =>
    txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

  document.getElementById('copy-rubric').addEventListener('click', async e => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      flash(e.currentTarget, 'Copied!');
    } catch {
      alert('Clipboard access was blocked. Open the markdown source panel below and copy manually.');
    }
  });

  document.getElementById('copy-url').addEventListener('click', async e => {
    const url = location.origin + location.pathname + '#' + encodeStructureToHash();
    try {
      await navigator.clipboard.writeText(url);
      flash(e.currentTarget, 'Copied!');
    } catch {
      prompt('Copy this URL:', url);
    }
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
  const original = btn.textContent;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
}

init();
