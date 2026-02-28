/* Dione OS – Field Notes Edition
   Vanilla JS, offline-first, IndexedDB
*/
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const DEFAULT_PROJECTS = [
    { id: 'lota-kopi', name: 'Lota Kopi' },
    { id: 'cucufate', name: 'Cucufate' },
    { id: 'cli-work', name: 'CLI Work' },
    { id: 'espresso', name: 'Espresso Experiments' },
    { id: 'travel', name: 'Travel' }
  ];


  const PROMPT_PACK = [
    {
      id: 'clarity',
      title: '🔍 Clarity Mode',
      meta: 'Help me untangle this.',
      text:
`You are my calm thinking partner.

Task: Help me untangle this.

Rules:
- Ask up to 3 sharp questions only if needed; otherwise proceed.
- Separate facts, feelings, assumptions.
- Identify the core problem in 1 sentence.

Output format:
1) What I’m really saying (1–3 lines)
2) The real constraint
3) The key unknowns (bullets)
4) The smallest next step (1 action)`
    },
    {
      id: 'structure',
      title: '🧱 Structure Mode',
      meta: 'Turn this into a structured plan.',
      text:
`Turn my notes into a structured plan.

Output format:
- Goal (1 line)
- Context (2–4 bullets)
- Constraints (bullets)
- Options (2–4)
- Chosen approach (1)
- Plan: Now / Next / Later
- Risks + mitigations
- Success metrics
- First 30 minutes checklist`
    },
    {
      id: 'decision',
      title: '🎯 Decision Mode',
      meta: 'Compare options and recommend one.',
      text:
`Compare the options I mention (or infer 2–3 plausible options if I didn’t list them).

Use:
- Decision criteria (5 max)
- Weighted score (lightweight)
- Risks + reversibility

End with:
- Recommendation (one option)
- Why (3 bullets)
- What I’m giving up (1–2 bullets)
- Next step (1 action)`
    },
    {
      id: 'business',
      title: '💸 Business Lens',
      meta: 'Analyze this like a startup founder (leverage-first).',
      text:
`Act as a calm senior product strategist with 15+ years experience in design, brand, and startup execution.
Be concise.
Prefer frameworks over paragraphs.
Avoid fluff.
Focus on leverage.

Analyze this like a startup founder.

Output format:
- What game are we playing? (market / customer / job-to-be-done)
- Hypothesis (1–2 lines)
- Leverage moves (3)
- Cost/effort reality check
- Risks (top 3)
- Next experiment (1 week)
- Kill criteria (when to stop)`
    },
    {
      id: 'design',
      title: '🎨 Design Lens',
      meta: 'Improve this like a senior product designer.',
      text:
`Improve this like a senior product designer.

Output format:
- User + job-to-be-done
- UX problems (bullets)
- Information architecture (suggested sections)
- Interaction model (key flows)
- UI rules (type, spacing, hierarchy)
- Copy improvements (short examples)
- Next iteration checklist`
    },
    {
      id: 'reflection',
      title: '🧘 Reflection Mode',
      meta: 'Help me journal this clearly.',
      text:
`Help me journal this clearly.

Output format:
- What happened (facts)
- What I felt (name the emotions)
- What I needed (needs)
- What I learned (insight)
- What I will do next (1–3 actions)

Tone: gentle, grounded, honest. No clichés.`
    },
    {
      id: 'advanced',
      title: '🔥 Advanced (Aries mind / Taurus body)',
      meta: 'Slow down and structure big thinking.',
      text:
`Help me slow down and structure this idea properly.

Answer these:
1) What is the core problem here?
2) What is noise vs signal?
3) What would a disciplined version of me decide?
4) What would a bold version of me attempt?
5) What should I ignore completely?

Then:
- 1 decision (commit)
- 1 constraint (respect)
- 1 next step (do today)`
    }
  ];



  const state = {
    activeTab: 'daily',
    selectedMood: null,
    selectedRating: null,
    editorEntry: null,
    editorMode: null,
    editorProjectId: null,
    previewOn: false
  };

  function uid(prefix='e') {
    const s = crypto.getRandomValues(new Uint32Array(3));
    return `${prefix}_${s[0].toString(16)}${s[1].toString(16)}${s[2].toString(16)}`;
  }

  function nowISO() { return new Date().toISOString(); }

  function toTags(raw) {
    if (!raw) return [];
    return raw
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : `#${t}`)
      .map(t => t.toLowerCase());
  }

  function formatDay(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
  }

  function escapeHTML(s='') {
    return s.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  // Markdown-light for Thinking preview
  function mdLight(text='') {
    const lines = text.split('\n');
    const out = [];
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('### ')) out.push(`<h3>${escapeHTML(t.slice(4))}</h3>`);
      else if (t.startsWith('## ')) out.push(`<h2>${escapeHTML(t.slice(3))}</h2>`);
      else if (t.startsWith('# ')) out.push(`<h1>${escapeHTML(t.slice(2))}</h1>`);
      else if (t.startsWith('- [ ] ')) {
        out.push(`<div class="check"><input type="checkbox" disabled /><div>${escapeHTML(t.slice(6))}</div></div>`);
      } else if (t.startsWith('- [x] ') || t.startsWith('- [X] ')) {
        out.push(`<div class="check"><input type="checkbox" checked disabled /><div>${escapeHTML(t.slice(6))}</div></div>`);
      } else if (t.startsWith('- ')) {
        // collect list items into a <ul>
        const items = [];
        let i = lines.indexOf(line);
        // This simplistic approach avoids complex parsing; handled below with post-pass.
        out.push(`__ULI__${escapeHTML(t.slice(2))}`);
      } else if (t === '') {
        out.push('<div style="height:8px"></div>');
      } else {
        out.push(`<div>${escapeHTML(line)}</div>`);
      }
    }
    // Post-pass: group consecutive __ULI__
    const grouped = [];
    for (let i=0; i<out.length; i++) {
      if (out[i].startsWith('__ULI__')) {
        const items = [];
        while (i<out.length && out[i].startsWith('__ULI__')) {
          items.push(`<li>${out[i].replace('__ULI__','')}</li>`);
          i++;
        }
        i--;
        grouped.push(`<ul>${items.join('')}</ul>`);
      } else grouped.push(out[i]);
    }
    return grouped.join('');
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 1600);
  }

  // Prompt Pack (quick commands)
  function isEditorOpen() {
    return !$('#editorModal').classList.contains('hidden');
  }

  function copyText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => toast('Copied')).catch(() => fallbackCopy(value));
    } else {
      fallbackCopy(value);
    }
  }

  function fallbackCopy(value) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch(e) { toast('Copy failed'); }
    document.body.removeChild(ta);
  }

  function insertIntoEditor(text) {
    if (!isEditorOpen()) return toast('Open an entry to insert');
    const el = $('#editorBody');
    const value = String(text || '').trim();
    if (!value) return;
    const sep = el.value && !el.value.endsWith('\n') ? '\n\n' : '\n';
    el.value = (el.value || '') + sep + value + '\n';
    el.focus();
    toast('Inserted');
  }

  function openPromptModal() {
    renderPromptList();
    $('#modalBackdrop').classList.remove('hidden');
    $('#promptModal').classList.remove('hidden');
    $('#modalBackdrop').setAttribute('aria-hidden', 'false');
    $('#promptModal').setAttribute('aria-hidden', 'false');
  }

  function closePromptModal() {
    $('#promptModal').classList.add('hidden');
    $('#promptModal').setAttribute('aria-hidden', 'true');
    // only hide backdrop if editor is not open
    if (!isEditorOpen()) {
      $('#modalBackdrop').classList.add('hidden');
      $('#modalBackdrop').setAttribute('aria-hidden', 'true');
    }
  }

  function renderPromptList() {
    const wrap = $('#promptList');
    wrap.innerHTML = '';
    for (const p of PROMPT_PACK) {
      const card = document.createElement('div');
      card.className = 'card prompt-card';
      card.innerHTML = `
        <div class="label">${escapeHTML(p.title)}</div>
        <div class="prompt-card__meta">${escapeHTML(p.meta || '')}</div>
        <div class="prompt-card__actions">
          <button class="btn btn--tool" type="button" data-prompt-action="copy" data-prompt-id="${escapeHTML(p.id)}">COPY</button>
          <button class="btn btn--ghost" type="button" data-prompt-action="insert" data-prompt-id="${escapeHTML(p.id)}">INSERT</button>
        </div>
        <div class="prompt-card__textarea">${escapeHTML(p.text)}</div>
      `;
      wrap.appendChild(card);
    }
    // delegate actions
    wrap.querySelectorAll('[data-prompt-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-prompt-id');
        const action = btn.getAttribute('data-prompt-action');
        const p = PROMPT_PACK.find(x => x.id === id);
        if (!p) return;
        if (action === 'copy') copyText(p.text);
        if (action === 'insert') insertIntoEditor(p.text);
      });
    });
  }



  function setActiveTab(tab) {
    state.activeTab = tab;
    $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === tab));
    if (tab === 'search') $('#searchQuery').focus();
  }

  async function ensureDefaults() {
    const projects = await DioneDB.getAll(DioneDB.STORES.projects);
    if (!projects.length) {
      for (const p of DEFAULT_PROJECTS) await DioneDB.put(DioneDB.STORES.projects, p);
    }
  }

  async function loadProjects() {
    const projects = await DioneDB.getAll(DioneDB.STORES.projects);
    // Grid
    const grid = $('#projectGrid');
    grid.innerHTML = '';
    for (const p of projects) {
      const btn = document.createElement('button');
      btn.className = 'project-card';
      btn.type = 'button';
      btn.dataset.projectId = p.id;
      btn.innerHTML = `
        <div class="project-card__title">${escapeHTML(p.name)}</div>
        <div class="project-card__meta">Tap to open</div>
      `;
      grid.appendChild(btn);
    }

    // Selects
    const selEditor = $('#editorProject');
    const selFilter = $('#filterProject');
    selEditor.innerHTML = '';
    selFilter.innerHTML = '<option value="">Any</option>';

    for (const p of projects) {
      const o1 = document.createElement('option');
      o1.value = p.id; o1.textContent = p.name;
      selEditor.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = p.id; o2.textContent = p.name;
      selFilter.appendChild(o2);
    }
  }

  async function loadDailyTimeline() {
    const entries = await DioneDB.getAllByIndex(DioneDB.STORES.entries, 'by_mode', 'daily');
    entries.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    $('#dailyMeta').textContent = entries.length ? `${entries.length} entries` : 'Start with one entry today.';

    const timeline = $('#dailyTimeline');
    timeline.innerHTML = '';

    const groups = new Map();
    for (const e of entries) {
      const day = formatDay(e.createdAt);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(e);
    }

    for (const [day, list] of groups.entries()) {
      const group = document.createElement('div');
      group.className = 'daygroup';
      group.innerHTML = `<div class="daygroup__head"><div class="daygroup__date">${escapeHTML(day)}</div></div>`;
      for (const e of list) group.appendChild(renderEntryCard(e));
      timeline.appendChild(group);
    }
  }

  function moodBadge(mood) {
    if (!mood) return '';
    return `<span class="badge badge--accent">${escapeHTML(mood)}</span>`;
  }

  function starPinBadges(e) {
    const parts = [];
    if (e.pinned) parts.push('<span class="badge">PINNED</span>');
    if (e.starred) parts.push('<span class="badge">STARRED</span>');
    return parts.join(' ');
  }

  function renderEntryCard(e) {
    const card = document.createElement('div');
    card.className = 'entry';
    card.tabIndex = 0;
    card.role = 'button';
    card.dataset.entryId = e.id;

    const metaParts = [];
    metaParts.push(`<span>${escapeHTML(formatTime(e.createdAt))}</span>`);
    if (e.tags?.length) metaParts.push(`<span>${escapeHTML(e.tags.join(' '))}</span>`);

    if (e.sleepHours != null) metaParts.push(`<span>sleep ${escapeHTML(String(e.sleepHours))}h</span>`);
    if (e.coffeeCount != null) metaParts.push(`<span>coffee ${escapeHTML(String(e.coffeeCount))}</span>`);

    card.innerHTML = `
      <div class="entry__top">
        <div class="entry__body">${escapeHTML(e.body || '')}</div>
      </div>
      <div class="entry__meta">
        ${moodBadge(e.mood)}
        ${e.rating ? `<span class="badge badge--accent">${escapeHTML(e.rating)}</span>` : ''}
        ${starPinBadges(e)}
        ${metaParts.join('')}
      </div>
      <div class="entry__actions">
        <button class="btn btn--ghost" type="button" data-action="open">OPEN</button>
        <button class="btn btn--ghost" type="button" data-action="pin">${e.pinned ? 'UNPIN' : 'PIN'}</button>
        <button class="btn btn--ghost" type="button" data-action="star">${e.starred ? 'UNSTAR' : 'STAR'}</button>
      </div>
    `;
    return card;
  }

  async function openProject(projectId) {
    const proj = await DioneDB.get(DioneDB.STORES.projects, projectId);
    $('#projectTitle').textContent = proj?.name || 'Project';
    $('#projectDetail').classList.remove('hidden');
    $('#projectGrid').classList.add('hidden');
    $('#projectDetail').dataset.projectId = projectId;

    const entries = await DioneDB.getAllByIndex(DioneDB.STORES.entries, 'by_projectId', projectId);
    entries.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const list = $('#projectEntryList');
    list.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'item';
      empty.innerHTML = `<div class="item__title">No entries yet</div><div class="item__meta">Tap “NEW ENTRY” to start.</div>`;
      list.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'item';
      item.dataset.entryId = e.id;
      item.innerHTML = `
        <div class="item__title">${escapeHTML(e.title || 'Untitled')}</div>
        <div class="item__meta">${escapeHTML(formatDay(e.createdAt))} • ${escapeHTML(formatTime(e.createdAt))}
          ${e.rating ? ` • ${escapeHTML(e.rating)}` : ''}</div>
      `;
      list.appendChild(item);
    }
  }

  function closeProject() {
    $('#projectDetail').classList.add('hidden');
    $('#projectGrid').classList.remove('hidden');
    $('#projectDetail').dataset.projectId = '';
  }

  async function loadThinkingList() {
    const entries = await DioneDB.getAllByIndex(DioneDB.STORES.entries, 'by_mode', 'thinking');
    entries.sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    const list = $('#thinkingList');
    list.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'item';
      empty.innerHTML = `<div class="item__title">No pages yet</div><div class="item__meta">Tap “NEW PAGE”.</div>`;
      list.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'item';
      item.dataset.entryId = e.id;
      item.innerHTML = `
        <div class="item__title">${escapeHTML(e.title || 'Untitled')}</div>
        <div class="item__meta">${escapeHTML(new Date(e.updatedAt || e.createdAt).toLocaleString())}
          ${e.tags?.length ? ` • ${escapeHTML(e.tags.join(' '))}` : ''}</div>
      `;
      list.appendChild(item);
    }
  }

  function openSheet() {
    $('#sheetBackdrop').classList.remove('hidden');
    $('#captureSheet').classList.remove('hidden');
    $('#sheetBackdrop').setAttribute('aria-hidden', 'false');
    $('#captureSheet').setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    $('#sheetBackdrop').classList.add('hidden');
    $('#captureSheet').classList.add('hidden');
    $('#sheetBackdrop').setAttribute('aria-hidden', 'true');
    $('#captureSheet').setAttribute('aria-hidden', 'true');
  }

  function openEditor(entry, mode, projectId=null) {
    state.editorEntry = entry;
    state.editorMode = mode;
    state.editorProjectId = projectId;

    $('#editorTitle').value = entry?.title || '';
    $('#editorBody').value = entry?.body || '';
    $('#editorTags').value = (entry?.tags || []).join(' ');
    $('#editorProject').value = projectId || entry?.projectId || '';
    $('#editorProjectWrap').classList.toggle('hidden', mode !== 'project');

    // pin/star button labels
    $('#btnEditorPin').textContent = entry?.pinned ? 'UNPIN' : 'PIN';
    $('#btnEditorStar').textContent = entry?.starred ? 'UNSTAR' : 'STAR';

    // rating chips visible for project, optional for daily
    $('#ratingRow').classList.toggle('hidden', mode === 'thinking');

    // chip selection state
    selectChipGroup('[data-rating]', entry?.rating || null);
    selectChipGroup('[data-mood]', entry?.mood || null);

    // attachments
    renderAttachments(entry?.attachments || []);

    // preview
    state.previewOn = false;
    $('#btnTogglePreview').setAttribute('aria-pressed', 'false');
    $('#btnTogglePreview').textContent = 'SHOW';
    $('#thinkingPreviewWrap').classList.toggle('hidden', mode !== 'thinking');
    $('#thinkingPreview').innerHTML = '';

    $('#modalBackdrop').classList.remove('hidden');
    $('#editorModal').classList.remove('hidden');
    $('#modalBackdrop').setAttribute('aria-hidden', 'false');
    $('#editorModal').setAttribute('aria-hidden', 'false');
  }

  function closeEditor() {
    $('#modalBackdrop').classList.add('hidden');
    $('#editorModal').classList.add('hidden');
    $('#modalBackdrop').setAttribute('aria-hidden', 'true');
    $('#editorModal').setAttribute('aria-hidden', 'true');
    state.editorEntry = null;
    state.editorMode = null;
    state.editorProjectId = null;
  }

  function selectChipGroup(selector, value) {
    $$(selector).forEach(chip => {
      const v = chip.dataset.rating || chip.dataset.mood;
      chip.classList.toggle('is-selected', value && v === value);
    });
  }

  function currentEditorDraft() {
    const title = $('#editorTitle').value.trim();
    const body = $('#editorBody').value.trim();
    const tags = toTags($('#editorTags').value);
    const projectId = $('#editorProject').value || null;

    const existing = state.editorEntry || {};
    return {
      ...existing,
      title: title || (existing.title || ''),
      body,
      tags,
      mode: state.editorMode,
      projectId: state.editorMode === 'project' ? projectId : null,
      rating: state.editorMode === 'thinking' ? null : (existing.rating || null),
      mood: existing.mood || null,
      pinned: !!existing.pinned,
      starred: !!existing.starred,
      attachments: existing.attachments || [],
      createdAt: existing.createdAt || nowISO(),
      updatedAt: nowISO()
    };
  }

  async function saveEditor() {
    const draft = currentEditorDraft();
    if (!draft.body) {
      toast('Body is empty.');
      return;
    }
    if (!draft.id) draft.id = uid('e');

    await DioneDB.put(DioneDB.STORES.entries, draft);
    toast('Saved');

    closeEditor();
    await refreshAll();
  }

  async function deleteEditor() {
    if (!state.editorEntry?.id) return;
    if (!confirm('Delete this entry?')) return;
    await DioneDB.del(DioneDB.STORES.entries, state.editorEntry.id);
    toast('Deleted');
    closeEditor();
    await refreshAll();
  }

  async function togglePinEditor() {
    if (!state.editorEntry?.id) return;
    state.editorEntry.pinned = !state.editorEntry.pinned;
    $('#btnEditorPin').textContent = state.editorEntry.pinned ? 'UNPIN' : 'PIN';
    await DioneDB.put(DioneDB.STORES.entries, { ...state.editorEntry, updatedAt: nowISO() });
    toast(state.editorEntry.pinned ? 'Pinned' : 'Unpinned');
    await refreshAll();
  }

  async function toggleStarEditor() {
    if (!state.editorEntry?.id) return;
    state.editorEntry.starred = !state.editorEntry.starred;
    $('#btnEditorStar').textContent = state.editorEntry.starred ? 'UNSTAR' : 'STAR';
    await DioneDB.put(DioneDB.STORES.entries, { ...state.editorEntry, updatedAt: nowISO() });
    toast(state.editorEntry.starred ? 'Starred' : 'Unstarred');
    await refreshAll();
  }

  function exportJSONFile(data, filename='dione-os-export.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportTextFile(text, filename='note.md') {
    const blob = new Blob([text], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function doExportAll() {
    const data = await DioneDB.exportAll();
    exportJSONFile(data, `dione-os-export-${new Date().toISOString().slice(0,10)}.json`);
  }

  async function doImportFile(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    await DioneDB.importAll(payload);
    toast('Imported');
    await refreshAll();
  }

  function renderAttachments(list) {
    const wrap = $('#attachmentsList');
    wrap.innerHTML = '';
    if (!list.length) return;
    for (let i=0; i<list.length; i++) {
      const a = list[i];
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const url = URL.createObjectURL(a.blob);
      thumb.innerHTML = `<img alt="Attachment" src="${url}" /><button type="button" data-idx="${i}" aria-label="Remove attachment">×</button>`;
      wrap.appendChild(thumb);
    }
  }

  async function addAttachment(file) {
    if (!state.editorEntry) {
      // create a temp entry object for new drafts
      state.editorEntry = currentEditorDraft();
      state.editorEntry.id = state.editorEntry.id || uid('e');
    }
    const blob = file.slice(0, file.size, file.type);
    const hash = await hashBlob(blob);
    const att = { id: uid('a'), name: file.name, type: file.type, size: file.size, hash, blob };
    state.editorEntry.attachments = state.editorEntry.attachments || [];
    state.editorEntry.attachments.push(att);

    renderAttachments(state.editorEntry.attachments);
    toast('Attached');
  }

  async function hashBlob(blob) {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function removeAttachment(idx) {
    if (!state.editorEntry?.attachments) return;
    state.editorEntry.attachments.splice(idx, 1);
    renderAttachments(state.editorEntry.attachments);
  }

  async function quickCapture(kind) {
    closeSheet();
    const tagMap = {
      idea: ['#idea'],
      expense: ['#expense'],
      coffee: ['#coffee'],
      quote: ['#quote'],
      reminder: ['#reminder'],
      blank: []
    };

    const baseEntry = {
      id: uid('e'),
      mode: 'daily',
      projectId: null,
      title: '',
      body: '',
      tags: tagMap[kind] || [],
      rating: null,
      mood: null,
      attachments: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
      pinned: false,
      starred: false
    };

    openEditor(baseEntry, 'daily', null);
    $('#editorTags').value = (baseEntry.tags || []).join(' ');
    $('#editorBody').focus();
  }

  async function dailySave() {
    const body = $('#dailyBody').value.trim();
    if (!body) { toast('Write something.'); return; }

    const tags = toTags($('#dailyTags').value);
    const mood = state.selectedMood || null;

    const sleepHours = $('#toggleSleep').checked ? Number($('#sleepHours').value || 0) : null;
    const coffeeCount = $('#toggleCoffee').checked ? Number($('#coffeeCount').value || 0) : null;

    const entry = {
      id: uid('e'),
      mode: 'daily',
      projectId: null,
      title: '',
      body,
      tags,
      rating: null,
      mood,
      attachments: [],
      sleepHours,
      coffeeCount,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      pinned: false,
      starred: false
    };

    await DioneDB.put(DioneDB.STORES.entries, entry);

    // reset composer
    $('#dailyBody').value = '';
    $('#dailyTags').value = '';
    state.selectedMood = null;
    selectChipGroup('[data-mood]', null);
    $('#toggleSleep').checked = false;
    $('#toggleCoffee').checked = false;
    $('#sleepHours').value = '';
    $('#coffeeCount').value = '';
    $('#sleepHours').disabled = true;
    $('#coffeeCount').disabled = true;

    toast('Saved');
    await loadDailyTimeline();
  }

  async function refreshAll() {
    await loadProjects();
    await loadDailyTimeline();
    await loadThinkingList();
    await runSearch();
    // If project detail open, refresh it
    const openProjectId = $('#projectDetail').dataset.projectId;
    if (openProjectId) await openProject(openProjectId);
  }

  async function openEntryById(id) {
    const e = await DioneDB.get(DioneDB.STORES.entries, id);
    if (!e) return;
    openEditor(e, e.mode, e.projectId || null);
  }

  async function togglePinQuick(id) {
    const e = await DioneDB.get(DioneDB.STORES.entries, id);
    if (!e) return;
    e.pinned = !e.pinned;
    e.updatedAt = nowISO();
    await DioneDB.put(DioneDB.STORES.entries, e);
    toast(e.pinned ? 'Pinned' : 'Unpinned');
    await refreshAll();
  }

  async function toggleStarQuick(id) {
    const e = await DioneDB.get(DioneDB.STORES.entries, id);
    if (!e) return;
    e.starred = !e.starred;
    e.updatedAt = nowISO();
    await DioneDB.put(DioneDB.STORES.entries, e);
    toast(e.starred ? 'Starred' : 'Unstarred');
    await refreshAll();
  }

  async function runSearch() {
    const q = ($('#searchQuery').value || '').trim().toLowerCase();
    const tag = ($('#filterTag').value || '').trim().toLowerCase();
    const mode = $('#filterMode').value;
    const projectId = $('#filterProject').value;
    const pinned = $('#filterPinned').checked;
    const starred = $('#filterStarred').checked;

    let entries = await DioneDB.getAll(DioneDB.STORES.entries);
    entries.sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    entries = entries.filter(e => {
      if (mode && e.mode !== mode) return false;
      if (projectId && e.projectId !== projectId) return false;
      if (pinned && !e.pinned) return false;
      if (starred && !e.starred) return false;
      if (tag && !(e.tags || []).includes(tag.startsWith('#') ? tag : `#${tag}`)) return false;
      if (q) {
        const hay = `${e.title||''}\n${e.body||''}\n${(e.tags||[]).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const list = $('#searchResults');
    list.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'item';
      empty.innerHTML = `<div class="item__title">No results</div><div class="item__meta">Try another keyword or filter.</div>`;
      list.appendChild(empty);
      return;
    }

    for (const e of entries.slice(0, 80)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'item';
      item.dataset.entryId = e.id;
      item.innerHTML = `
        <div class="item__title">${escapeHTML(e.title || (e.mode === 'daily' ? 'Daily entry' : 'Untitled'))}</div>
        <div class="item__meta">${escapeHTML(formatDay(e.createdAt))} • ${escapeHTML(e.mode)}
          ${e.projectId ? ` • ${escapeHTML(e.projectId)}` : ''}</div>
      `;
      list.appendChild(item);
    }
  }

  function bindEvents() {
    // Tabs
    $$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

    // FAB / sheet
    $('#fab').addEventListener('click', openSheet);
    $('#btnCloseSheet').addEventListener('click', closeSheet);
    $('#sheetBackdrop').addEventListener('click', closeSheet);

    $$('#captureSheet [data-capture]').forEach(btn => {
      btn.addEventListener('click', () => quickCapture(btn.dataset.capture));
    });

    // Daily mood select
    $$('#dailyComposer [data-mood]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.selectedMood = chip.dataset.mood;
        selectChipGroup('#dailyComposer [data-mood]', state.selectedMood);
      });
    });

    $('#btnMoodStamp').addEventListener('click', () => {
      if (!state.selectedMood) toast('Pick a mood first.');
      else toast(`Mood: ${state.selectedMood.toUpperCase()}`);
    });

    $('#toggleSleep').addEventListener('change', (e) => {
      $('#sleepHours').disabled = !e.target.checked;
      if (!e.target.checked) $('#sleepHours').value = '';
    });
    $('#toggleCoffee').addEventListener('change', (e) => {
      $('#coffeeCount').disabled = !e.target.checked;
      if (!e.target.checked) $('#coffeeCount').value = '';
    });

    $('#btnDailySave').addEventListener('click', dailySave);

    // Project open
    $('#projectGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.project-card');
      if (!card) return;
      openProject(card.dataset.projectId);
    });

    $('#btnBackProjects').addEventListener('click', closeProject);
    $('#btnNewProjectEntry').addEventListener('click', () => {
      const projectId = $('#projectDetail').dataset.projectId;
      const entry = {
        id: uid('e'),
        mode: 'project',
        projectId,
        title: '',
        body: '',
        tags: [],
        rating: null,
        mood: null,
        attachments: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
        pinned: false,
        starred: false
      };
      openEditor(entry, 'project', projectId);
    });

    // Thinking
    $('#btnNewThinking').addEventListener('click', () => {
      const entry = {
        id: uid('e'),
        mode: 'thinking',
        projectId: null,
        title: '',
        body: '',
        tags: ['#thinking'],
        rating: null,
        mood: null,
        attachments: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
        pinned: false,
        starred: false
      };
      openEditor(entry, 'thinking', null);
      $('#editorTags').value = '#thinking';
    });

    $('#btnFocusToggle').addEventListener('click', () => {
      const on = document.body.classList.toggle('is-focus');
      $('#btnFocusToggle').setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? 'Focus on' : 'Focus off');
    });

    // Prompt Pack
    $('#btnPrompts').addEventListener('click', openPromptModal);
    $('#btnPromptClose').addEventListener('click', closePromptModal);
    $('#btnPromptCopyAll').addEventListener('click', () => {
      const all = PROMPT_PACK.map(p => `${p.title}\n${p.text}`).join('\n\n---\n\n');
      copyText(all);
    });


    // Lists open entry
    $('#dailyTimeline').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-action]');
      const entryCard = e.target.closest('.entry');
      if (!entryCard) return;
      const id = entryCard.dataset.entryId;
      if (act) {
        if (act.dataset.action === 'open') return openEntryById(id);
        if (act.dataset.action === 'pin') return togglePinQuick(id);
        if (act.dataset.action === 'star') return toggleStarQuick(id);
      }
      if (e.target.closest('.btn')) return; // buttons handled above
      openEntryById(id);
    });

    $('#projectEntryList').addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item?.dataset.entryId) return;
      openEntryById(item.dataset.entryId);
    });

    $('#thinkingList').addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item?.dataset.entryId) return;
      openEntryById(item.dataset.entryId);
    });

    $('#searchResults').addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item?.dataset.entryId) return;
      openEntryById(item.dataset.entryId);
    });

    // Editor modal
    $('#btnEditorClose').addEventListener('click', closeEditor);
    $('#modalBackdrop').addEventListener('click', () => {
      const promptOpen = !$('#promptModal').classList.contains('hidden');
      if (promptOpen) return closePromptModal();
      return closeEditor();
    });
    $('#btnEditorSave').addEventListener('click', saveEditor);
    $('#btnEditorDelete').addEventListener('click', deleteEditor);
    $('#btnEditorPin').addEventListener('click', togglePinEditor);
    $('#btnEditorStar').addEventListener('click', toggleStarEditor);

    // Rating chips (editor)
    $$('#ratingRow [data-rating]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!state.editorEntry) state.editorEntry = currentEditorDraft();
        state.editorEntry.rating = chip.dataset.rating;
        selectChipGroup('[data-rating]', state.editorEntry.rating);
      });
    });

    // Mood chips (editor)
    $$('#editorModal [data-mood]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!state.editorEntry) state.editorEntry = currentEditorDraft();
        state.editorEntry.mood = chip.dataset.mood;
        selectChipGroup('#editorModal [data-mood]', state.editorEntry.mood);
      });
    });

    // Attachments
    $('#attachInput').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await addAttachment(file);
      e.target.value = '';
    });

    $('#attachmentsList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      removeAttachment(Number(btn.dataset.idx));
    });

    // Thinking preview
    $('#btnTogglePreview').addEventListener('click', () => {
      state.previewOn = !state.previewOn;
      $('#btnTogglePreview').setAttribute('aria-pressed', state.previewOn ? 'true' : 'false');
      $('#btnTogglePreview').textContent = state.previewOn ? 'HIDE' : 'SHOW';
      const body = $('#editorBody').value || '';
      $('#thinkingPreview').innerHTML = state.previewOn ? mdLight(body) : '';
    });

    // Export single
    $('#btnEditorExportJson').addEventListener('click', () => {
      const draft = currentEditorDraft();
      exportJSONFile({ version: 1, exportedAt: nowISO(), entries:[draft], projects:[] }, `dione-os-entry-${draft.id}.json`);
    });

    $('#btnEditorExportMd').addEventListener('click', () => {
      const draft = currentEditorDraft();
      const text = `# ${draft.title || 'Untitled'}\n\n${draft.body || ''}\n\n${(draft.tags||[]).join(' ')}\n`;
      exportTextFile(text, `${(draft.title||'note').replace(/\s+/g,'-').toLowerCase()}.md`);
    });

    // Topbar export/import
    $('#btnExport').addEventListener('click', doExportAll);
    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try { await doImportFile(file); }
      catch (err) { toast(err.message || 'Import failed'); }
      e.target.value = '';
    });

    // Search
    ['input','change'].forEach(evt => {
      $('#searchQuery').addEventListener(evt, runSearch);
      $('#filterTag').addEventListener(evt, runSearch);
      $('#filterMode').addEventListener(evt, runSearch);
      $('#filterProject').addEventListener(evt, runSearch);
      $('#filterPinned').addEventListener(evt, runSearch);
      $('#filterStarred').addEventListener(evt, runSearch);
    });

    $('#btnClearSearch').addEventListener('click', () => {
      $('#searchQuery').value = '';
      $('#filterTag').value = '';
      $('#filterMode').value = '';
      $('#filterProject').value = '';
      $('#filterPinned').checked = false;
      $('#filterStarred').checked = false;
      runSearch();
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#editorModal').classList.contains('hidden')) closeEditor();
        else if (!$('#captureSheet').classList.contains('hidden')) closeSheet();
      }
    });
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('service-worker.js');
    } catch (e) {
      // silent fail
    }
  }

  async function init() {
    await ensureDefaults();
    bindEvents();
    setActiveTab('daily');
    await refreshAll();
    await registerSW();
  }

  // Start
  window.addEventListener('load', init);
})();
