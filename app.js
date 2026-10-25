'use strict';
/* مكتبة رفّ — قارئ PDF عربي مع ملاحظات وكتابة بالقلم واستخراج نص وإحصائيات. */

// ---------- Helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'textContent']);
function el(tag, props, ...kids) {
  const e = tag === 'svg' || tag === 'path' || tag === 'rect' || tag === 'text' || tag === 'line' || tag === 'g'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.setAttribute('class', v);
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
const ICONS = {
  back: 'M9 6l6 6-6 6',
  thumbs: 'M4 4h6v7H4zM14 4h6v7h-6zM4 15h6v5H4zM14 15h6v5h-6z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  pencil: 'M4 20l3-1 10-10-2-2L5 17zM15 5l2-2 4 4-2 2',
  marker: 'M9 15l-4 5h6l2-2M9 15l7-11 4 3-7 11z',
  eraser: 'M16 3l5 5-11 11H5l-2-2zM9 9l6 6',
  text: 'M5 5h14M12 5v14M8 19h8',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  translate: 'M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c-1 4-3 7-6 8M13 21l4-9 4 9M14.5 18h5',
  note: 'M5 3h11l3 3v15H5zM8 10h8M8 14h6',
  underline: 'M7 4v6a5 5 0 0010 0V4M5 20h14',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9h8M8 12h8M8 15h5',
  spread: 'M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5zM12 6.5v13',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  palette: 'M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.4 0-.9.7-1.5 1.6-1.5H17a4 4 0 004-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  type: 'M3 7h18M3 12h18M3 17h10',
  clear: 'M5 5l14 14M4 12a8 8 0 1016 0 8 8 0 10-16 0',
};
function icon(name, extra) {
  const s = el('svg', { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', style: extra || null });
  s.append(el('path', { d: ICONS[name] }));
  if (name === 'more') s.style.strokeWidth = '3.2';
  return s;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nf = new Intl.NumberFormat('ar-u-nu-latn');
const fmt = (n) => nf.format(Math.round(n));
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const later = new Map();
function saveLater(key, fn, ms = 500) {
  const prev = later.get(key); if (prev) clearTimeout(prev.t);
  later.set(key, { fn, t: setTimeout(() => { later.delete(key); fn(); }, ms) });
}
/** ينفّذ كل الحفظ المؤجَّل فورًا (عند إخفاء التطبيق أو إغلاقه). */
function flushLater() { const jobs = [...later.values()]; later.clear(); jobs.forEach((j) => { clearTimeout(j.t); j.fn(); }); }
function toast(msg, action) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: 'toast', role: 'status' }, msg,
    action ? el('button', { class: 'toast-act', onclick: () => { t.remove(); action.fn(); } }, action.label) : null);
  document.body.append(t);
  setTimeout(() => t.remove(), action ? 7000 : 2600);
}
const isArabic = (s) => (s.match(/[؀-ۿ]/g) || []).length > s.replace(/\s/g, '').length * 0.3;

// ---------- Claude runtime capabilities (optional) ----------
const caps = {};
function cap(name) {
  if (!(name in caps)) caps[name] = (window.claude && window.claude.use) ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  return caps[name];
}

// ---------- Storage ----------
// داخل Claude تُحفظ البيانات في حسابك (قاعدة بيانات التطبيق وملفاته)، فتبقى بعد إغلاق التطبيق وتظهر على أجهزتك الأخرى.
// خارج Claude تُحفظ في IndexedDB في هذا المتصفح فقط. ملفات PDF تُنسخ دائمًا في IndexedDB لتُفتح بسرعة.
const STORES = ['books', 'files', 'notes', 'marks', 'ink', 'ocr', 'daily', 'meta', 'shelves'];
const MAX_ASSET = 20 * 1024 * 1024;
const Local = {
  db: null, ok: true, mem: new Map(),
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('raff-library', 2);
        r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      });
    } catch (e) { this.ok = false; }
  },
  m(s) { if (!this.mem.has(s)) this.mem.set(s, new Map()); return this.mem.get(s); },
  req(s, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(s, mode); const r = fn(t.objectStore(s));
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  async get(s, k) { if (!this.ok) return this.m(s).get(k); try { return await this.req(s, 'readonly', (st) => st.get(k)); } catch { return undefined; } },
  async all(s) { if (!this.ok) return [...this.m(s).values()]; try { return await this.req(s, 'readonly', (st) => st.getAll()); } catch { return []; } },
  async keys(s) { if (!this.ok) return [...this.m(s).keys()]; try { return await this.req(s, 'readonly', (st) => st.getAllKeys()); } catch { return []; } },
  async put(s, k, v) { if (!this.ok) { this.m(s).set(k, v); return; } await this.req(s, 'readwrite', (st) => st.put(v, k)); },
  async del(s, k) { if (!this.ok) { this.m(s).delete(k); return; } await this.req(s, 'readwrite', (st) => st.delete(k)); },
};
const Cloud = {
  ok: false, base: null, latest: new Map(), running: new Map(),
  async init() {
    try {
      const [db, user] = await Promise.all([cap('db'), cap('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      this.base = db.doc(`data/users/${id}/raff`);
      await this.base.collection('meta').doc('settings').get();
      this.ok = true;
    } catch (e) { console.warn('cloud storage unavailable', e); this.ok = false; }
    return this.ok;
  },
  ref(s, k) { return this.base.collection(s).doc(String(k)); },
  enc(v) { return JSON.parse(JSON.stringify(Array.isArray(v) ? { isList: true, list: v } : v)); },
  dec(d) { return d && d.isList ? d.list : d; },
  async get(s, k) { const d = await this.ref(s, k).get(); return d.exists ? this.dec(d.data()) : undefined; },
  async all(s) { const q = await this.base.collection(s).get(); return q.docs.map((d) => this.dec(d.data())); },
  async keys(s) { const q = await this.base.collection(s).get(); return q.docs.map((d) => d.id); },
  put(s, k, v) { const body = this.enc(v); return this.queue(`${s}/${k}`, () => this.ref(s, k).set(body)); },
  del(s, k) { return this.queue(`${s}/${k}`, () => this.ref(s, k).delete()); },
  // كتابة واحدة في كل مرة لكل مستند، ويُكتفى بآخر قيمة إن تراكمت التعديلات.
  queue(key, job) {
    this.latest.set(key, job);
    if (this.running.has(key)) return this.running.get(key);
    const p = (async () => {
      try {
        while (this.latest.has(key)) {
          const j = this.latest.get(key); this.latest.delete(key);
          try { await j(); } catch (e) {
            if (e?.code !== 'unavailable') throw e;
            await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
            await j();
          }
        }
      } finally { this.running.delete(key); }
    })();
    this.running.set(key, p);
    return p;
  },
};
// كتابة القلم تُضغط في نص قصير حتى تتسع الصفحة الواحدة لآلاف النقاط.
const packInk = (strokes) => (strokes || []).map((k) => ({ t: k.t, c: k.c, w: k.w, d: k.p.map(([x, y, p]) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(p * 100)}`).join(' ') }));
const unpackInk = (list) => (list || []).map((k) => typeof k.d !== 'string' ? k
  : { t: k.t, c: k.c, w: k.w, p: k.d ? k.d.split(' ').map((q) => { const [x, y, p] = q.split(',').map(Number); return [x / 1e4, y / 1e4, p / 100]; }) : [] });
const Store = {
  pending: 0,
  be(s) { return s === 'files' || !Cloud.ok ? Local : Cloud; },
  async get(s, k) { try { const v = await this.be(s).get(s, k); return s === 'ink' && v ? unpackInk(v) : v; } catch { return undefined; } },
  async all(s) { try { return await this.be(s).all(s); } catch { return []; } },
  async keys(s) { try { return await this.be(s).keys(s); } catch { return []; } },
  put(s, k, v, quiet) { if (s === 'ink' && Cloud.ok) v = packInk(v); return this.write(() => this.be(s).put(s, k, v), quiet); },
  del(s, k, quiet) { return this.write(() => this.be(s).del(s, k), quiet); },
  async write(fn, quiet) {
    if (!quiet) { this.pending++; setSaveState('saving'); }
    try { await fn(); } catch (e) {
      console.error(e);
      toast(e?.code === 'quota_exceeded' ? 'امتلأت مساحة الحفظ في حسابك. احذف كتبًا أو ملاحظات لا تحتاجها.'
        : e?.code === 'invalid_argument' ? 'هذه الصفحة أكبر من أن تُحفظ دفعة واحدة. وزّع الكتابة على صفحة جديدة.'
        : 'تعذّر الحفظ. تحقّق من الاتصال بالإنترنت.');
    } finally { if (!quiet) { this.pending--; if (!this.pending) setSaveState('saved'); } }
  },
};
function setSaveState(st) {
  const n = $('#saveState'); if (!n) return;
  n.dataset.state = st;
  const where = Cloud.ok ? 'في حسابك' : Local.ok ? 'على هذا الجهاز' : '';
  if (!where) n.textContent = 'الحفظ مؤقت: التخزين غير متاح';
  else n.textContent = st === 'saving' ? 'جارٍ الحفظ…' : `حُفظ ${where} ${new Date().toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------- App state ----------
const DEFAULTS = {
  translateTo: 'en', ocrEngine: 'local', penOnly: true, readSize: 22, seeded: false,
  pen: { tool: 'pen', color: '#1C2220', width: 3 }, lastColor: 'yellow', claudeKey: '', noKeyTranslator: 'claude',
  shelf: 'all', allTheme: 'walnut', skin: 'auto', pageMode: 'auto', turnAnim: 'curl',
};
const S = { books: [], shelves: [], notes: [], marks: [], customize: false, daily: {}, settings: structuredClone(DEFAULTS), view: 'library', noteId: null, notesTab: 'notebook', noteMode: 'type', noteQuery: '' };
const bus = new EventTarget();
const changed = (topic) => bus.dispatchEvent(new CustomEvent('change', { detail: topic }));
const saveSettings = () => Store.put('meta', 'settings', S.settings);
const saveBook = (b, quiet) => saveLater('book:' + b.id, () => Store.put('books', b.id, b, quiet), 400);
// كتابة القلم في الدفتر تُحفظ في مستندات منفصلة لكل صفحة، والملاحظة نفسها تحمل النص فقط.
const noteForSave = (n) => ({ ...n, pages: n.pages.map(({ strokes, ...p }) => p) });
const saveNote = (n) => saveLater('note:' + n.id, () => Store.put('notes', n.id, noteForSave(n)), 500);
const saveNoteInk = (pg) => saveLater('ink:np:' + pg.id, () => Store.put('ink', 'np:' + pg.id, pg.strokes || []), 300);
const saveDaily = (d) => saveLater('daily:' + d.date, () => Store.put('daily', d.date, d, true), 15000);
function todayRec() { const k = dayKey(); return (S.daily[k] ||= { date: k, sec: 0, pages: [], books: {} }); }

// ---------- PDF ----------
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', location.href).href;
async function renderToCanvas(pdf, n, width, canvas) {
  const page = await pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  canvas = canvas || document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}
async function addBook(file, title) {
  const buf = await file.arrayBuffer();
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise; } catch { toast(`«${file.name}» ليس ملف PDF صالحًا.`); return; }
  const c = await renderToCanvas(pdf, 1, 360);
  const dir = await detectDir(pdf);
  const book = {
    id: uid(), title: title || file.name.replace(/\.pdf$/i, ''), pages: pdf.numPages, cover: c.toDataURL('image/jpeg', 0.8),
    added: Date.now(), lastOpened: 0, lastPage: 1, seen: [], bookmarks: [], secs: 0, size: buf.byteLength, dir,
    shelf: S.settings.shelf !== 'all' && S.shelves.some((x) => x.id === S.settings.shelf) ? S.settings.shelf : null,
  };
  pdf.destroy();
  S.books.push(book);
  changed('books');
  await Store.write(() => storeBookFile(book, buf));
  await Store.put('books', book.id, book);
  changed('books');
  return book;
}
/** ينسخ الملف في هذا الجهاز، ويرفعه إلى حسابك إن كان 20 م.ب أو أقل. */
async function storeBookFile(book, buf) {
  await Local.put('files', book.id, buf);
  book.localOnly = true;
  if (!Cloud.ok) return;
  if (buf.byteLength > MAX_ASSET) { toast(`«${book.title}» أكبر من 20 م.ب، فحُفظ ملفه على هذا الجهاز فقط.`); return; }
  const assets = await cap('assets');
  if (!assets) return;
  try {
    const r = await assets.upload(new Blob([buf], { type: 'application/pdf' }), { type: 'application/pdf' });
    book.assetId = r.id; book.localOnly = false;
  } catch (e) {
    console.error(e);
    toast(`تعذّر رفع «${book.title}» إلى حسابك، فحُفظ على هذا الجهاز فقط.`);
  }
}
async function loadBookFile(book) {
  const cached = await Local.get('files', book.id);
  if (cached) return cached;
  if (!book.assetId) return null;
  try {
    const res = await fetch('/_blob/' + book.assetId);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    Local.put('files', book.id, buf.slice(0)).catch(() => {});
    return buf;
  } catch { return null; }
}
async function deleteBook(id) {
  const book = S.books.find((b) => b.id === id);
  if (book?.assetId) cap('assets').then((a) => a?.delete(book.assetId)).catch(() => {});
  S.books = S.books.filter((b) => b.id !== id);
  const gone = S.marks.filter((m) => m.bookId === id);
  S.marks = S.marks.filter((m) => m.bookId !== id);
  await Store.del('books', id); await Local.del('files', id).catch(() => {});
  for (const m of gone) await Store.del('marks', m.id);
  for (const s of ['ink', 'ocr']) for (const k of await Store.keys(s)) if (String(k).startsWith(id + ':')) await Store.del(s, k);
  changed('books');
}

// ---------- Ink (Apple Pencil) ----------
class Ink {
  constructor(host, { onCommit, onStart, blend } = {}) {
    this.host = host; host.classList.add('ink-layer');
    if (blend === false) host.style.mixBlendMode = 'normal';
    this.base = el('canvas'); this.live = el('canvas'); host.append(this.base, this.live);
    this.strokes = []; this.undoS = []; this.redoS = []; this.enabled = false; this.w = 0; this.h = 0; this.dpr = 1;
    this.onCommit = onCommit; this.onStart = onStart;
    host.addEventListener('pointerdown', (e) => this.down(e));
    host.addEventListener('pointermove', (e) => this.move(e));
    host.addEventListener('pointerup', (e) => this.up(e));
    host.addEventListener('pointercancel', (e) => this.up(e));
    host.addEventListener('touchmove', (e) => { if (this.pid != null) e.preventDefault(); }, { passive: false });
  }
  setEnabled(b) { this.enabled = b; this.host.classList.toggle('active', b); }
  load(strokes) { this.strokes = strokes || []; this.undoS = []; this.redoS = []; this.draw(); }
  resize() {
    const r = this.host.getBoundingClientRect(); if (!r.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.w = r.width; this.h = r.height;
    for (const c of [this.base, this.live]) { c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr); }
    this.draw();
  }
  pt(e) {
    const r = this.host.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, p];
  }
  down(e) {
    if (!this.enabled || e.button > 0) return;
    if (e.pointerType === 'touch' && S.settings.penOnly) return; // رفض راحة اليد: الإصبع لا يرسم
    e.preventDefault(); e.stopPropagation();
    try { this.host.setPointerCapture(e.pointerId); } catch {}
    this.pid = e.pointerId; if (!this.w) this.resize();
    this.onStart && this.onStart(this);
    const p = S.settings.pen;
    if (p.tool === 'eraser') { this.erasing = []; this.eraseAt(this.pt(e)); return; }
    this.cur = { t: p.tool, c: p.color, w: p.width, p: [this.pt(e)] };
    this.drawLive();
  }
  move(e) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault(); e.stopPropagation();
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of evs.length ? evs : [e]) { const q = this.pt(ev); if (this.erasing) this.eraseAt(q); else if (this.cur) this.cur.p.push(q); }
    if (this.cur) this.drawLive();
  }
  up(e) {
    if (e.pointerId !== this.pid) return; this.pid = null;
    if (this.erasing) { if (this.erasing.length) { this.undoS.push({ type: 'erase', items: this.erasing }); this.redoS = []; this.commit(); } this.erasing = null; return; }
    if (!this.cur) return;
    const s = this.cur; this.cur = null;
    s.p = s.p.map(([x, y, p]) => [+x.toFixed(4), +y.toFixed(4), +p.toFixed(2)]);
    this.strokes.push(s); this.undoS.push({ type: 'add', stroke: s }); this.redoS = [];
    this.live.getContext('2d').clearRect(0, 0, this.live.width, this.live.height);
    this.stroke(this.base.getContext('2d'), s);
    this.commit();
  }
  eraseAt([x, y]) {
    let hit = false;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.p.some(([px, py]) => Math.hypot((px - x) * this.w, (py - y) * this.h) < 14)) { this.erasing.push({ stroke: s, index: i }); this.strokes.splice(i, 1); hit = true; }
    }
    if (hit) this.draw();
  }
  undo() {
    const op = this.undoS.pop(); if (!op) return;
    if (op.type === 'add') this.strokes.splice(this.strokes.lastIndexOf(op.stroke), 1);
    else if (op.type === 'erase') [...op.items].sort((a, b) => a.index - b.index).forEach((it) => this.strokes.splice(it.index, 0, it.stroke));
    else if (op.type === 'clear') this.strokes = op.prev.slice();
    this.redoS.push(op); this.draw(); this.commit();
  }
  redo() {
    const op = this.redoS.pop(); if (!op) return;
    if (op.type === 'add') this.strokes.push(op.stroke);
    else if (op.type === 'erase') op.items.forEach((it) => { const i = this.strokes.indexOf(it.stroke); if (i >= 0) this.strokes.splice(i, 1); });
    else if (op.type === 'clear') this.strokes = [];
    this.undoS.push(op); this.draw(); this.commit();
  }
  clear() { if (!this.strokes.length) return; this.undoS.push({ type: 'clear', prev: this.strokes.slice() }); this.strokes = []; this.redoS = []; this.draw(); this.commit(); }
  commit() { this.onCommit && this.onCommit(this.strokes); }
  draw() { const c = this.base.getContext('2d'); c.clearRect(0, 0, this.base.width, this.base.height); for (const s of this.strokes) this.stroke(c, s); }
  drawLive() { const c = this.live.getContext('2d'); c.clearRect(0, 0, this.live.width, this.live.height); this.stroke(c, this.cur); }
  stroke(ctx, s) {
    if (!this.w) return;
    const W = this.w * this.dpr, H = this.h * this.dpr, lw = s.w * (this.w / 800) * this.dpr;
    const P = s.p.map(([x, y, p]) => [x * W, y * H, p]);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
    if (s.t === 'marker') {
      ctx.globalAlpha = 0.33; ctx.lineWidth = lw * 5; ctx.lineCap = 'square';
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) { const m = [(P[i - 1][0] + P[i][0]) / 2, (P[i - 1][1] + P[i][1]) / 2]; ctx.quadraticCurveTo(P[i - 1][0], P[i - 1][1], m[0], m[1]); }
      if (P.length > 1) ctx.lineTo(P.at(-1)[0], P.at(-1)[1]); else ctx.lineTo(P[0][0] + 0.1, P[0][1]);
      ctx.stroke();
    } else {
      const k = s.t === 'pencil' ? 0.7 : 1; ctx.globalAlpha = s.t === 'pencil' ? 0.72 : 1;
      if (P.length === 1) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], lw * k * 0.6, 0, Math.PI * 2); ctx.fill(); }
      let prev = P[0], prevMid = P[0];
      for (let i = 1; i < P.length; i++) {
        const cur = P[i], mid = [(prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2];
        ctx.beginPath(); ctx.moveTo(prevMid[0], prevMid[1]); ctx.quadraticCurveTo(prev[0], prev[1], mid[0], mid[1]);
        ctx.lineWidth = Math.max(0.6, lw * k * (0.35 + ((prev[2] + cur[2]) / 2) * 1.1)); ctx.stroke();
        prevMid = mid; prev = cur;
      }
      if (P.length > 1) { ctx.beginPath(); ctx.moveTo(prevMid[0], prevMid[1]); ctx.lineTo(prev[0], prev[1]); ctx.stroke(); }
    }
    ctx.restore();
  }
}

const PEN_COLORS = ['#1C2220', '#2C6FB8', '#B3362F', '#1E6A64', '#F2C230', '#F07AA5'];
const PEN_WIDTHS = [2, 3.5, 7];
const TOOL_NAMES = { pen: 'قلم حبر', pencil: 'قلم رصاص', marker: 'قلم تظليل', eraser: 'ممحاة' };
function penBar(getInk, extra) {
  const bar = el('div', { class: 'pen-bar', role: 'toolbar', 'aria-label': 'أدوات القلم' });
  const render = () => {
    const p = S.settings.pen;
    bar.replaceChildren(
      ...Object.keys(TOOL_NAMES).map((t) => el('button', { class: 'icon-btn', title: TOOL_NAMES[t], 'aria-label': TOOL_NAMES[t], 'aria-pressed': String(p.tool === t), onclick: () => { p.tool = t; if (t === 'marker' && !['#F2C230', '#F07AA5'].includes(p.color)) p.color = '#F2C230'; saveSettings(); render(); } }, icon(t))),
      el('span', { class: 'sep' }),
      ...PEN_COLORS.map((c) => el('button', { class: 'swatch', style: `background:${c}`, 'aria-label': 'لون', 'aria-pressed': String(p.color === c), onclick: () => { p.color = c; if (p.tool === 'eraser') p.tool = 'pen'; saveSettings(); render(); } })),
      el('span', { class: 'sep' }),
      ...PEN_WIDTHS.map((w) => el('button', { class: 'width-dot', 'aria-label': 'السماكة', 'aria-pressed': String(p.width === w), onclick: () => { p.width = w; saveSettings(); render(); } }, el('i', { style: `width:${w * 2 + 2}px;height:${w * 2 + 2}px` }))),
      el('span', { class: 'sep' }),
      el('button', { class: 'icon-btn', title: 'تراجع', 'aria-label': 'تراجع', onclick: () => getInk()?.undo() }, icon('undo')),
      el('button', { class: 'icon-btn', title: 'إعادة', 'aria-label': 'إعادة', onclick: () => getInk()?.redo() }, icon('redo')),
      el('button', { class: 'icon-btn', title: 'مسح الصفحة', 'aria-label': 'مسح الصفحة', onclick: () => { getInk()?.clear(); toast('مُسحت الكتابة. اضغط «تراجع» لاستعادتها.'); } }, icon('clear')),
      el('button', { class: 'toggle-chip', 'aria-pressed': String(S.settings.penOnly), title: 'عند التفعيل لا يرسم إلا Apple Pencil، والإصبع يقلب الصفحات', onclick: () => { S.settings.penOnly = !S.settings.penOnly; saveSettings(); render(); } }, 'القلم فقط'),
      ...(extra ? [extra] : []),
    );
  };
  render();
  return bar;
}

// ---------- Rail / views ----------
const main = $('#main');
document.querySelectorAll('.rail-btn').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
function showView(v) {
  S.view = v;
  document.querySelectorAll('.rail-btn').forEach((b) => b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false'));
  ({ library: renderLibrary, notes: renderNotes, stats: renderStats, settings: renderSettings })[v]();
}
bus.addEventListener('change', debounce((e) => {
  if ($('#reader').hidden === false && S.view !== 'stats') return;
  if (S.view === 'stats') renderStats();
  else if (S.view === 'library' && ['books', 'pages'].includes(e.detail)) renderLibrary();
}, 120));

// ---------- Shelves and themes ----------
const SHELF_THEMES = {
  walnut: { name: 'جوز', back: '#E6DED3', hi: '#8A6142', board: '#5B3F2C', lo: '#3B281B', ink: '#2A1F17', grain: true },
  oak: { name: 'بلوط', back: '#EFE5D2', hi: '#CDA66C', board: '#A67C45', lo: '#76552C', ink: '#2B2116', grain: true },
  maple: { name: 'قيقب فاتح', back: '#F7F2E8', hi: '#EBD3A8', board: '#D6B582', lo: '#B08F5A', ink: '#2B2116', grain: true },
  ebony: { name: 'أبنوس', back: '#2B2624', hi: '#5A4C43', board: '#2E2420', lo: '#120D0B', ink: '#EEE7DE', grain: true },
  green: { name: 'مكتبة خضراء', back: '#1F4A43', hi: '#9A7550', board: '#6B4A30', lo: '#3E2A1D', ink: '#EAF2EE', grain: true },
  white: { name: 'أبيض حديث', back: '#F3F4F2', hi: '#FFFFFF', board: '#DEE1DC', lo: '#B9BDB6', ink: '#1C2220', grain: false },
  classic: { name: 'مكتبة خشبية تقليدية', back: '#2E1B10', hi: '#B07A48', board: '#7A4A26', lo: '#2A170C', ink: '#F4E7D2', grain: false, classic: true },
  glass: { name: 'زجاج', back: '#E3EEEE', hi: 'rgba(255,255,255,.95)', board: 'rgba(186,212,211,.9)', lo: 'rgba(110,150,150,.75)', ink: '#1C2A28', grain: false },
};
const SKINS = [['auto', 'تلقائي'], ['light', 'فاتح'], ['sepia', 'ورقي'], ['dark', 'داكن']];
function shelfVars(key) {
  const t = SHELF_THEMES[key] || SHELF_THEMES.walnut;
  return `--sh-back:${t.back};--sh-hi:${t.hi};--sh-board:${t.board};--sh-lo:${t.lo};--sh-ink:${t.ink};--sh-grain:${t.grain ? 'var(--grain)' : 'none'}`;
}
const shelfCls = (key) => SHELF_THEMES[key]?.classic ? ' classic' : '';
// Procedural wood grain for the classic bookcase: drawn once, exposed as --wood-h / --wood-v.
function woodTexture() {
  const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const G = 32, grid = Array.from({ length: G * G }, rnd);
  const lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => { // tileable value noise, x,y in grid units
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi), at = (i, j) => grid[((j % G + G) % G) * G + ((i % G + G) % G)];
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), xf), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
  };
  const fine = new Float32Array(H).map(() => rnd());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const warp = noise(x / 64, y / 32) * 6 + noise(x / 16, y / 8) * 0.8;
    const ring = Math.sin((y / 256) * 2 * Math.PI * 9 + warp * 2.2) * 0.5 + 0.5;
    const streak = fine[(y + Math.round(noise(x / 40, y / 20) * 10)) % H];
    const v = 0.72 + ring * 0.22 + (streak - 0.5) * 0.12 + (noise(x / 4, y) - 0.5) * 0.05;
    const i = (y * W + x) * 4;
    d[i] = 128 * v; d[i + 1] = 78 * v; d[i + 2] = 42 * v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rot = document.createElement('canvas'); rot.width = H; rot.height = W;
  const r = rot.getContext('2d'); r.translate(H, 0); r.rotate(Math.PI / 2); r.drawImage(cv, 0, 0);
  const root = document.documentElement.style;
  root.setProperty('--wood-h', `url(${cv.toDataURL('image/jpeg', 0.82)})`);
  root.setProperty('--wood-v', `url(${rot.toDataURL('image/jpeg', 0.82)})`);
}
function applySkin() {
  const k = S.settings.skin;
  if (k && k !== 'auto') document.documentElement.dataset.skin = k;
  else delete document.documentElement.dataset.skin;
}
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const currentShelf = () => S.shelves.find((x) => x.id === S.settings.shelf) || null;
const shelfBooks = (id) => S.books.filter((b) => b.shelf === id);
function selectShelf(id) { S.settings.shelf = id; saveSettings(); S.customize = false; renderLibrary(); }
function addShelf(name) {
  const used = new Set(S.shelves.map((x) => x.theme));
  const theme = Object.keys(SHELF_THEMES).find((k) => !used.has(k)) || 'walnut';
  const sh = { id: uid(), name, theme, created: Date.now() };
  S.shelves.push(sh); Store.put('shelves', sh.id, sh);
  selectShelf(sh.id);
  toast(`أُنشئ رف «${name}». الكتب التي تضيفها الآن تذهب إليه.`);
}
function deleteShelf(sh) {
  S.shelves = S.shelves.filter((x) => x.id !== sh.id);
  Store.del('shelves', sh.id);
  for (const b of shelfBooks(sh.id)) { b.shelf = null; saveBook(b); }
  selectShelf('all');
  toast(`حُذف رف «${sh.name}». كتبه باقية في «كل الكتب».`);
}
function moveBook(b, shelfId) {
  b.shelf = shelfId; saveBook(b); closeMenu(); renderLibrary();
  const sh = S.shelves.find((x) => x.id === shelfId);
  toast(sh ? `نُقل «${b.title}» إلى رف «${sh.name}».` : `أُخرج «${b.title}» من رفّه.`);
}

// ---------- Library ----------
let openMenu = null, addingShelf = false;
const bookCount = (n) => n === 0 ? 'لا كتب' : n === 1 ? 'كتاب واحد' : n === 2 ? 'كتابان' : n <= 10 ? `${fmt(n)} كتب` : `${fmt(n)} كتابًا`;
function renderLibrary() {
  if (S.settings.shelf !== 'all' && !currentShelf()) S.settings.shelf = 'all';
  const shelf = currentShelf();
  const themeKey = shelf ? shelf.theme : S.settings.allTheme;
  const sorted = [...S.books].sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added));
  const books = shelf ? sorted.filter((b) => b.shelf === shelf.id) : sorted;

  const chip = (id, name, n, theme) => el('button', { class: 'shelf-chip', role: 'tab', 'aria-selected': String(S.settings.shelf === id), onclick: () => selectShelf(id) },
    el('i', { class: 'sw' + shelfCls(theme), style: shelfVars(theme) }), name, el('span', { class: 'n num' }, fmt(n)));
  const tabs = el('div', { class: 'shelf-tabs', role: 'tablist', 'aria-label': 'الرفوف' },
    chip('all', 'كل الكتب', S.books.length, S.settings.allTheme),
    ...S.shelves.map((x) => chip(x.id, x.name, shelfBooks(x.id).length, x.theme)));
  if (addingShelf) {
    const inp = el('input', { class: 'input shelf-name-in', placeholder: 'اسم الرف، مثل: دراسة', 'aria-label': 'اسم الرف الجديد', id: 'newShelfName' });
    const done = () => { const v = inp.value.trim(); addingShelf = false; if (v) addShelf(v); else renderLibrary(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { addingShelf = false; renderLibrary(); } });
    tabs.append(inp, el('button', { class: 'btn primary', onclick: done }, 'إنشاء'));
    setTimeout(() => inp.focus(), 0);
  } else {
    tabs.append(el('button', { class: 'shelf-chip add', onclick: () => { addingShelf = true; renderLibrary(); } }, icon('plus'), 'رف جديد'));
  }

  const view = el('div', { class: 'view' }, el('div', { class: 'view-inner' },
    el('div', { class: 'view-head' },
      el('div', {}, el('h1', {}, shelf ? shelf.name : 'المكتبة'), el('div', { class: 'sub' }, `${bookCount(books.length)} على ${shelf ? 'هذا الرف' : 'الرفوف'}`)),
      el('div', { class: 'row' },
        el('button', { class: 'btn', 'aria-pressed': String(S.customize), onclick: () => { S.customize = !S.customize; renderLibrary(); } }, icon('palette'), 'تخصيص'),
        el('button', { class: 'btn primary', onclick: () => $('#fileIn').click() }, icon('upload'), 'إضافة ملف PDF'))),
    Cloud.ok || isInstalled() ? null : el('div', { class: 'notice' }, 'لتثبيت «رفّ» على iPad: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية». يفتح بعدها مباشرة بملء الشاشة، ويعمل دون إنترنت، وتبقى مكتبتك محفوظة على الجهاز.'),
    tabs,
    S.customize ? customizePanel(shelf, themeKey) : null,
    books.length ? el('div', { class: 'shelf' + shelfCls(themeKey), style: shelfVars(themeKey) }, books.map(bookCard))
      : el('div', { class: 'shelf empty-shelf' + shelfCls(themeKey), style: shelfVars(themeKey) },
          el('p', {}, shelf ? 'هذا الرف فارغ. أضف ملف PDF إليه، أو انقل كتابًا من قائمة ⋯ تحت غلافه.' : 'لا توجد كتب بعد.'),
          el('button', { class: 'btn primary', onclick: () => $('#fileIn').click() }, 'إضافة ملف PDF')),
    el('div', { class: 'drop-hint' }, 'اسحب ملفات PDF إلى هنا، أو اخترها من تطبيق «الملفات» على iPad عبر زر «إضافة ملف PDF».'),
  ));
  const keep = main.querySelector('.view')?.scrollTop || 0;
  main.replaceChildren(view); view.scrollTop = keep;
}
function customizePanel(shelf, themeKey) {
  const setTheme = (k) => {
    if (shelf) { shelf.theme = k; Store.put('shelves', shelf.id, shelf); } else { S.settings.allTheme = k; saveSettings(); }
    renderLibrary();
  };
  const panel = el('div', { class: 'customize' });
  if (shelf) {
    const name = el('input', { class: 'input', value: shelf.name, 'aria-label': 'اسم الرف', id: 'shelfName' });
    name.addEventListener('change', () => { const v = name.value.trim(); if (v) { shelf.name = v; Store.put('shelves', shelf.id, shelf); renderLibrary(); } });
    panel.append(el('div', { class: 'cz-row' }, el('b', {}, 'اسم الرف'), name));
  }
  panel.append(
    el('div', { class: 'cz-row' }, el('b', {}, shelf ? 'شكل هذا الرف' : 'شكل رف «كل الكتب»'),
      el('div', { class: 'theme-grid' }, ...Object.entries(SHELF_THEMES).map(([k, t]) => el('button', { class: 'theme-opt', 'aria-pressed': String(themeKey === k), onclick: () => setTheme(k) },
        el('span', { class: 'theme-prev' + shelfCls(k), style: shelfVars(k) }, el('i'), el('i'), el('i')), t.name)))),
    el('div', { class: 'cz-row' }, el('b', {}, 'مظهر التطبيق'),
      el('div', { class: 'seg' }, ...SKINS.map(([k, l]) => el('button', { 'aria-pressed': String(S.settings.skin === k), onclick: () => { S.settings.skin = k; saveSettings(); applySkin(); renderLibrary(); } }, l)))));
  if (shelf) {
    let armed = false;
    const del = el('button', { class: 'btn ghost danger', onclick: () => {
      if (!armed) { armed = true; del.lastChild.textContent = 'اضغط مرة أخرى لحذف الرف'; setTimeout(() => { armed = false; if (del.isConnected) del.lastChild.textContent = 'حذف الرف'; }, 3000); return; }
      deleteShelf(shelf);
    } }, icon('trash'), el('span', {}, 'حذف الرف'));
    panel.append(el('div', { class: 'cz-row' }, el('span', { class: 'muted' }, 'حذف الرف لا يحذف كتبه، بل تبقى في «كل الكتب».'), del));
  }
  return panel;
}
function bookCard(b) {
  const pct = b.pages ? Math.round((b.seen.length / b.pages) * 100) : 0;
  const card = el('div', { class: 'book' });
  const more = el('button', { class: 'icon-btn more', 'aria-label': 'خيارات الكتاب', onclick: (e) => { e.stopPropagation(); toggleMenu(card, b); } }, icon('more'));
  card.append(
    el('button', { class: 'cover-btn', 'aria-label': `فتح ${b.title}`, onclick: () => openReader(b.id) }, el('img', { class: 'cover', src: b.cover, alt: '' })),
    el('div', { class: 'book-progress', title: `${pct}%` }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'book-meta' }, el('div', { class: 'book-title', title: b.title }, b.title), more),
  );
  if (b.localOnly && Cloud.ok) card.append(el('span', { class: 'local-badge', title: 'ملف هذا الكتاب محفوظ على هذا الجهاز فقط' }, 'على هذا الجهاز'));
  return card;
}
function toggleMenu(card, b) {
  if (openMenu) { const was = openMenu.parentNode === card; openMenu.remove(); openMenu = null; if (was) return; }
  const m = el('div', { class: 'menu', role: 'menu' });
  const base = () => m.replaceChildren(
    el('div', { class: 'muted', style: 'padding:6px 12px;font-size:13px' }, `${fmt(b.pages)} صفحة · ${Math.round((b.secs || 0) / 60)} دقيقة قراءة`),
    el('button', { role: 'menuitem', onclick: () => rename() }, icon('pen'), 'إعادة التسمية'),
    el('button', { role: 'menuitem', onclick: () => moveMenu() }, icon('thumbs'), 'نقل إلى رف'),
    el('button', { role: 'menuitem', onclick: () => { b.dir = b.dir === 'ltr' ? 'rtl' : 'ltr'; Store.put('books', b.id, b); closeMenu(); toast(b.dir === 'ltr' ? `«${b.title}»: التصفح من اليسار إلى اليمين.` : `«${b.title}»: التصفح من اليمين إلى اليسار.`); } },
      el('span', { class: 'dir-label', style: 'width:22px;text-align:center' }, b.dir === 'ltr' ? 'A→' : '←ع'),
      b.dir === 'ltr' ? 'اتجاه التصفح: لاتيني (يسار ← يمين)' : 'اتجاه التصفح: عربي (يمين ← يسار)'),
    el('button', { role: 'menuitem', class: 'btn danger', style: 'border:0', onclick: () => confirmDel() }, icon('trash'), 'حذف من المكتبة'),
  );
  const rename = () => {
    const inp = el('input', { class: 'input', value: b.title, 'aria-label': 'العنوان الجديد' });
    const done = () => { const v = inp.value.trim(); if (v) { b.title = v; saveBook(b); changed('books'); } closeMenu(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') closeMenu(); });
    m.replaceChildren(inp, el('button', { onclick: done }, 'حفظ'));
    setTimeout(() => inp.focus(), 0);
  };
  const moveMenu = () => m.replaceChildren(...[
    el('div', { class: 'muted', style: 'padding:6px 12px;font-size:13px' }, 'اختر الرف'),
    ...S.shelves.map((x) => el('button', { role: 'menuitemradio', 'aria-checked': String(b.shelf === x.id), onclick: () => moveBook(b, x.id) },
      el('i', { class: 'sw' + shelfCls(x.theme), style: shelfVars(x.theme) }), x.name, b.shelf === x.id ? ' ✓' : '')),
    S.shelves.length ? null : el('div', { class: 'confirm' }, 'لا توجد رفوف بعد. أنشئ رفًا من زر «رف جديد» أعلى المكتبة.'),
    b.shelf ? el('button', { onclick: () => moveBook(b, null) }, 'إخراجه من الرف') : null,
    el('button', { onclick: base }, 'رجوع'),
  ].filter(Boolean));
  const confirmDel = () => m.replaceChildren(
    el('div', { class: 'confirm' }, 'سيُحذف الكتاب مع تظليلاته وكتابة القلم عليه.'),
    el('button', { class: 'danger', style: 'color:var(--danger)', onclick: async () => { closeMenu(); await deleteBook(b.id); toast('حُذف الكتاب.'); } }, icon('trash'), 'نعم، احذف'),
    el('button', { onclick: base }, 'إلغاء'),
  );
  base(); card.append(m); openMenu = m;
}
function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.more')) closeMenu(); });

$('#fileIn').addEventListener('change', async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  await importFiles(files);
});
async function importFiles(files) {
  const pdfs = files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return;
  toast(`جارٍ إضافة ${fmt(pdfs.length)} ملف…`);
  let last;
  for (const f of pdfs) last = (await addBook(f)) || last;
  if (last) toast(pdfs.length === 1 ? `أُضيف «${last.title}» إلى الرف.` : 'أُضيفت الملفات إلى الرف.');
}
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); importFiles([...(e.dataTransfer?.files || [])]); });

// ---------- Reader ----------
// الكتاب يُعرض صفحة واحدة أو صفحتين متقابلتين. في الكتاب العربي الصفحة الفردية يمينًا والزوجية يسارًا،
// وتقليب الصفحة التالية يرفع الصفحة اليسرى ويقلبها نحو اليمين حول كعب الكتاب.
const R = { book: null, pdf: null, page: 1, mode: 'single', slots: [], activeInk: null, size: null, panel: false, pen: false, thumbs: false, drawer: false, ocrBusy: false, turning: false, filt: { type: 'all', colors: new Set() }, inkIndex: new Map(), picking: null };
const readerEl = $('#reader');
const pageKey = (n = R.page) => `${R.book.id}:${n}`;
const dprCap = () => Math.min(window.devicePixelRatio || 1, 2);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function viewMode() {
  const m = S.settings.pageMode || 'auto';
  if (m !== 'auto') return m;
  const r = R.els?.stage.getBoundingClientRect();
  return r && r.width > r.height * 1.1 && r.width >= 900 ? 'double' : 'single';
}
const stepSize = () => (R.mode === 'double' ? 2 : 1);
// اتجاه التصفح لكل كتاب: rtl للكتب العربية (الصفحة الأولى يمينًا)، وltr للكتب اللاتينية (الصفحة الأولى يسارًا)
const isLtr = () => R.book?.dir === 'ltr';
const slotX = (slot) => (slot.side === 'right' ? R.size.w : 0);
const spineHinge = (slot) => (slot.side === 'right' ? 'left' : 'right');
/** يخمّن اتجاه الكتاب من نص صفحاته الأولى؛ الكتب المصوّرة تُعدّ عربية حتى يغيّرها القارئ. */
async function detectDir(pdf) {
  let ar = 0, la = 0;
  for (let n = 1; n <= Math.min(pdf.numPages, 6); n++) {
    const tc = await pdf.getPage(n).then((p) => p.getTextContent()).catch(() => null);
    const t = tc ? tc.items.map((i) => i.str || '').join(' ') : '';
    ar += (t.match(/[\u0600-\u06FF]/g) || []).length;
    la += (t.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  }
  return la > 40 && la > ar * 1.5 ? 'ltr' : 'rtl';
}
const spreadStart = (n) => (R.mode === 'double' ? (n % 2 ? n : n - 1) : n);
const spreadPages = (start) => (R.mode === 'double' ? [start, start + 1] : [start]).filter((p) => p >= 1 && p <= R.book.pages);

async function openReader(id, page, withPanel) {
  closeMenu();
  const book = S.books.find((b) => b.id === id); if (!book) return;
  if (!(await Local.get('files', id))) toast('جارٍ تحميل الكتاب…');
  const buf = await loadBookFile(book);
  if (!buf) {
    toast(book.localOnly ? 'ملف هذا الكتاب محفوظ على الجهاز الذي أُضيف منه فقط. أضِف الملف من جديد هنا.' : 'تعذّر تحميل ملف الكتاب. تحقّق من الاتصال بالإنترنت.');
    return;
  }
  try { R.pdf = await pdfjsLib.getDocument({ data: buf }).promise; } catch { toast('تعذّر فتح الملف.'); return; }
  R.book = book; R.pen = false; R.thumbs = false; R.drawer = false; R.turning = false; R.panel = !!withPanel || R.panel;
  R.page = page || book.lastPage || 1;
  if (!book.dir) book.dir = await detectDir(R.pdf);
  book.lastOpened = Date.now(); saveBook(book);
  buildReader();
  readerEl.hidden = false;
  await buildInkIndex();
  await layout();
  afterPageChange();
}
function closeReader() {
  hideSelBar();
  readerEl.hidden = true; readerEl.replaceChildren();
  if (R.pdf) R.pdf.destroy();
  R.pdf = null; R.book = null; R.slots = []; R.activeInk = null;
  pageCache.clear(); textCache.clear();
  showView(S.view);
}
const inkInfo = (strokes) => ({ count: strokes.length, colors: [...new Set(strokes.map((k) => colorCat(k.t === 'eraser' ? '' : k.c)))] });
async function buildInkIndex() {
  R.inkIndex = new Map();
  const pre = R.book.id + ':';
  for (const k of await Store.keys('ink')) {
    if (!String(k).startsWith(pre)) continue;
    const v = await Store.get('ink', k);
    if (v && v.length) R.inkIndex.set(+String(k).slice(pre.length), inkInfo(v));
  }
}
function buildReader() {
  const b = R.book;
  R.els = {};
  const E = R.els;
  E.pageNo = el('span', { class: 'r-pageno num', dir: 'ltr' });
  E.modeBtn = el('button', { class: 'icon-btn', title: 'صفحة واحدة أو صفحتان', 'aria-label': 'عرض صفحتين', onclick: toggleMode }, icon('spread'));
  E.bmBtn = el('button', { class: 'icon-btn', title: 'علامة مرجعية', 'aria-label': 'علامة مرجعية', onclick: toggleBookmark }, icon('bookmark'));
  E.penBtn = el('button', { class: 'icon-btn', title: 'الكتابة بالقلم', 'aria-label': 'الكتابة بالقلم', onclick: () => setPen(!R.pen) }, icon('pen'));
  E.txtBtn = el('button', { class: 'icon-btn', title: 'النص المستخرج', 'aria-label': 'النص المستخرج', onclick: () => setPanel(!R.panel) }, icon('text'));
  E.thBtn = el('button', { class: 'icon-btn', title: 'الصفحات', 'aria-label': 'الصفحات', onclick: () => setThumbs(!R.thumbs) }, icon('thumbs'));
  E.dirBtn = el('button', { class: 'icon-btn dir-btn', title: 'اتجاه التصفح', 'aria-label': 'اتجاه التصفح', onclick: toggleDir }, el('span', { class: 'dir-label' }));
  E.drawerBtn = el('button', { class: 'icon-btn', title: 'العلامات والملاحظات', 'aria-label': 'العلامات والملاحظات', onclick: () => setDrawer(!R.drawer) }, icon('list'));
  const top = el('div', { class: 'r-top' },
    el('button', { class: 'icon-btn', 'aria-label': 'العودة إلى المكتبة', title: 'المكتبة', onclick: closeReader }, icon('back')),
    el('div', { class: 'r-title' }, b.title), E.pageNo, E.dirBtn, E.modeBtn, E.thBtn, E.bmBtn, E.penBtn, E.txtBtn, E.drawerBtn);
  E.bookEl = el('div', { class: 'book-view' });
  E.tapNext = el('button', { class: 'tap-zone next', 'aria-label': 'الصفحة التالية', onclick: () => goto(R.page + stepSize(), 1) });
  E.tapPrev = el('button', { class: 'tap-zone prev', 'aria-label': 'الصفحة السابقة', onclick: () => goto(R.page - stepSize(), -1) });
  E.stage = el('div', { class: 'stage' }, E.bookEl, E.tapNext, E.tapPrev);
  E.penBar = penBar(() => R.activeInk || R.slots[0]?.ink); E.penBar.hidden = true; E.stage.append(E.penBar);
  E.thumbs = el('div', { class: 'thumbs', hidden: true }); E.stage.append(E.thumbs);
  E.panel = el('aside', { class: 'panel', 'aria-label': 'النص المستخرج' });
  E.drawer = el('aside', { class: 'drawer', hidden: true, 'aria-label': 'العلامات والملاحظات' });
  E.body = el('div', { class: 'r-body' }, E.stage, E.panel, E.drawer);
  E.range = el('input', { type: 'range', min: 1, max: b.pages, value: 1, 'aria-label': 'الانتقال إلى صفحة', oninput: (e) => { E.pageNo.textContent = `${e.target.value} / ${b.pages}`; }, onchange: (e) => goto(+e.target.value, 0) });
  E.pct = el('span', { class: 'muted num', style: 'font-size:13px;white-space:nowrap' });
  const bottom = el('div', { class: 'r-bottom' }, E.range, E.pct);
  readerEl.replaceChildren(top, E.body, bottom);
  setupDrag(E);
  new ResizeObserver(debounce(() => {
    const r = E.stage.getBoundingClientRect(), last = R.stageSize || { w: 0, h: 0 };
    if (!R.book || R.turning || (Math.abs(r.width - last.w) < 2 && Math.abs(r.height - last.h) < 2)) return;
    layout();
  }, 150)).observe(E.stage);
  setPanel(R.panel, true);
}

/** يحسب مقاس الصفحة ويبني خانة لكل صفحة ظاهرة، ثم يعرضها دون حركة. */
async function layout() {
  const E = R.els; if (!E || !R.pdf) return;
  R.mode = viewMode();
  E.modeBtn.setAttribute('aria-pressed', String(R.mode === 'double'));
  const start = spreadStart(Math.max(1, Math.min(R.book.pages, R.page)));
  R.page = start;
  const vp = (await R.pdf.getPage(start)).getViewport({ scale: 1 });
  const cs = getComputedStyle(E.stage), sr = E.stage.getBoundingClientRect();
  R.stageSize = { w: sr.width, h: sr.height };
  const aw = sr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = sr.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (aw <= 0 || ah <= 0) return;
  const cols = R.mode === 'double' ? 2 : 1;
  const scale = Math.min(aw / (vp.width * cols), ah / vp.height);
  R.size = { w: Math.floor(vp.width * scale), h: Math.floor(vp.height * scale), cols };
  E.bookEl.style.width = R.size.w * cols + 'px'; E.bookEl.style.height = R.size.h + 'px';
  E.bookEl.classList.toggle('double', cols === 2);
  applyDirChrome();
  buildSlots();
  updateChrome();
  await showSpread(start);
}
function buildSlots() {
  const E = R.els, { w, h, cols } = R.size;
  E.bookEl.replaceChildren();
  // الخانة الأولى هي الصفحة التي تُقرأ أولًا في الصفحتين المتقابلتين
  R.slots = (cols === 2 ? (isLtr() ? ['left', 'right'] : ['right', 'left']) : ['single']).map((side) => {
    const canvas = el('canvas', { class: 'pdf' });
    const inkHost = el('div');
    const flag = el('div', { class: 'bookmark-flag', hidden: true });
    const hl = el('div', { class: 'hl-layer' });
    const tl = el('div', { class: 'textLayer' });
    const node = el('div', { class: 'pg', 'data-side': side, style: `left:${side === 'right' ? w : 0}px;width:${w}px;height:${h}px` }, canvas, hl, tl, inkHost, flag);
    E.bookEl.append(node);
    const slot = { side, node, canvas, hl, tl, flag, page: null };
    bindTextLayer(tl);
    slot.ink = new Ink(inkHost, {
      onStart: (k) => { R.activeInk = k; },
      onCommit: (strokes) => {
        if (slot.page == null) return;
        const k = pageKey(slot.page);
        if (strokes.length) R.inkIndex.set(slot.page, inkInfo(strokes)); else R.inkIndex.delete(slot.page);
        saveLater('ink:' + k, () => Store.put('ink', k, strokes.slice()), 300);
        changed('ink');
        if (R.drawer) renderDrawer();
      },
    });
    slot.ink.setEnabled(R.pen);
    return slot;
  });
  if (cols === 2) E.bookEl.append(el('div', { class: 'spine' }));
  R.activeInk = null;
}

// صور الصفحات المرسومة تُحفظ مؤقتًا ليكون التقليب فوريًا
const pageCache = new Map(), pageInflight = new Map();
async function pageCanvas(n) {
  const { w, h } = R.size, dpr = dprCap(), key = `${R.book.id}:${n}:${w}`;
  if (pageCache.has(key)) { const c = pageCache.get(key); pageCache.delete(key); pageCache.set(key, c); return c; }
  if (pageInflight.has(key)) return pageInflight.get(key);
  const job = (async () => {
    const page = await R.pdf.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: c.width / vp1.width }) }).promise;
    pageCache.set(key, c);
    while (pageCache.size > 14) pageCache.delete(pageCache.keys().next().value);
    return c;
  })().finally(() => pageInflight.delete(key));
  pageInflight.set(key, job);
  return job;
}
function drawStrokes(ctx, strokes, cssW, cssH) {
  const fake = { w: cssW, h: cssH, dpr: ctx.canvas.width / cssW };
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  for (const s of strokes) Ink.prototype.stroke.call(fake, ctx, s);
  ctx.restore();
}
/** صورة صفحة مع كتابة القلم عليها، لوجهَي الورقة المقلوبة. */
async function pageSnapshot(n) {
  if (!n || n < 1 || n > R.book.pages) return null;
  const live = R.slots.find((s) => s.page === n);
  if (live) return slotSnapshot(live);
  const base = await pageCanvas(n);
  const strokes = (await Store.get('ink', pageKey(n))) || [];
  if (!strokes.length && !pdfMarks(n).length) return base;
  const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d'); ctx.drawImage(base, 0, 0);
  drawPageMarks(ctx, n);
  if (strokes.length) drawStrokes(ctx, strokes, R.size.w, R.size.h);
  return c;
}
function slotSnapshot(slot) {
  if (slot.page == null) return null;
  const c = document.createElement('canvas'); c.width = slot.canvas.width; c.height = slot.canvas.height;
  const ctx = c.getContext('2d'); ctx.drawImage(slot.canvas, 0, 0);
  drawPageMarks(ctx, slot.page);
  if (slot.ink.strokes.length) drawStrokes(ctx, slot.ink.strokes, R.size.w, R.size.h);
  return c;
}
async function fillSlot(slot, n) {
  slot.page = n ?? null;
  slot.node.classList.toggle('blank', !n);
  slot.tl.replaceChildren(); slot.hl.replaceChildren(); slot.hasText = false;
  if (!n) { slot.canvas.width = 1; slot.canvas.height = 1; slot.ink.load([]); slot.flag.hidden = true; return; }
  const src = await pageCanvas(n);
  if (slot.page !== n) return;
  if (slot.canvas.width !== src.width || slot.canvas.height !== src.height) { slot.canvas.width = src.width; slot.canvas.height = src.height; }
  slot.canvas.getContext('2d').drawImage(src, 0, 0);
  slot.ink.resize();
  renderPageMarks(slot);
  const strokes = (await Store.get('ink', pageKey(n))) || [];
  if (slot.page === n) slot.ink.load(strokes);
  slot.flag.hidden = !R.book.bookmarks.includes(n);
  renderTextLayer(slot, n);
}

// ---------- Selectable text on the page ----------
// في ملفات PDF النصية تُرسم فوق الصفحة طبقة نص شفافة، فيُحدَّد النص ويُلوَّن ويُترجم مباشرة من الكتاب.
const textCache = new Map();
function pageTextContent(n) {
  const k = `${R.book.id}:${n}`;
  if (!textCache.has(k)) textCache.set(k, R.pdf.getPage(n).then((p) => p.getTextContent()).catch(() => null));
  return textCache.get(k);
}
async function renderTextLayer(slot, n) {
  const tc = await pageTextContent(n);
  if (!tc || slot.page !== n) return;
  if (tc.items.reduce((a, it) => a + (it.str ? it.str.trim().length : 0), 0) < 10) return; // صفحة مصوّرة
  const page = await R.pdf.getPage(n);
  const vp = page.getViewport({ scale: R.size.w / page.getViewport({ scale: 1 }).width });
  slot.tl.replaceChildren();
  slot.tl.style.setProperty('--scale-factor', vp.scale);
  await pdfjsLib.renderTextLayer({ textContentSource: tc, container: slot.tl, viewport: vp, textDivs: [] }).promise.catch(() => {});
  if (slot.page !== n) return;
  reorderTextLayer(slot.tl);
  slot.tl.append(el('div', { class: 'endOfContent' }));
  slot.hasText = true;
}
// كما في قارئ pdf.js: حين يمرّ السحب فوق الفراغات بين الكلمات لا يقفز التحديد إلى آخر الصفحة
function bindTextLayer(tl) {
  tl.addEventListener('pointerdown', (e) => {
    const end = tl.querySelector('.endOfContent'); if (!end) return;
    if (e.target !== tl) {
      const b = tl.getBoundingClientRect();
      end.style.top = (Math.max(0, (e.clientY - b.top) / b.height) * 100).toFixed(2) + '%';
    }
    end.classList.add('active');
  });
  const reset = () => { const end = tl.querySelector('.endOfContent'); if (end) { end.style.top = ''; end.classList.remove('active'); } };
  document.addEventListener('pointerup', reset);
  document.addEventListener('pointercancel', reset);
}
const pdfMarks = (page) => S.marks.filter((m) => m.bookId === R.book?.id && m.page === page && m.rects);
function renderPageMarks(slot) {
  slot.hl.replaceChildren();
  if (!slot.page) return;
  for (const m of pdfMarks(slot.page)) for (const [x, y, w, h] of m.rects) {
    slot.hl.append(el('i', { 'data-id': m.id, 'data-style': m.style, 'data-color': m.color, class: m.note ? 'has-note' : null,
      style: `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%` }));
  }
}
function refreshPageMarks() { R.slots.forEach(renderPageMarks); }
/** يرسم تظليلات الصفحة على صورتها، لوجهَي الورقة أثناء التقليب. */
function drawPageMarks(ctx, page) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  for (const m of pdfMarks(page)) for (const [x, y, w, h] of m.rects) {
    if (m.style === 'underline') { ctx.fillStyle = COLORS[m.color] || '#5AA2EC'; ctx.fillRect(x * W, (y + h) * H - 3, w * W, 3); }
    else { ctx.globalAlpha = 0.45; ctx.fillStyle = COLORS[m.color] || '#F2C230'; ctx.fillRect(x * W, y * H, w * W, h * H); ctx.globalAlpha = 1; }
  }
  ctx.restore();
}
/** نص التحديد بترتيب القراءة، مأخوذًا من مواضع الكلمات على الصفحة. */
function selectedPageText(range, tl) {
  const items = [...tl.querySelectorAll('span')].filter((sp) => sp.firstChild?.nodeType === 3 && range.intersectsNode(sp)).map((sp) => {
    const tn = sp.firstChild; let a = 0, z = tn.length;
    if (range.startContainer === tn) a = range.startOffset;
    if (range.endContainer === tn) z = range.endOffset;
    const r = sp.getBoundingClientRect();
    return { text: tn.data.slice(a, z).replace(/[\u0000-\u001f\u200b\ufeff]/g, '').trim(), bbox: { x0: r.left, x1: r.right }, cy: r.top + r.height / 2, h: r.height };
  }).filter((it) => it.text);
  return readingLines(items).map(joinByGap).join(' ').replace(/\s+/g, ' ').trim();
}
/** يعيد ترتيب كلمات طبقة النص بترتيب القراءة، فيتبع التحديد الطبيعي اتجاه السطر العربي. */
function reorderTextLayer(tl) {
  const items = [...tl.querySelectorAll('span')].filter((sp) => sp.firstChild?.nodeType === 3 && sp.textContent.trim()).map((sp) => {
    const r = sp.getBoundingClientRect();
    return { sp, text: sp.textContent, bbox: { x0: r.left, x1: r.right }, cy: r.top + r.height / 2, h: r.height };
  });
  tl.replaceChildren();
  for (const line of readingLines(items)) { tl.append(...line.map((i) => i.sp)); tl.append(el('br')); }
}
/** يدمج مستطيلات التحديد المتجاورة على السطر الواحد، ويقصّها على حدود الصفحة. */
function selectionRects(range, box) {
  const rs = [...range.getClientRects()]
    .map((r) => ({ l: Math.max(r.left, box.left), t: Math.max(r.top, box.top), r: Math.min(r.right, box.right), b: Math.min(r.bottom, box.bottom) }))
    .filter((r) => r.r - r.l > 1 && r.b - r.t > 2)
    .sort((a, z) => a.t - z.t || a.l - z.l);
  const out = [];
  for (const r of rs) {
    const h = r.b - r.t;
    const same = out.find((o) => Math.abs((o.t + o.b) / 2 - (r.t + r.b) / 2) < Math.min(h, o.b - o.t) * 0.5 && r.l <= o.r + h * 0.8 && r.r >= o.l - h * 0.8);
    if (same) { same.l = Math.min(same.l, r.l); same.r = Math.max(same.r, r.r); same.t = Math.min(same.t, r.t); same.b = Math.max(same.b, r.b); }
    else out.push({ ...r });
  }
  return out.map((r) => [(r.l - box.left) / box.width, (r.t - box.top) / box.height, (r.r - r.l) / box.width, (r.b - r.t) / box.height].map((v) => +v.toFixed(4)));
}
async function showSpread(start) {
  const pages = spreadPages(start);
  const want = R.size.cols === 2 ? [start, start + 1 <= R.book.pages ? start + 1 : null] : [start];
  await Promise.all(R.slots.map((slot, i) => fillSlot(slot, want[i])));
  prefetch(start, pages);
}
function prefetch(start) {
  const st = stepSize();
  for (const p of [...spreadPages(start + st), ...spreadPages(start - st)]) pageCanvas(p).catch(() => {});
}
function setAnchor(start) {
  R.page = start; R.book.lastPage = start; saveBook(R.book, true);
  updateChrome();
}
let seenTimer;
function afterPageChange() {
  if (R.panel) loadPanel();
  if (R.drawer) renderDrawer();
  clearTimeout(seenTimer);
  const pages = spreadPages(R.page);
  seenTimer = setTimeout(() => pages.forEach(markSeen), 1500);
}
async function goto(n, dir = 0) {
  if (!R.book || R.turning || !R.size) return;
  const start = spreadStart(Math.max(1, Math.min(R.book.pages, n)));
  if (start === R.page && R.slots[0]?.page === start) return;
  hideSelBar();
  const from = R.page;
  dir = dir || Math.sign(start - from);
  const anim = reducedMotion() ? 'none' : (S.settings.turnAnim || 'curl');
  if (anim === 'curl' && Math.abs(start - from) === stepSize()) {
    const t = await beginTurn(dir);
    if (t) { await t.finish(true, 620); afterPageChange(); return; }
  }
  setAnchor(start);
  await showSpread(start);
  if (anim === 'slide' && dir) { const b = R.els.bookEl; b.classList.remove('turn-next', 'turn-prev'); void b.offsetWidth; b.classList.add((dir > 0) !== isLtr() ? 'turn-next' : 'turn-prev'); }
  afterPageChange();
}

// ---------- Page turn (paper curl) ----------
// الورقة تُطوى كالورق الحقيقي: يبدأ الطي من الزاوية، وخط الطي هو المنصِّف العمودي بين الزاوية وموضعها الجديد،
// فيظهر وجه الصفحة الحالية، وعلى ظهر الجزء المطوي الصفحة التالية بكتابتها الحقيقية، وتحته الصفحة المكشوفة.
function clipHalf(poly, side, positive) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const sa = side(A), sb = side(B), inA = positive ? sa > 0 : sa <= 0, inB = positive ? sb > 0 : sb <= 0;
    if (inA) out.push(A);
    if (inA !== inB) { const t = sa / (sa - sb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
  }
  return out.length >= 3 ? out : [];
}
function makeCurl({ w, h, front, back, hinge, x, corner }) {
  const E = R.els;
  const sr = E.stage.getBoundingClientRect(), br = E.bookEl.getBoundingClientRect();
  const ox = br.left - sr.left, oy = br.top - sr.top, dpr = dprCap();
  const cv = el('canvas', { class: 'curl-canvas', style: `width:${sr.width}px;height:${sr.height}px` });
  cv.width = Math.round(sr.width * dpr); cv.height = Math.round(sr.height * dpr);
  const ctx = cv.getContext('2d');
  const X0 = x, X1 = x + w;
  const xs = hinge === 'left' ? X0 : X1; // الكعب
  const cx = hinge === 'left' ? X1 : X0; // الحافة الحرة
  const cy = corner === 'top' ? 0 : h;
  const landX = hinge === 'left' ? X0 - w : X1; // موضع الظهر حين تكتمل الطيّة
  const sheet = [[X0, 0], [X1, 0], [X1, h], [X0, h]];
  const S1 = [xs, cy], S2 = [xs, h - cy], diag = Math.hypot(w, h);
  let P = [cx, cy];
  // الورقة لا تتمدد: الزاوية تبقى على بعد عرض الصفحة من الكعب على حافتها، وعلى بعد القطر من الزاوية المقابلة
  const clampP = ([px, py]) => {
    let dx = px - S1[0], dy = py - S1[1], d = Math.hypot(dx, dy);
    if (d > w) { px = S1[0] + (dx * w) / d; py = S1[1] + (dy * w) / d; }
    dx = px - S2[0]; dy = py - S2[1]; d = Math.hypot(dx, dy);
    if (d > diag) { px = S2[0] + (dx * diag) / d; py = S2[1] + (dy * diag) / d; }
    return [px, py];
  };
  const path = (poly) => { ctx.beginPath(); poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); };
  const drawImg = (img, X) => { if (img) ctx.drawImage(img, X, 0, w, h); else { ctx.fillStyle = '#FBFAF6'; ctx.fillRect(X, 0, w, h); } };
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, dpr * ox, dpr * oy);
    const vx = cx - P[0], vy = cy - P[1], len = Math.hypot(vx, vy);
    if (len < 0.5) { drawImg(front, X0); return; }
    const n = [vx / len, vy / len], M = [(cx + P[0]) / 2, (cy + P[1]) / 2];
    const side = (q) => (q[0] - M[0]) * n[0] + (q[1] - M[1]) * n[1];
    const folded = clipHalf(sheet, side, true), flat = clipHalf(sheet, side, false);
    const flap = folded.map((q) => { const t = 2 * side(q); return [q[0] - t * n[0], q[1] - t * n[1]]; });
    // 1) الجزء الذي لم يُطوَ بعد من الورقة
    if (flat.length) { ctx.save(); path(flat); ctx.clip(); drawImg(front, X0); ctx.restore(); }
    // 2) ظل الطيّة على الصفحة المكشوفة تحتها
    if (folded.length) {
      ctx.save(); path(folded); ctx.clip();
      const L = Math.min(len * 0.55, w * 0.45) + 1, g = ctx.createLinearGradient(M[0], M[1], M[0] + n[0] * L, M[1] + n[1] * L);
      g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(X0 - w, -h, 3 * w, 3 * h); ctx.restore();
    }
    if (!flap.length) return;
    // 3) الجزء المطوي: ظل يسقط تحته، ثم ظهر الورقة بالصفحة التالية معكوسة كما على الورق
    ctx.save(); path(flap);
    ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = 20 * dpr; ctx.shadowOffsetX = (n[0] < 0 ? 4 : -4) * dpr;
    ctx.fillStyle = '#FBFAF6'; ctx.fill(); ctx.restore();
    ctx.save(); path(flap); ctx.clip();
    const k = 2 * (M[0] * n[0] + M[1] * n[1]);
    ctx.transform(1 - 2 * n[0] * n[0], -2 * n[0] * n[1], -2 * n[0] * n[1], 1 - 2 * n[1] * n[1], k * n[0], k * n[1]); // انعكاس حول خط الطي
    ctx.transform(-1, 0, 0, 1, 2 * xs, 0); // انعكاس حول الكعب
    drawImg(back, landX);
    ctx.restore();
    // 4) ضوء وظل على انحناءة الورقة قرب خط الطي
    ctx.save(); path(flap); ctx.clip();
    const L2 = len / 2 + 1, g2 = ctx.createLinearGradient(M[0], M[1], M[0] - n[0] * L2, M[1] - n[1] * L2);
    g2.addColorStop(0, 'rgba(0,0,0,.26)'); g2.addColorStop(0.1, 'rgba(0,0,0,.08)');
    g2.addColorStop(0.45, 'rgba(255,255,255,.10)'); g2.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = g2; ctx.fillRect(X0 - 2 * w, -h, 5 * w, 3 * h); ctx.restore();
  }
  const lift = corner === 'top' ? 1 : -1;
  return {
    el: cv, cx, cy, xs,
    get P() { return P.slice(); },
    point(px, py) { P = clampP([px, py]); draw(); },
    /** التقدّم: نصف المسافة من الحافة الحرة إلى موضعها بعد القلب. */
    progress() { return Math.min(1, Math.abs(P[0] - cx) / (2 * w)); },
    /** مسار القلب الآلي: ترتفع الزاوية أولًا قطريًا، ثم يستقيم خط الطي حتى تنقلب الصفحة كلها. */
    set(p) { this.point(cx + (2 * xs - 2 * cx) * p, cy + lift * Math.sin(Math.PI * p) * h * 0.32); },
    /** سحب الإصبع: تتبع الزاوية الإصبع، مع رفع خفيف يجعل الطي يبدأ من الزاوية. */
    drag(dx, dy) {
      const prog = Math.min(1, Math.abs(dx) / (2 * w));
      this.point(cx + dx, cy + dy + lift * Math.sin(Math.PI * prog) * h * 0.22);
      return this.progress();
    },
  };
}
function animateP(from, to, ms, onFrame) {
  return new Promise((done) => {
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / Math.max(1, ms));
      onFrame(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
}
/** يجهّز تقليب صفحة واحدة في الاتجاه dir (1 = التالية). يعيد أداة تحكم بالتقدّم، أو null عند طرف الكتاب. */
/** يجهّز تقليب صفحة واحدة في الاتجاه dir (1 = التالية). يعيد أداة تحكم بالتقدّم، أو null عند طرف الكتاب. */
async function beginTurn(dir, opts = {}) {
  if (R.turning || !R.size) return null;
  const from = R.page, to = from + dir * stepSize();
  if (to < 1 || to > R.book.pages) return null;
  R.turning = true;
  const { w, h, cols } = R.size;
  let leafOpts, underSlot, underPage, finishSlot, finishPage, restorePage, reverse = false;
  if (cols === 2) {
    // إلى الأمام تنقلب الصفحة الثانية فوق الكعب، وإلى الخلف تنقلب الأولى
    const [first, second] = R.slots;
    const nextSecond = to + 1 <= R.book.pages ? to + 1 : null;
    if (dir > 0) {
      leafOpts = { front: slotSnapshot(second), back: await pageSnapshot(to), hinge: spineHinge(second), x: slotX(second) };
      underSlot = second; underPage = nextSecond; restorePage = second.page; finishSlot = first; finishPage = to;
    } else {
      leafOpts = { front: slotSnapshot(first), back: await pageSnapshot(nextSecond), hinge: spineHinge(first), x: slotX(first) };
      underSlot = first; underPage = to; restorePage = first.page; finishSlot = second; finishPage = nextSecond;
    }
  } else {
    // الصفحة الواحدة تدور حول حافتها الداخلية: اليمنى في الكتاب العربي واليسرى في اللاتيني
    const slot = R.slots[0], hinge = isLtr() ? 'left' : 'right';
    if (dir > 0) {
      leafOpts = { front: slotSnapshot(slot), back: await pageSnapshot(to), hinge, x: 0 };
      underSlot = slot; underPage = to; restorePage = slot.page;
    } else {
      leafOpts = { front: await pageSnapshot(to), back: slotSnapshot(slot), hinge, x: 0 };
      reverse = true; finishSlot = slot; finishPage = to;
    }
  }
  // الزاوية التي تُمسك: العليا إن بدأ السحب في النصف العلوي من الصفحة
  const top = opts.clientY != null && opts.clientY - R.els.bookEl.getBoundingClientRect().top < h / 2;
  const curl = makeCurl({ w, h, ...leafOpts, corner: top ? 'top' : 'bottom' });
  let cur = 0, byFinger = false;
  const set = (p) => { cur = p; byFinger = false; curl.set(reverse ? 1 - p : p); };
  set(0);
  R.els.stage.append(curl.el);
  if (underSlot) await fillSlot(underSlot, underPage);
  return {
    set,
    drag: reverse ? null : (dx, dy) => { byFinger = true; return curl.drag(dx, dy); },
    async finish(complete, ms) {
      if (byFinger) {
        const P0 = curl.P, T = complete ? [2 * curl.xs - curl.cx, curl.cy] : [curl.cx, curl.cy];
        const dist = Math.hypot(T[0] - P0[0], T[1] - P0[1]) / (2 * w);
        await animateP(0, 1, ms ?? Math.max(160, 520 * dist), (t) => curl.point(P0[0] + (T[0] - P0[0]) * t, P0[1] + (T[1] - P0[1]) * t));
      } else {
        const target = complete ? 1 : 0;
        await animateP(cur, target, ms ?? Math.max(180, 560 * Math.abs(target - cur)), set);
      }
      if (complete) {
        if (finishSlot) await fillSlot(finishSlot, finishPage);
        setAnchor(to);
        prefetch(to);
      } else if (underSlot) {
        await fillSlot(underSlot, restorePage);
      }
      curl.el.remove();
      R.turning = false;
    },
  };
}
/** سحب الصفحة بالإصبع: الورقة تتبع الإصبع، وتكتمل أو ترجع حسب المسافة والسرعة. */
function setupDrag(E) {
  let st = null, suppressClick = false;
  E.stage.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
  E.stage.addEventListener('pointerdown', (e) => {
    if (R.turning || e.button > 0 || e.pointerType === 'pen') return;
    if (R.pen && !(e.pointerType === 'touch' && S.settings.penOnly)) return;
    if (e.target.closest('.pen-bar, .thumbs')) return;
    const sel = getSelection();
    // سحب الفأرة فوق النص، أو سحب مقابض التحديد، يحدّد النص ولا يقلب الصفحة
    const noDrag = (e.pointerType === 'mouse' && !!e.target.closest('.textLayer span')) || (sel && !sel.isCollapsed && !!sel.anchorNode && E.bookEl.contains(sel.anchorNode));
    st = { x: e.clientX, y: e.clientY, id: e.pointerId, dir: 0, p: 0, vx: 0, lastX: e.clientX, lastT: performance.now(), t0: performance.now(), noDrag };
  });
  E.stage.addEventListener('pointermove', async (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    const now = performance.now();
    st.vx = (e.clientX - st.lastX) / Math.max(1, now - st.lastT); st.lastX = e.clientX; st.lastT = now;
    if (st.noDrag) return;
    if (!st.dir) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) { if (Math.abs(dy) > 24) st = null; return; }
      st.sx = dx > 0 ? 1 : -1; // اتجاه حركة الإصبع على الشاشة
      st.dir = isLtr() ? -st.sx : st.sx; suppressClick = true;
      // سحب الصفحة يقلبها ولا يحدّد نصها
      getSelection().removeAllRanges(); E.stage.classList.add('dragging');
      try { E.stage.setPointerCapture(e.pointerId); } catch {}
      if (!reducedMotion() && (S.settings.turnAnim || 'curl') === 'curl') st.pending = beginTurn(st.dir, { clientY: st.y });
    }
    if (st.pending && !st.turn) { st.turn = await st.pending; if (!st) return; }
    if (st?.turn) {
      if (st.turn.drag) st.p = st.turn.drag(dx, dy);
      else { st.p = Math.max(0, Math.min(1, (dx * st.sx) / (R.size.w * R.size.cols))); st.turn.set(st.p); }
    }
  });
  const end = async (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    E.stage.classList.remove('dragging');
    if (s.dir) getSelection().removeAllRanges();
    if (s.pending && !s.turn) s.turn = await s.pending;
    if (s.turn) {
      const complete = s.p > 0.3 || (s.p > 0.1 && s.vx * s.sx > 0.45);
      await s.turn.finish(complete);
      if (complete) afterPageChange();
      return;
    }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (s.dir && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) goto(R.page + s.dir * stepSize(), s.dir);
    else if (!s.dir && Math.hypot(dx, dy) < 10 && performance.now() - s.t0 < 450) handleTap(e);
  };
  E.stage.addEventListener('pointerup', end);
  E.stage.addEventListener('pointercancel', end);
}

function handleTap(e) {
  const sel = getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    // نقرة داخل التحديد الحالي تتركه كما هو، ونقرة خارجه تلغيه ثم تُعامل كنقرة عادية
    const inside = [...sel.getRangeAt(0).getClientRects()].some((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    if (inside) return;
    sel.removeAllRanges();
  }
  for (const slot of R.slots) {
    if (!slot.page) continue;
    const box = slot.node.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    const m = pdfMarks(slot.page).find((k) => k.rects.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry - 0.005 && y <= ry + rh + 0.005));
    if (m) { setTimeout(() => showSelBar(slot.hl.querySelector(`[data-id="${m.id}"]`).getBoundingClientRect(), m), 0); return; }
  }
  if (R.pen) return;
  const sr = R.els.stage.getBoundingClientRect(), fx = (e.clientX - sr.left) / sr.width;
  const leftDir = isLtr() ? -1 : 1; // النقر على الطرف الأيسر: التالية في العربي، والسابقة في اللاتيني
  if (fx < 0.18) goto(R.page + leftDir * stepSize(), leftDir);
  else if (fx > 0.82) goto(R.page - leftDir * stepSize(), -leftDir);
}
function applyDirChrome() {
  const E = R.els, ltr = isLtr();
  E.dirBtn.querySelector('.dir-label').textContent = ltr ? 'A→' : '←ع';
  E.dirBtn.title = ltr ? 'اتجاه التصفح: من اليسار إلى اليمين (كتاب لاتيني)' : 'اتجاه التصفح: من اليمين إلى اليسار (كتاب عربي)';
  E.dirBtn.setAttribute('aria-pressed', String(ltr));
  E.range.style.direction = ltr ? 'ltr' : 'rtl';
  E.thumbs.dir = ltr ? 'ltr' : 'rtl';
  E.stage.classList.toggle('ltr', ltr);
}
function toggleDir() {
  if (R.turning) return;
  R.book.dir = isLtr() ? 'rtl' : 'ltr';
  Store.put('books', R.book.id, R.book);
  toast(isLtr() ? 'التصفح من اليسار إلى اليمين (كتاب لاتيني).' : 'التصفح من اليمين إلى اليسار (كتاب عربي).');
  layout().then(afterPageChange);
  if (R.thumbs) buildThumbs();
}
function toggleMode() {
  S.settings.pageMode = R.mode === 'double' ? 'single' : 'double';
  saveSettings();
  toast(S.settings.pageMode === 'double' ? 'عرض صفحتين متقابلتين.' : 'عرض صفحة واحدة.');
  layout().then(afterPageChange);
}
function setPen(on) {
  R.pen = on; const E = R.els;
  E.penBtn.setAttribute('aria-pressed', String(on));
  E.penBar.hidden = !on; E.tapNext.hidden = on; E.tapPrev.hidden = on;
  E.stage.classList.toggle('pen-on', on);
  R.slots.forEach((s) => s.ink.setEnabled(on));
  layout();
  if (on) setThumbs(false);
}
function setThumbs(on) {
  R.thumbs = on; const E = R.els;
  E.thBtn.setAttribute('aria-pressed', String(on)); E.thumbs.hidden = !on;
  if (on) buildThumbs();
}
function setPanel(on, silent) {
  R.panel = on; const E = R.els;
  E.txtBtn.setAttribute('aria-pressed', String(on));
  E.body.classList.toggle('with-panel', on); E.panel.hidden = !on;
  if (!on) hideSelBar();
  if (on && !silent) loadPanel();
}
function toggleBookmark() {
  const b = R.book; const i = b.bookmarks.indexOf(R.page);
  if (i >= 0) b.bookmarks.splice(i, 1); else b.bookmarks.push(R.page);
  saveBook(b); updateChrome(); if (R.drawer) renderDrawer();
  toast(i >= 0 ? 'أُزيلت العلامة.' : `وُضعت علامة على الصفحة ${R.page}.`);
}
function updateChrome() {
  const E = R.els, b = R.book; if (!E) return;
  const pages = spreadPages(R.page);
  E.pageNo.textContent = `${pages.join('–')} / ${b.pages}`;
  E.range.value = R.page;
  E.pct.textContent = `قُرئ ${Math.round((b.seen.length / b.pages) * 100)}%`;
  E.bmBtn.setAttribute('aria-pressed', String(b.bookmarks.includes(R.page)));
  R.slots.forEach((s) => { s.flag.hidden = !(s.page && b.bookmarks.includes(s.page)); });
  E.thumbs.querySelectorAll('button').forEach((t) => t.setAttribute('aria-current', String(pages.includes(+t.dataset.page))));
}
function markSeen(n) {
  if (!R.book || !spreadPages(R.page).includes(n)) return;
  const b = R.book, d = todayRec(), key = `${b.id}:${n}`;
  if (!b.seen.includes(n)) { b.seen.push(n); saveBook(b); }
  if (!d.pages.includes(key)) { d.pages.push(key); saveDaily(d); }
  updateChrome(); changed('pages');
}
const thumbCache = new Map();
async function thumbURL(n, withInk) {
  const k = `${R.book.id}:${n}`;
  if (!thumbCache.has(k)) { const c = await renderToCanvas(R.pdf, n, 110); thumbCache.set(k, c); }
  const base = thumbCache.get(k);
  if (!withInk) return base.toDataURL('image/jpeg', 0.7);
  const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d'); ctx.drawImage(base, 0, 0);
  drawStrokes(ctx, (await Store.get('ink', pageKey(n))) || [], base.width, base.height);
  return c.toDataURL('image/jpeg', 0.75);
}
function buildThumbs() {
  const E = R.els, b = R.book;
  E.thumbs.replaceChildren();
  const io = new IntersectionObserver((ents) => ents.forEach(async (en) => {
    if (!en.isIntersecting) return; io.unobserve(en.target);
    en.target.querySelector('img').src = await thumbURL(+en.target.dataset.page, R.inkIndex.has(+en.target.dataset.page));
  }), { root: E.thumbs });
  const pages = spreadPages(R.page);
  for (let n = 1; n <= b.pages; n++) {
    const t = el('button', { 'data-page': n, 'aria-label': `الصفحة ${n}`, 'aria-current': String(pages.includes(n)), onclick: () => goto(n) },
      el('img', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', style: 'width:92px;height:130px' }),
      el('span', {}, b.bookmarks.includes(n) ? `◆ ${n}` : n));
    E.thumbs.append(t); io.observe(t);
  }
  E.thumbs.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
document.addEventListener('keydown', (e) => {
  if (readerEl.hidden || /input|textarea/i.test(e.target.tagName)) return;
  const leftDir = isLtr() ? -1 : 1;
  if (e.key === 'ArrowLeft') goto(R.page + leftDir * stepSize(), leftDir);
  else if (e.key === 'ArrowRight') goto(R.page - leftDir * stepSize(), -leftDir);
  else if (e.key === 'Escape') { if ($('.sel-bar') || $('.pop')) { hideSelBar(); getSelection().removeAllRanges(); } else if (R.drawer) setDrawer(false); else closeReader(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && R.pen) { e.preventDefault(); const k = R.activeInk || R.slots[0]?.ink; e.shiftKey ? k?.redo() : k?.undo(); }
});

// ---------- Annotations drawer ----------
// إطار جانبي على اليسار يجمع علامات الكتاب وتظليلاته وملاحظاته وصفحات القلم، مع تصفية حسب النوع واللون.
const DRAWER_TYPES = [['all', 'الكل'], ['bookmark', 'العلامات'], ['highlight', 'التظليل'], ['underline', 'التسطير'], ['note', 'الملاحظات'], ['ink', 'كتابة القلم']];
const COLOR_NAMES = { yellow: 'أصفر', green: 'أخضر', pink: 'وردي', blue: 'أزرق', red: 'أحمر', black: 'أسود' };
// ألوان التصفية تشمل ألوان التظليل وألوان أقلام الكتابة معًا
const FILTER_COLORS = { yellow: '#F2C230', green: '#6CC35E', pink: '#EC6E9F', blue: '#5AA2EC', red: '#B3362F', black: '#1C2220' };
const COLOR_REFS = [['yellow', '#F2C230'], ['green', '#6CC35E'], ['green', '#1E6A64'], ['pink', '#EC6E9F'], ['pink', '#F07AA5'], ['blue', '#5AA2EC'], ['blue', '#2C6FB8'], ['red', '#B3362F'], ['black', '#1C2220']];
function colorCat(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 'black';
  const n = parseInt(m[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  let best = 'black', bd = Infinity;
  for (const [k, h] of COLOR_REFS) {
    const v = parseInt(h.slice(1), 16), d = (rgb[0] - (v >> 16)) ** 2 + (rgb[1] - ((v >> 8) & 255)) ** 2 + (rgb[2] - (v & 255)) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
const itemColors = (it) => (it.g ? [it.g.color] : it.type === 'ink' ? it.colors : ['red']);
function setDrawer(on) {
  R.drawer = on; R.picking = null;
  R.els.drawerBtn.setAttribute('aria-pressed', String(on));
  R.els.drawer.hidden = !on;
  if (on) renderDrawer();
}
function drawerItems() {
  const b = R.book, items = [];
  for (const n of b.bookmarks) items.push({ type: 'bookmark', page: n });
  for (const g of groupMarks().filter((x) => x.bookId === b.id)) items.push({ type: g.style === 'underline' ? 'underline' : 'highlight', page: g.page, g });
  for (const [n, info] of R.inkIndex) items.push({ type: 'ink', page: n, count: info.count, colors: info.colors });
  const order = { bookmark: 0, ink: 1, highlight: 2, underline: 2 };
  return items.sort((a, z) => a.page - z.page || order[a.type] - order[z.type] || (a.g?.created || 0) - (z.g?.created || 0));
}
function matchesFilter(it) {
  const { type, colors } = R.filt;
  if (colors.size && !itemColors(it).some((c) => colors.has(c))) return false;
  if (type === 'all') return true;
  if (type === 'note') return !!it.g?.note;
  return it.type === type;
}
function renderDrawer() {
  const E = R.els, all = drawerItems();
  const count = (t) => all.filter((it) => (t === 'all' ? true : t === 'note' ? !!it.g?.note : it.type === t)).length;
  const list = all.filter(matchesFilter);
  const spread = spreadPages(R.page);
  const chips = el('div', { class: 'dr-chips', role: 'group', 'aria-label': 'تصفية حسب النوع' },
    ...DRAWER_TYPES.map(([k, l]) => el('button', { class: 'dr-chip', 'aria-pressed': String(R.filt.type === k), onclick: () => { R.filt.type = k; renderDrawer(); } }, l, el('span', { class: 'n num' }, fmt(count(k))))));
  const dots = el('div', { class: 'dr-colors', role: 'group', 'aria-label': 'تصفية حسب اللون' },
    el('span', { class: 'muted' }, 'اللون:'),
    ...Object.entries(FILTER_COLORS).map(([k, c]) => el('button', { class: 'dot', style: `background:${c}`, 'aria-pressed': String(R.filt.colors.has(k)), 'aria-label': COLOR_NAMES[k],
      title: `${COLOR_NAMES[k]} (${all.filter((it) => itemColors(it).includes(k)).length})`,
      onclick: () => { R.filt.colors.has(k) ? R.filt.colors.delete(k) : R.filt.colors.add(k); renderDrawer(); } })),
    R.filt.colors.size || R.filt.type !== 'all' ? el('button', { class: 'btn ghost', style: 'min-height:32px;padding:2px 10px;font-size:13px', onclick: () => { R.filt = { type: 'all', colors: new Set() }; renderDrawer(); } }, 'إلغاء التصفية') : null);
  const ul = el('div', { class: 'dr-list' });
  if (!list.length) ul.append(el('p', { class: 'muted', style: 'padding:16px;line-height:1.8' }, all.length ? 'لا عناصر تطابق هذه التصفية.' : 'لا شيء هنا بعد. ضع علامة على صفحة، أو ظلّل نصًا، أو اكتب بالقلم، وسيظهر هنا.'));
  const picking = R.picking;
  if (picking) for (const k of [...picking]) if (!list.some((it) => itemKey(it) === k)) picking.delete(k);
  for (const it of list) ul.append(drawerItem(it, spread.includes(it.page)));
  const pickBtn = list.length || picking ? el('button', { class: 'btn ghost dr-pick', 'aria-pressed': String(!!picking), onclick: () => { R.picking = picking ? null : new Set(); renderDrawer(); } }, picking ? 'تم' : 'تحديد') : null;
  E.drawer.replaceChildren(
    el('div', { class: 'dr-head' }, el('h2', {}, 'علامات وملاحظات الكتاب'), pickBtn, el('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => setDrawer(false) }, icon('close'))),
    chips, dots, ul, drawerActions(list));
}
// ---------- Deleting from the drawer ----------
// يُحذف عنصر واحد، أو المحدد، أو كل ما تعرضه التصفية الحالية (بالنوع و/أو اللون)، مع إمكانية التراجع.
const itemKey = (it) => `${it.type}:${it.page}:${it.g?.group || ''}`;
const notesOnly = () => R.filt.type === 'note'; // في تصفية «الملاحظات» يُمحى نص الملاحظة ويبقى التظليل
function filterLabel(n) {
  const cs = [...R.filt.colors].map((c) => COLOR_NAMES[c]).join(' و');
  const t = DRAWER_TYPES.find(([k]) => k === R.filt.type)[1];
  if (R.filt.type === 'all' && !cs) return `حذف الكل (${fmt(n)})`;
  return `حذف ${R.filt.type === 'all' ? 'كل ما' : t}${cs ? ` بلون ${cs}` : ''} (${fmt(n)})`;
}
function drawerActions(list) {
  const picking = R.picking;
  if (!list.length) return el('div', { class: 'dr-actions', hidden: true });
  const targets = picking ? list.filter((it) => picking.has(itemKey(it))) : list;
  let armed = false, timer = 0;
  const label = picking ? `حذف المحدد (${fmt(targets.length)})` : filterLabel(targets.length);
  const del = el('button', { class: 'btn danger dr-delall', disabled: !targets.length, onclick: () => {
    if (!armed) {
      armed = true; del.textContent = `اضغط مجددًا لتأكيد حذف ${fmt(targets.length)}`; del.classList.add('armed');
      timer = setTimeout(() => { armed = false; del.textContent = label; del.classList.remove('armed'); }, 3500);
      return;
    }
    clearTimeout(timer); R.picking = null; deleteItems(targets);
  } }, icon('trash'), label);
  return el('div', { class: 'dr-actions' },
    picking ? el('button', { class: 'btn ghost', onclick: () => {
      if (targets.length === list.length) picking.clear(); else list.forEach((it) => picking.add(itemKey(it)));
      renderDrawer();
    } }, targets.length === list.length ? 'إلغاء تحديد الكل' : 'تحديد الكل') : null,
    del);
}
async function inkStrokes(page) {
  const slot = R.slots.find((s) => s.page === page);
  return slot ? slot.ink.strokes.slice() : ((await Store.get('ink', pageKey(page))) || []);
}
function setInkStrokes(page, strokes) {
  const k = pageKey(page);
  if (strokes.length) R.inkIndex.set(page, inkInfo(strokes)); else R.inkIndex.delete(page);
  saveLater('ink:' + k, () => Store.put('ink', k, strokes.slice()), 0);
  const slot = R.slots.find((s) => s.page === page);
  if (slot) slot.ink.load(strokes.slice());
}
async function deleteItems(items) {
  const b = R.book, onlyNotes = notesOnly(), colors = new Set(R.filt.colors);
  const undo = { bookmarks: b.bookmarks.slice(), marks: [], notes: [], ink: new Map() };
  const groups = new Set(items.filter((it) => it.g).map((it) => it.g.group));
  const pages = new Set(items.filter((it) => it.type === 'bookmark').map((it) => it.page));
  let n = 0;
  if (pages.size) { b.bookmarks = b.bookmarks.filter((p) => !pages.has(p)); saveBook(b); n += pages.size; }
  if (groups.size) {
    const hit = S.marks.filter((m) => groups.has(m.group));
    if (onlyNotes) {
      for (const m of hit) { undo.notes.push([m, m.note]); m.note = ''; Store.put('marks', m.id, m); }
    } else {
      undo.marks = hit;
      S.marks = S.marks.filter((m) => !groups.has(m.group));
      hit.forEach((m) => Store.del('marks', m.id));
    }
    hit.forEach((m) => refreshPara(m.page, m.para));
    n += groups.size;
  }
  for (const it of items.filter((x) => x.type === 'ink')) {
    const prev = await inkStrokes(it.page);
    undo.ink.set(it.page, prev);
    // مع تصفية اللون تُحذف خطوط ذلك اللون وحدها، وتبقى بقية الكتابة على الصفحة
    setInkStrokes(it.page, colors.size ? prev.filter((k) => k.t === 'eraser' || !colors.has(colorCat(k.c))) : []);
    n++;
  }
  afterDelete();
  toast(`حُذف ${n === 1 ? 'عنصر واحد' : n === 2 ? 'عنصران' : `${fmt(n)} عناصر`}.`, { label: 'تراجع', fn: () => {
    b.bookmarks = undo.bookmarks; saveBook(b);
    for (const m of undo.marks) { S.marks.push(m); Store.put('marks', m.id, m); refreshPara(m.page, m.para); }
    for (const [m, note] of undo.notes) { m.note = note; Store.put('marks', m.id, m); refreshPara(m.page, m.para); }
    for (const [p, strokes] of undo.ink) setInkStrokes(p, strokes);
    afterDelete();
  } });
}
function afterDelete() {
  refreshPageMarks(); updateChrome();
  if (R.thumbs) buildThumbs();
  if (R.drawer) renderDrawer();
  changed('marks'); changed('ink');
}
function drawerItem(it, current) {
  const meta = (t) => el('small', { class: 'dr-meta' }, `الصفحة ${it.page} · ${t}`);
  let body, thumb = null;
  if (it.type === 'bookmark') {
    body = el('div', { class: 'dr-body' }, el('b', {}, 'علامة مرجعية'), meta('اضغط للانتقال'));
    thumb = el('img', { class: 'dr-thumb', alt: '' });
  } else if (it.type === 'ink') {
    body = el('div', { class: 'dr-body' }, el('b', {}, 'كتابة بالقلم'), meta(`${fmt(it.count)} ${it.count === 1 ? 'خط' : 'خطوط'}`),
      el('span', { class: 'dr-inks' }, ...it.colors.map((c) => el('i', { style: `background:${FILTER_COLORS[c]}`, title: COLOR_NAMES[c] }))));
    thumb = el('img', { class: 'dr-thumb', alt: '' });
  } else {
    const g = it.g;
    body = el('div', { class: 'dr-body' },
      el('q', { dir: isArabic(g.text) ? 'rtl' : 'ltr' }, g.text.length > 160 ? g.text.slice(0, 160) + '…' : g.text),
      g.note ? el('span', { class: 'dr-note' }, '✎ ' + g.note) : null,
      meta(`${it.type === 'underline' ? 'تسطير' : 'تظليل'} ${COLOR_NAMES[g.color] || ''}${g.rects ? ' · على الصفحة' : ''}`));
  }
  const picking = R.picking, key = itemKey(it);
  const row = el('div', { class: 'dr-item', 'data-type': it.type, 'data-color': it.g?.color || '', 'data-place': it.g?.rects ? 'page' : '', 'aria-current': String(current) },
    picking ? el('span', { class: 'dr-check', 'aria-hidden': 'true' }) : null,
    el('button', { class: 'dr-open', 'aria-pressed': picking ? String(picking.has(key)) : null,
      onclick: () => { if (!picking) return jumpTo(it); picking.has(key) ? picking.delete(key) : picking.add(key); renderDrawer(); } }, thumb, body));
  if (picking) row.classList.toggle('picked', picking.has(key));
  else {
    const what = notesOnly() ? 'حذف الملاحظة' : it.type === 'bookmark' ? 'إزالة العلامة' : it.type === 'ink' ? (R.filt.colors.size ? 'حذف خطوط هذا اللون' : 'حذف كتابة القلم') : 'حذف التظليل';
    row.append(el('button', { class: 'icon-btn dr-del', 'aria-label': what, title: what, onclick: () => deleteItems([it]) }, icon('trash')));
  }
  if (thumb) thumbURL(it.page, it.type === 'ink').then((u) => { thumb.src = u; }).catch(() => {});
  return row;
}
async function jumpTo(it) {
  await goto(it.page);
  if (!it.g) return;
  setDrawer(false); // الإطار يغطي جزءًا من الكتاب، فيُغلق ليظهر التظليل
  if (it.g.rects) {
    await new Promise((r) => setTimeout(r, 60));
    R.slots.forEach((sl) => sl.hl.querySelectorAll(`[data-id="${it.g.id}"]`).forEach((x) => { x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }));
    return;
  }
  if (!R.panel) setPanel(true, true);
  await loadPanel();
  const mk = $(`#ocrText mark[data-id="${it.g.id}"]`);
  if (mk) { mk.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); mk.classList.remove('flash'); void mk.offsetWidth; mk.classList.add('flash'); }
}

// ---------- Reading time ----------
let lastAct = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, () => { lastAct = Date.now(); }, { capture: true, passive: true }));
setInterval(() => {
  if (!R.book || document.hidden || Date.now() - lastAct > 120000) return;
  const d = todayRec(), b = R.book;
  d.sec++; d.books[b.id] = (d.books[b.id] || 0) + 1; b.secs = (b.secs || 0) + 1;
  saveDaily(d); saveBook(b, true);
  if (d.sec % 10 === 0) changed('time');
}, 1000);

// ---------- Text panel: extraction (OCR) ----------
async function loadPanel() {
  const E = R.els; if (!E || !R.book) return;
  const start = R.page, list = [];
  for (const n of spreadPages(start)) {
    let rec = await Store.get('ocr', pageKey(n));
    if (!rec) {
      const paras = await nativeText(n);
      if (paras) { rec = { paras, engine: 'pdf', at: Date.now() }; await Store.put('ocr', pageKey(n), rec); }
    }
    list.push({ n, rec });
  }
  if (R.page !== start || !R.book) return;
  renderPanel(list);
}
function renderPanel(list) {
  const E = R.els, pages = list.map((x) => x.n);
  const missing = list.filter((x) => !x.rec).map((x) => x.n);
  const head = el('div', { class: 'panel-head' },
    el('h2', {}, pages.length > 1 ? `نص الصفحتين ${pages.join('–')}` : `نص الصفحة ${pages[0]}`),
    el('button', { class: 'icon-btn', title: 'تصغير الخط', 'aria-label': 'تصغير الخط', onclick: () => setReadSize(-2) }, el('span', { style: 'font-size:14px;font-weight:600' }, 'أ-')),
    el('button', { class: 'icon-btn', title: 'تكبير الخط', 'aria-label': 'تكبير الخط', onclick: () => setReadSize(2) }, el('span', { style: 'font-size:18px;font-weight:600' }, 'أ+')),
    missing.length < pages.length ? el('button', { class: 'icon-btn', title: 'نسخ النص', 'aria-label': 'نسخ النص المستخرج', onclick: () => copyPanelText(list) }, icon('copy')) : null,
    missing.length < pages.length ? el('button', { class: 'btn ghost', disabled: R.ocrBusy, onclick: () => runOCR(pages, true) }, icon('scan'), 'إعادة الاستخراج') : null,
    el('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => setPanel(false) }, icon('close')));
  E.progress = el('div', { class: 'progress', hidden: !R.ocrBusy }, el('span', {}, R.ocrStatus || ''), el('div', { class: 'bar' }, el('i', { style: `width:${(R.ocrPct || 0) * 100}%` })));
  const body = el('div', { class: 'ocr-text', id: 'ocrText', lang: 'ar', style: `--read-size:${S.settings.readSize}px` });
  for (const { n, rec } of list) {
    const sec = el('section', { 'data-page': n }, pages.length > 1 ? el('h3', { class: 'pg-label' }, el('span', {}, `الصفحة ${n}`),
      rec?.paras.length ? el('button', { class: 'icon-btn copy-pg', title: `نسخ نص الصفحة ${n}`, 'aria-label': `نسخ نص الصفحة ${n}`, onclick: () => copyPanelText([{ n, rec }]) }, icon('copy')) : null) : null);
    if (rec) {
      rec.paras.forEach((t, i) => sec.append(paraEl(t, i, n)));
      if (!rec.paras.length) sec.append(el('p', { class: 'muted' }, 'لم يُعثر على نص في هذه الصفحة.'));
    } else {
      sec.append(el('div', { class: 'panel-empty' },
        el('p', {}, 'هذه الصفحة صورة ممسوحة، فلا يمكن تحديد نصها بعد. استخرج النص لتتمكّن من تحديده وتلوينه وتسطيره وترجمته.'),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', disabled: R.ocrBusy, onclick: () => runOCR([n], true) }, icon('scan'), pages.length > 1 ? `استخراج الصفحة ${n}` : 'استخراج نص هذه الصفحة'),
          el('button', { class: 'btn', disabled: R.ocrBusy, onclick: () => runOCR(Array.from({ length: R.book.pages }, (_, i) => i + 1)) }, 'كل الصفحات'))));
    }
    body.append(sec);
  }
  if (missing.length) body.append(el('p', { class: 'muted', style: 'font-size:13px;font-family:var(--font-ui);line-height:1.7' }, S.settings.ocrEngine === 'claude' && window.claude
    ? 'المحرّك: Claude. تُرسل صورة الصفحة إلى Claude لقراءتها.' : 'يعمل الاستخراج على الجهاز دون إرسال الصفحة إلى أي خادم، ويتعرّف على العربية والحروف اللاتينية معًا.'));
  body.addEventListener('click', onMarkTap);
  E.panel.replaceChildren(head, E.progress, body);
}
/** ينسخ النص المستخرج كاملًا، فقراته مفصولة بسطر فارغ. */
async function copyPanelText(list) {
  const withText = list.filter((x) => x.rec?.paras.length);
  const text = withText.map((x) => x.rec.paras.join('\n\n')).join('\n\n');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(withText.length > 1 ? `نُسخ نص الصفحتين ${withText.map((x) => x.n).join(' و')}.` : `نُسخ نص الصفحة ${withText[0].n}.`);
  } catch {
    // إن رفض المتصفح النسخ يُحدَّد النص ليُنسخ من قائمة iPad
    const root = withText.length === 1 ? $(`#ocrText section[data-page="${withText[0].n}"]`) : $('#ocrText');
    if (root) { const r = document.createRange(); r.selectNodeContents(root); getSelection().removeAllRanges(); getSelection().addRange(r); }
    toast('حُدّد النص. اضغط «نسخ» من قائمة iPad.');
  }
}
function setReadSize(d) { S.settings.readSize = Math.max(16, Math.min(34, S.settings.readSize + d)); saveSettings(); const t = $('#ocrText'); if (t) t.style.setProperty('--read-size', S.settings.readSize + 'px'); }
function paraEl(text, i, page) {
  const p = el('p', { 'data-para': i, dir: isArabic(text) || !/[A-Za-z]/.test(text) ? 'rtl' : 'ltr' });
  const marks = S.marks.filter((m) => m.bookId === R.book.id && m.page === page && m.para === i).sort((a, b) => a.created - b.created);
  const cuts = new Set([0, text.length]); marks.forEach((m) => { cuts.add(Math.max(0, m.start)); cuts.add(Math.min(text.length, m.end)); });
  const pts = [...cuts].sort((a, b) => a - b);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], z = pts[k + 1]; if (a >= z) continue;
    let node = document.createTextNode(text.slice(a, z));
    for (const m of marks) if (m.start <= a && m.end >= z) {
      node = el('mark', { 'data-id': m.id, 'data-style': m.style, 'data-color': m.color, class: m.note ? 'has-note' : null }, node);
    }
    p.append(node);
  }
  return p;
}
function refreshPara(page, i) {
  const old = $(`#ocrText section[data-page="${page}"] p[data-para="${i}"]`); if (!old) return;
  old.replaceWith(paraEl(old.textContent, i, page));
}
async function nativeText(n) {
  try {
    const page = await R.pdf.getPage(n);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str && it.str.trim());
    if (items.reduce((a, it) => a + it.str.length, 0) < 25) return null;
    const lines = [];
    for (const it of items) {
      const y = it.transform[5], x = it.transform[4], hgt = Math.abs(it.transform[3]) || 10;
      let ln = lines.find((l) => Math.abs(l.y - y) < hgt * 0.5);
      if (!ln) { ln = { y, h: hgt, items: [] }; lines.push(ln); }
      ln.items.push({ x, s: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    const txt = lines.map((l) => { const rtl = isArabic(l.items.map((i) => i.s).join('')); l.items.sort((a, b) => rtl ? b.x - a.x : a.x - b.x); return l.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim(); });
    const paras = []; let cur = '';
    lines.forEach((l, i) => {
      const gap = i ? lines[i - 1].y - l.y : 0;
      if (i && gap > l.h * 1.9) { paras.push(cur.trim()); cur = ''; }
      cur += ' ' + txt[i];
    });
    if (cur.trim()) paras.push(cur.trim());
    return paras.filter(Boolean);
  } catch { return null; }
}
const absUrl = (p) => new URL(p, location.href).href;
function ocrProgress(status, pct) {
  R.ocrStatus = status; R.ocrPct = pct;
  const P = R.els?.progress; if (!P) return;
  P.hidden = false; P.firstChild.textContent = status; P.querySelector('i').style.width = `${Math.round(pct * 100)}%`;
}
// عاملان: العربي وحده أدق للنص العربي، والعربي مع الإنجليزي يقرأ الكلمات اللاتينية. الثاني يُحمَّل فقط عند الحاجة.
const tess = {};
function getTess(langs) {
  return (tess[langs] ||= Tesseract.createWorker(langs, 1, {
    workerPath: absUrl('vendor/tesseract/worker-wrap.js'), corePath: absUrl('vendor/tesseract/'), langPath: absUrl('vendor/tessdata'),
    workerBlobURL: false, cacheMethod: 'none',
    logger: (m) => {
      if (m.status === 'recognizing text') ocrProgress(R.ocrLabel + (langs === 'ara+eng' ? ' — التعرّف على الكلمات اللاتينية' : ' — التعرّف على النص'), m.progress);
      else ocrProgress('تحميل محرّك التعرّف على النص…', m.progress || 0);
    },
  }).then(async (w) => { await w.setParameters({ preserve_interword_spaces: '1' }); return w; })
    .catch((e) => { delete tess[langs]; throw e; }));
}
const clean = (t) => (t.includes('«') || !/[\u0600-\u06FF]/.test(t) ? t : t.replace(/»/g, '،')).replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+([،.؛:؟!])/g, '$1').trim();
const LATIN = /[A-Za-z]/;
const ARABIC_CH = /[؀-ۿ]/;
const JUNK = /[A-Za-z0-9[\]{}()*:;|\\/<>~&@#$%^_=+]/; // ما يكتبه النموذج العربي حين يقرأ حروفًا لاتينية
const ocrWord = (w) => ({ text: w.text.replace(/[‎‏]/g, '').trim(), conf: w.confidence, bbox: w.bbox });
function overlapX(a, b) {
  const o = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return o <= 0 ? 0 : o / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
}
/** يرتّب كلمات السطر من اليمين إلى اليسار، ويُبقي كل مقطع لاتيني متصل بترتيبه من اليسار إلى اليمين. */
function orderItems(words) {
  const out = []; let run = [];
  const flush = () => { out.push(...run.reverse()); run = []; };
  for (const w of [...words].sort((a, b) => b.bbox.x1 - a.bbox.x1)) {
    if (LATIN.test(w.text) && !ARABIC_CH.test(w.text)) run.push(w); else { flush(); out.push(w); }
  }
  flush();
  return out;
}
const orderWords = (words) => orderItems(words).map((w) => w.text).join(' ');
/** يجمع كلمات السطر الواحد في أسطر، ويرتّب كل سطر بترتيب القراءة (العربي من اليمين، واللاتيني من اليسار). */
function readingLines(items) {
  const lines = [];
  for (const it of [...items].sort((p, q) => p.cy - q.cy)) {
    const ln = lines.find((l) => Math.abs(l.cy - it.cy) < Math.min(l.h, it.h) * 0.5);
    if (ln) ln.items.push(it); else lines.push({ cy: it.cy, h: it.h, items: [it] });
  }
  return lines.map((l) => (isArabic(l.items.map((i) => i.text).join('')) ? orderItems(l.items) : l.items.sort((p, q) => p.bbox.x0 - q.bbox.x0)));
}
/** يصل أجزاء السطر بمسافة فقط حيث توجد فجوة حقيقية على الصفحة. */
function joinByGap(items) {
  return items.reduce((acc, it, i) => {
    if (!i) return it.text;
    const p = items[i - 1], gap = Math.max(it.bbox.x0 - p.bbox.x1, p.bbox.x0 - it.bbox.x1);
    return acc + (gap > Math.min(p.h, it.h) * 0.08 ? ' ' : '') + it.text;
  }, '');
}
async function ocrLocal(canvas) {
  if (isLtr()) return ocrLatin(canvas);
  const { data } = await (await getTess('ara')).recognize(canvas);
  const lines = (data.lines || []).filter((l) => l.bbox).map((l) => ({ bbox: l.bbox, words: (l.words || []).map(ocrWord).filter((w) => w.text) }));
  if (lines.some((l) => l.words.some((w) => JUNK.test(w.text)))) {
    const mix = (await (await getTess('ara+eng')).recognize(canvas)).data;
    const latin = (mix.words || []).map(ocrWord)
      .filter((w) => w.conf >= 80 && LATIN.test(w.text) && /^[\p{Script=Latin}\d.,'’\-:;!?()&/+]+$/u.test(w.text));
    for (const lw of latin) {
      const cy = (lw.bbox.y0 + lw.bbox.y1) / 2;
      const line = lines.find((l) => cy >= l.bbox.y0 && cy <= l.bbox.y1);
      if (!line) continue;
      const over = line.words.filter((w) => overlapX(w.bbox, lw.bbox) > 0.3);
      const best = Math.max(0, ...over.map((w) => w.conf));
      if (over.length && !over.some((w) => JUNK.test(w.text)) && lw.conf <= best + 10) continue;
      line.words = line.words.filter((w) => !over.includes(w));
      line.words.push(lw);
    }
  }
  // حروف منفردة بثقة منخفضة غالبًا بقع أو زخارف
  const textLines = lines.map((l) => ({ bbox: l.bbox, text: orderWords(l.words.filter((w) => !(w.conf < 30 && w.text.replace(/[^\p{L}]/gu, '').length <= 2))) }))
    .filter((l) => l.text);
  let paras = linesToParas(textLines);
  if (!paras.length) paras = (data.text || '').split(/\n\s*\n/).map(clean).filter(Boolean);
  // أرقام الصفحات والرموز المنفردة ليست فقرات
  return paras.filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 2);
}
/** الكتب اللاتينية: نموذج إنجليزي وحده، وكلمات كل سطر من اليسار إلى اليمين. */
async function ocrLatin(canvas) {
  const { data } = await (await getTess('eng')).recognize(canvas);
  const lines = (data.lines || []).filter((l) => l.bbox).map((l) => ({
    bbox: l.bbox,
    text: (l.words || []).map(ocrWord).filter((w) => w.text && !(w.conf < 30 && w.text.length <= 2)).sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(' '),
  })).filter((l) => l.text);
  let paras = linesToParas(lines);
  if (!paras.length) paras = (data.text || '').split(/\n\s*\n/).map(clean).filter(Boolean);
  return paras.filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 2);
}
// Tesseract يدمج الفقرات أحيانًا، فنقسمها حسب المسافة العمودية بين الأسطر
function linesToParas(lines) {
  lines = lines.filter((l) => l.text && l.text.trim() && l.bbox).sort((a, b) => a.bbox.y0 - b.bbox.y0);
  if (!lines.length) return [];
  const gaps = lines.slice(1).map((l, i) => l.bbox.y0 - lines[i].bbox.y1).filter((g) => g > 0).sort((a, b) => a - b);
  const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const hts = lines.map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b), mh = hts[Math.floor(hts.length / 2)];
  const limit = Math.max(med * 1.8, mh * 0.6);
  const paras = []; let cur = clean(lines[0].text);
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i].bbox.y0 - lines[i - 1].bbox.y1;
    if (gap > limit) { paras.push(cur); cur = ''; }
    cur = (cur + ' ' + clean(lines[i].text)).trim();
  }
  paras.push(cur);
  return paras.filter(Boolean);
}
async function ocrClaude(canvas) {
  const sample = await cap('sample');
  if (!sample) throw new Error('claude-unavailable');
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  ocrProgress(R.ocrLabel + ' — يقرؤها Claude…', 0.5);
  const res = await sample('The attached image is one scanned page of a book. Transcribe all of its text exactly, in its original language (mostly Arabic), in reading order. Separate paragraphs with one blank line. Output only the transcription: no commentary, no headings you invented, no translation.', { images: [blob], modelTier: 'default' });
  return res.text.split(/\n\s*\n/).map(clean).filter(Boolean);
}
async function runOCR(pages, force) {
  if (R.ocrBusy) return;
  R.ocrBusy = true; const book = R.book, pdf = R.pdf;
  await loadPanel();
  let done = 0;
  try {
    for (const n of pages) {
      if (R.book !== book) break;
      R.ocrLabel = pages.length > 1 ? `الصفحة ${n} (${done + 1} من ${pages.length})` : `الصفحة ${n}`;
      ocrProgress(R.ocrLabel + ' — تجهيز الصورة', 0);
      const k = `${book.id}:${n}`;
      if (!force && await Store.get('ocr', k)) { done++; continue; }
      const canvas = await renderToCanvas(pdf, n, S.settings.ocrEngine === 'claude' && window.claude ? 1600 : 2200);
      let paras, engine = window.claude ? S.settings.ocrEngine : 'local';
      if (engine === 'claude') {
        try { paras = await ocrClaude(canvas); } catch (e) { engine = 'local'; toast('Claude غير متاح هنا، فاستُخدم المحرّك المحلي.'); }
      }
      if (!paras) paras = await ocrLocal(canvas);
      await Store.put('ocr', k, { paras, engine, at: Date.now() });
      // مواضع التظليلات القديمة لا تطابق النص الجديد
      const stale = S.marks.filter((m) => m.bookId === book.id && m.page === n);
      if (stale.length) { S.marks = S.marks.filter((m) => !stale.includes(m)); stale.forEach((m) => Store.del('marks', m.id, true)); changed('marks'); }
      done++;
      if (R.book === book && spreadPages(R.page).includes(n)) await loadPanel();
    }
    toast(pages.length > 1 ? `استُخرج نص ${fmt(done)} صفحة.` : 'استُخرج النص. حدّد أي جملة لتلوينها أو ترجمتها.');
  } catch (e) {
    console.error(e); toast('تعذّر استخراج النص. حاول مرة أخرى.');
  } finally {
    R.ocrBusy = false; R.ocrStatus = '';
    if (R.book === book) loadPanel();
    changed('ocr');
  }
}

// ---------- Selection toolbar: color / underline / translate ----------
const COLORS = { yellow: '#F2C230', green: '#6CC35E', pink: '#EC6E9F', blue: '#5AA2EC' };
let selBar = null, pop = null, curSel = null;
function hideSelBar() { selBar?.remove(); selBar = null; pop?.remove(); pop = null; }
function offsetIn(root, node, off) { const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length; }
function rangeParts(range) {
  const root = $('#ocrText'); if (!root) return [];
  const parts = [];
  root.querySelectorAll('section[data-page] p[data-para]').forEach((p) => {
    if (!range.intersectsNode(p)) return;
    const page = +p.closest('section').dataset.page;
    const len = p.textContent.length;
    const s = p.contains(range.startContainer) ? offsetIn(p, range.startContainer, range.startOffset) : 0;
    const e = p.contains(range.endContainer) ? offsetIn(p, range.endContainer, range.endOffset) : len;
    if (e > s) parts.push({ page, para: +p.dataset.para, start: s, end: e, text: p.textContent.slice(s, e) });
  });
  return parts;
}
document.addEventListener('selectionchange', debounce(() => {
  if (readerEl.hidden) return;
  const sel = getSelection(), root = $('#ocrText');
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const tl = startEl?.closest?.('.textLayer');
  if (tl) {
    const slot = R.slots.find((x) => x.tl === tl);
    const text = selectedPageText(range, tl) || sel.toString().replace(/\s+/g, ' ').trim();
    if (!slot?.page || !text) return;
    const rects = selectionRects(range, slot.node.getBoundingClientRect());
    if (!rects.length) return;
    curSel = { source: 'pdf', page: slot.page, rects, text, rect: range.getBoundingClientRect() };
    showSelBar(curSel.rect, null);
    return;
  }
  if (!root || !root.contains(range.commonAncestorContainer)) return;
  const parts = rangeParts(range); if (!parts.length) return;
  curSel = { parts, text: sel.toString().trim(), rect: range.getBoundingClientRect() };
  showSelBar(curSel.rect, null);
}, 220));
function place(node, rect, gap = 12) {
  document.body.append(node);
  const w = node.offsetWidth, h = node.offsetHeight, vw = innerWidth, vh = innerHeight;
  let top = rect.bottom + gap; if (top + h > vh - 12) top = Math.max(12, rect.top - h - gap);
  let left = rect.left + rect.width / 2 - w / 2; left = Math.max(12, Math.min(vw - w - 12, left));
  node.style.top = top + 'px'; node.style.left = left + 'px';
}
function showSelBar(rect, mark) {
  hideSelBar();
  const group = mark ? S.marks.filter((m) => m.group === mark.group) : null;
  const text = mark ? group.map((m) => m.text).join(' ') : curSel.text;
  const b = el('div', { class: 'sel-bar', role: 'toolbar', 'aria-label': 'خيارات النص المحدد' });
  b.addEventListener('pointerdown', (e) => { if (!e.target.closest('textarea')) e.preventDefault(); });
  b.append(...Object.entries(COLORS).map(([k, c]) => el('button', { class: 'dot', style: `background:${c}`, 'aria-label': `تلوين ${k}`, title: 'تلوين',
    onclick: () => mark ? updateGroup(mark.group, { color: k, style: 'highlight' }) : addMarks('highlight', k) })));
  b.append(el('span', { class: 'sep' }),
    el('button', { onclick: () => mark ? updateGroup(mark.group, { style: mark.style === 'underline' ? 'highlight' : 'underline' }) : addMarks('underline', S.settings.lastColor === 'yellow' ? 'blue' : S.settings.lastColor) }, icon('underline'), mark?.style === 'underline' ? 'تظليل' : 'تسطير'),
    el('button', { onclick: () => translatePop(text, rect) }, icon('translate'), 'ترجمة'),
    el('button', { onclick: () => notePop(mark ? mark.group : addMarks('highlight', 'yellow', true), rect) }, icon('note'), 'ملاحظة'),
    el('button', { onclick: () => copyText(text) }, icon('copy'), 'نسخ'),
    mark ? el('button', { onclick: () => removeGroup(mark.group) }, icon('trash'), 'إزالة') : null);
  place(b, rect); selBar = b;
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('نُسخ النص.'); } catch { toast('تعذّر النسخ تلقائيًا. استخدم قائمة النسخ في iPad.'); }
  hideSelBar();
}
function addMarks(style, color, keepBar) {
  if (!curSel) return null;
  const group = uid(), now = Date.now();
  if (curSel.source === 'pdf') {
    const m = { id: uid(), group, bookId: R.book.id, page: curSel.page, rects: curSel.rects, text: curSel.text, color, style, note: '', created: now };
    S.marks.push(m); Store.put('marks', m.id, m);
    S.settings.lastColor = color; saveSettings();
    getSelection().removeAllRanges(); curSel = null;
    refreshPageMarks();
    if (R.drawer) renderDrawer();
    if (!keepBar) hideSelBar();
    changed('marks');
    return group;
  }
  for (const p of curSel.parts) {
    const m = { id: uid(), group, bookId: R.book.id, page: p.page, para: p.para, start: p.start, end: p.end, text: p.text, color, style, note: '', created: now };
    S.marks.push(m); Store.put('marks', m.id, m);
  }
  S.settings.lastColor = color; saveSettings();
  const parts = curSel.parts;
  getSelection().removeAllRanges(); curSel = null;
  parts.forEach((p) => refreshPara(p.page, p.para));
  if (R.drawer) renderDrawer();
  if (!keepBar) hideSelBar();
  changed('marks');
  return group;
}
function updateGroup(group, patch) {
  for (const m of S.marks.filter((x) => x.group === group)) { Object.assign(m, patch); Store.put('marks', m.id, m); refreshPara(m.page, m.para); }
  refreshPageMarks();
  if (R.drawer) renderDrawer();
  if (patch.color) { S.settings.lastColor = patch.color; saveSettings(); }
  hideSelBar(); changed('marks');
}
function removeGroup(group) {
  const gone = S.marks.filter((x) => x.group === group);
  S.marks = S.marks.filter((x) => x.group !== group);
  gone.forEach((m) => { Store.del('marks', m.id); refreshPara(m.page, m.para); });
  refreshPageMarks();
  if (R.drawer) renderDrawer();
  hideSelBar(); changed('marks'); toast('أُزيل التظليل.');
}
function onMarkTap(e) {
  const mk = e.target.closest('mark'); if (!mk) return;
  const sel = getSelection(); if (sel && !sel.isCollapsed) return;
  const m = S.marks.find((x) => x.id === mk.dataset.id); if (!m) return;
  showSelBar(mk.getBoundingClientRect(), m);
}
const LANGS = { en: 'الإنجليزية', fr: 'الفرنسية', es: 'الإسبانية', tr: 'التركية', ar: 'العربية' };
const LANG_EN = { en: 'English', fr: 'French', es: 'Spanish', tr: 'Turkish', ar: 'Arabic' };
// ---------- Translation chain ----------
// كل الترجمة تجري داخل نافذة مصغّرة في التطبيق، ولا يُفتح المتصفح إلا بزر صريح.
// 1) المساعد الأكاديمي عبر Claude بمفتاح API (يُضاف من النافذة نفسها مرة واحدة).
// 2) بلا مفتاح أو عند التعذّر: ترجمة Google داخل النافذة، ثم MyMemory.
const ACADEMIC_SYSTEM = `You are a senior academic translator specialising in political science, international relations, security and strategic studies, international law, diplomacy and foreign policy.
Translate the user's text into the requested target language with the precision expected in peer-reviewed scholarship:
- Use the established terminology of the field as it appears in reputable academic literature in the target language (for Arabic, the terms used in Arab universities and journals), not literal word-for-word renderings.
- Preserve meaning, nuance, hedging and register; keep proper names, acronyms and titles accurate, adding the original term in parentheses after a key technical term when that helps the reader.
- Keep the paragraph structure.
- If the text is a single term or short expression, give its best equivalent first, then up to three alternative specialised equivalents, each with a few words on when it is used.
Output only the translation (or the term list), with no preamble.`;
const LANG_DEEPL = { en: 'en', fr: 'fr', es: 'es', tr: 'tr', ar: 'ar' };
const claudeAppUrl = (text, to) => `https://claude.ai/new?q=${encodeURIComponent(`ترجم النص التالي ترجمة أكاديمية متخصصة إلى ${LANGS[to]}:\n\n${text.slice(0, 6000)}`)}`;
const deeplUrl = (text, from, to) => `https://www.deepl.com/translator#${from}/${LANG_DEEPL[to]}/${encodeURIComponent(text.slice(0, 5000).replace(/\//g, '\\/'))}`;
const googleUrl = (text, to) => `https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(text.slice(0, 4000))}&op=translate`;
let anthropicMod = null;
async function claudeClient() {
  anthropicMod ||= import('./vendor/anthropic-sdk.mjs').catch((e) => { anthropicMod = null; throw e; });
  const { default: Anthropic } = await anthropicMod;
  return { Anthropic, client: new Anthropic({ apiKey: S.settings.claudeKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
}
/** ترجمة أكاديمية داخل التطبيق عبر Claude، تُعرض أثناء كتابتها. */
async function translateClaudeApi(text, to, onText, signal) {
  const { Anthropic, client } = await claudeClient();
  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: ACADEMIC_SYSTEM,
      messages: [{ role: 'user', content: `Target language: ${LANG_EN[to]}\n\n<text>\n${text}\n</text>` }],
    }, { signal });
    stream.on('text', (_delta, snapshot) => onText(snapshot));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { reason: 'رفض الطلب' });
    return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) e.reason = 'مفتاح Claude غير صالح';
    else if (e instanceof Anthropic.RateLimitError) e.reason = 'تجاوز حد الاستخدام مؤقتًا';
    else if (e instanceof Anthropic.APIConnectionError) e.reason = 'تعذّر الاتصال';
    else if (e instanceof Anthropic.APIError) e.reason = 'خطأ من خدمة Claude';
    throw e;
  }
}
async function translatePop(text, rect) {
  hideSelBar();
  const to = isArabic(text) ? S.settings.translateTo : 'ar';
  const from = isArabic(text) ? 'ar' : 'en';
  const online = navigator.onLine !== false;
  const hasKey = !!S.settings.claudeKey;
  const ctrl = new AbortController();
  const badge = el('span', { class: 'tr-badge' }, '');
  const out = el('div', { class: 'out', dir: to === 'ar' ? 'rtl' : 'ltr', lang: to }, 'جارٍ الترجمة…');
  const note = el('div', { class: 'tr-note', hidden: true });
  const link = (href, label) => el('a', { class: 'tr-ext', href, target: '_blank', rel: 'noopener' }, label);
  // تفعيل المساعد الأكاديمي من النافذة نفسها: يُلصق المفتاح مرة واحدة ثم تُعاد الترجمة في مكانها
  const keyIn = el('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'مفتاح Claude API', style: 'direction:ltr' });
  const activate = el('div', { class: 'tr-activate', hidden: true },
    el('div', {}, 'لتظهر هنا ترجمة المساعد الأكاديمي المتخصصة، الصق مفتاح Claude API مرة واحدة (من console.anthropic.com). يُحفظ على هذا الجهاز فقط.'),
    el('div', { class: 'row' }, keyIn, el('button', { class: 'btn primary', onclick: () => {
      const v = keyIn.value.trim(); if (!v) return keyIn.focus();
      S.settings.claudeKey = v; saveSettings(); ctrl.abort(); hideSelBar(); translatePop(text, rect);
    } }, 'تفعيل')));
  const p = el('div', { class: 'pop', role: 'dialog', 'aria-label': 'الترجمة' },
    el('h3', {}, el('span', {}, `الترجمة إلى ${LANGS[to]}`), badge,
      el('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => { ctrl.abort(); hideSelBar(); } }, icon('close'))),
    el('div', { class: 'src', lang: from }, text), out, note, activate,
    el('div', { class: 'row tr-actions' },
      el('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(out.textContent); toast('نُسخت الترجمة.'); } catch { toast('تعذّر النسخ.'); } } }, icon('copy'), 'نسخ'),
      el('span', { class: 'tr-ext-l' }, 'فتح خارج التطبيق:'),
      link(claudeAppUrl(text, to), 'Claude'), link(deeplUrl(text, from, to), 'DeepL'), link(googleUrl(text, to), 'Google')));
  place(p, rect); pop = p;
  const setBadge = (t) => { badge.textContent = t; };
  const fallbackNote = (t) => { note.hidden = false; note.textContent = t; };
  if (!online) { out.textContent = 'الترجمة تحتاج اتصالًا بالإنترنت.'; return; }

  // 1) Claude داخل التطبيق: عبر حساب Claude حين يُفتح التطبيق داخله، أو بمفتاح API
  const sample = await cap('sample');
  if (!sample && !hasKey) activate.hidden = false;
  if (sample || hasKey) {
    setBadge('المساعد الأكاديمي · Claude');
    try {
      let result;
      if (sample) {
        result = (await sample(`${ACADEMIC_SYSTEM}\n\nTarget language: ${LANG_EN[to]}\n<text>\n${text}\n</text>`, {
          modelTier: 'quick', onText: ({ text: t }) => { if (t) out.textContent = t; } })).text.trim();
      } else {
        result = await translateClaudeApi(text, to, (t) => { if (t) out.textContent = t; }, ctrl.signal);
      }
      if (pop !== p) return;
      out.textContent = result;
      return;
    } catch (e) {
      if (ctrl.signal.aborted || pop !== p) return;
      console.warn('claude translation failed', e);
      fallbackNote(`تعذّرت الترجمة عبر Claude (${e.reason || 'خطأ غير متوقع'}). هذه ترجمة بديلة.`);
      if (e.reason === 'مفتاح Claude غير صالح') activate.hidden = false;
    }
  }

  // 2) ترجمة سريعة داخل النافذة: Google ثم MyMemory
  setBadge('ترجمة سريعة · Google');
  try { out.textContent = await translateGoogle(text, to); return; }
  catch (e) { if (ctrl.signal.aborted || pop !== p) return; console.warn('google translation failed', e); }
  setBadge('ترجمة سريعة · MyMemory');
  try { out.textContent = await translateFree(text, from === 'ar' ? 'ar' : 'Autodetect', to); }
  catch { out.textContent = 'تعذّرت الترجمة الآن. حاول مجددًا بعد قليل.'; setBadge(''); }
}
/** ترجمة Google السريعة، تُعرض داخل النافذة دون فتح المتصفح. */
async function translateGoogle(text, to) {
  const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text.slice(0, 4500))}`);
  if (!res.ok) throw new Error('google ' + res.status);
  const j = await res.json();
  const t = (j?.[0] || []).map((x) => x?.[0] || '').join('').trim();
  if (!t) throw new Error('google empty');
  return t;
}
/** ترجمة مجانية عبر خدمة MyMemory، على دفعات لا تتجاوز 450 حرفًا. */
async function translateFree(text, from, to) {
  const parts = []; let cur = '';
  for (const piece of text.split(/(?<=[.!?؟،؛\n])\s+/)) {
    if ((cur + ' ' + piece).length > 450 && cur) { parts.push(cur); cur = piece; } else cur = (cur + ' ' + piece).trim();
  }
  if (cur) parts.push(cur);
  const out = [];
  for (const q of parts) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q.slice(0, 480))}&langpair=${from}|${to}`);
    const j = await res.json();
    if (j.responseStatus !== 200 && j.responseStatus !== '200') throw new Error(j.responseDetails || 'translate failed');
    out.push(j.responseData.translatedText);
  }
  return out.join(' ');
}
function notePop(group, rect) {
  hideSelBar(); if (!group) return;
  const ms = S.marks.filter((m) => m.group === group);
  const ta = el('textarea', { 'aria-label': 'نص الملاحظة', placeholder: 'اكتب ملاحظتك… (تُحفظ تلقائيًا)', value: ms[0]?.note || '' });
  ta.addEventListener('input', () => {
    for (const m of ms) { m.note = ta.value; saveLater('mark:' + m.id, () => Store.put('marks', m.id, m), 400); }
    saveLater('notepara:' + group, () => { ms.forEach((m) => refreshPara(m.page, m.para)); refreshPageMarks(); changed('marks'); if (R.drawer) renderDrawer(); }, 600);
  });
  const p = el('div', { class: 'pop', role: 'dialog', 'aria-label': 'ملاحظة' },
    el('h3', {}, el('span', {}, 'ملاحظة على التظليل'), el('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => { hideSelBar(); ms.forEach((m) => refreshPara(m.page, m.para)); } }, icon('close'))),
    el('div', { class: 'src', lang: 'ar' }, ms.map((m) => m.text).join(' ')), ta);
  place(p, rect); pop = p; setTimeout(() => ta.focus(), 50);
}
document.addEventListener('pointerdown', (e) => {
  if ((selBar && selBar.contains(e.target)) || (pop && pop.contains(e.target))) return;
  if (selBar && !pop) setTimeout(() => { const s = getSelection(); if (!s || s.isCollapsed) { selBar?.remove(); selBar = null; } }, 250);
  else if (pop) hideSelBar();
});

// ---------- Notes ----------
function newNote(sample) {
  const pages = (sample?.pages || [{ text: '', strokes: [] }]).map((p) => ({ id: uid(), ...p }));
  const n = { id: uid(), title: sample?.title || 'ملاحظة جديدة', created: Date.now(), updated: Date.now(), paper: 'lined', pages };
  S.notes.push(n); Store.put('notes', n.id, noteForSave(n)); S.noteId = n.id; changed('notes');
  return n;
}
let noteInks = [], activeInk = null;
function renderNotes() {
  const q = S.noteQuery.trim();
  const notes = [...S.notes].sort((a, b) => b.updated - a.updated).filter((n) => !q || (n.title + ' ' + n.pages.map((p) => p.text).join(' ')).includes(q));
  if (!S.noteId || !S.notes.some((n) => n.id === S.noteId)) S.noteId = notes[0]?.id || null;
  const search = el('input', { class: 'input', type: 'search', placeholder: 'بحث في الملاحظات', 'aria-label': 'بحث', value: S.noteQuery, id: 'noteSearch' });
  search.addEventListener('input', debounce(() => { S.noteQuery = search.value; renderNotes(); $('#noteSearch')?.focus(); }, 250));
  const tabs = el('div', { class: 'seg' },
    el('button', { 'aria-pressed': String(S.notesTab === 'notebook'), onclick: () => { S.notesTab = 'notebook'; renderNotes(); } }, 'الدفتر'),
    el('button', { 'aria-pressed': String(S.notesTab === 'annos'), onclick: () => { S.notesTab = 'annos'; renderNotes(); } }, `من الكتب (${fmt(new Set(S.marks.map((m) => m.group)).size)})`));
  const list = el('div', { class: 'notes-items' });
  if (S.notesTab === 'notebook') {
    notes.forEach((n) => list.append(el('button', { class: 'note-item', 'aria-current': String(n.id === S.noteId), onclick: () => { S.noteId = n.id; renderNotes(); } },
      el('b', {}, n.title || 'بدون عنوان'),
      el('small', {}, new Date(n.updated).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long' }) + ' · ' + (n.pages.map((p) => p.text).join(' ').trim().slice(0, 60) || `${n.pages.length} صفحة`)))));
    if (!notes.length) list.append(el('p', { class: 'muted', style: 'padding:12px' }, q ? 'لا نتائج.' : 'لا توجد ملاحظات.'));
  } else {
    const groups = groupMarks().filter((g) => !q || (g.text + g.note).includes(q));
    groups.forEach((g) => {
      const b = S.books.find((x) => x.id === g.bookId);
      list.append(el('button', { class: 'note-item anno-item', 'data-color': g.color, onclick: () => openReader(g.bookId, g.page, !g.rects) },
        el('q', {}, g.text.length > 140 ? g.text.slice(0, 140) + '…' : g.text),
        g.note ? el('small', { style: 'white-space:normal;color:var(--ink)' }, '✎ ' + g.note) : null,
        el('small', {}, `${b?.title || 'كتاب محذوف'} · صفحة ${g.page}${g.style === 'underline' ? ' · تسطير' : ''}`)));
    });
    if (!groups.length) list.append(el('p', { class: 'muted', style: 'padding:12px;line-height:1.8' }, 'ظلّل نصًا داخل أي كتاب وسيظهر هنا مع ملاحظاتك.'));
  }
  const side = el('section', { class: 'notes-list' },
    el('div', { class: 'notes-list-head' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('h1', {}, 'الملاحظات'),
        el('button', { class: 'btn primary', onclick: () => { S.notesTab = 'notebook'; newNote(); renderNotes(); } }, icon('plus'), 'جديدة')),
      tabs, search),
    list);
  const note = S.notes.find((n) => n.id === S.noteId);
  const editor = el('section', { class: 'notes-editor' });
  if (note && S.notesTab === 'notebook') buildEditor(editor, note);
  else editor.append(el('div', { class: 'empty' }, S.notesTab === 'annos' ? 'اختر تظليلًا لفتح الكتاب على صفحته.' : 'أنشئ ملاحظة جديدة لتكتب بلوحة المفاتيح أو بالقلم.'));
  main.replaceChildren(el('div', { class: 'notes-layout' }, side, editor));
}
function groupMarks() {
  const m = new Map();
  for (const x of [...S.marks].sort((a, b) => b.created - a.created)) {
    if (!m.has(x.group)) m.set(x.group, { ...x, text: '' });
    const g = m.get(x.group); g.text = (g.text + ' ' + x.text).trim();
  }
  return [...m.values()];
}
function buildEditor(host, note) {
  noteInks = []; activeInk = null;
  const touch = () => { note.updated = Date.now(); saveNote(note); };
  const title = el('input', { class: 'title-in', value: note.title, 'aria-label': 'عنوان الملاحظة', id: 'noteTitle' });
  title.addEventListener('input', () => { note.title = title.value; touch(); saveLater('notes-list', () => changed('notes'), 800); });
  const drawing = S.noteMode === 'draw';
  let delStage = false;
  const delBtn = el('button', { class: 'btn ghost danger', onclick: () => {
    if (!delStage) { delStage = true; delBtn.lastChild.textContent = 'اضغط مرة أخرى للحذف'; setTimeout(() => { delStage = false; if (delBtn.isConnected) delBtn.lastChild.textContent = 'حذف'; }, 3000); return; }
    S.notes = S.notes.filter((n) => n.id !== note.id); Store.del('notes', note.id);
    note.pages.forEach((p) => Store.del('ink', 'np:' + p.id, true)); S.noteId = null; changed('notes'); renderNotes(); toast('حُذفت الملاحظة.');
  } }, icon('trash'), el('span', {}, 'حذف'));
  const bar = el('div', { class: 'editor-bar' }, title,
    el('div', { class: 'seg', role: 'group', 'aria-label': 'وضع الإدخال' },
      el('button', { 'aria-pressed': String(!drawing), onclick: () => { S.noteMode = 'type'; renderNotes(); } }, 'كتابة'),
      el('button', { 'aria-pressed': String(drawing), onclick: () => { S.noteMode = 'draw'; renderNotes(); } }, 'رسم بالقلم')),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'نوع الورق' },
      ...[['lined', 'مسطّر'], ['grid', 'مربعات'], ['plain', 'سادة']].map(([k, l]) => el('button', { 'aria-pressed': String(note.paper === k), onclick: () => { note.paper = k; touch(); host.querySelectorAll('.note-page').forEach((p) => p.dataset.paper = k); bar.querySelectorAll('[data-paper-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paperBtn === k))); }, 'data-paper-btn': k }, l))),
    delBtn);
  const scroll = el('div', { class: 'editor-scroll' });
  if (drawing) { const pb = penBar(() => activeInk || noteInks[0]); pb.style.cssText = 'position:sticky;top:0;transform:none;left:auto;margin:0 auto 18px;width:max-content'; scroll.append(pb); }
  const ro = new ResizeObserver((ents) => ents.forEach((en) => en.target._ink?.resize()));
  note.pages.forEach((pg, i) => {
    const ta = el('textarea', { 'aria-label': `نص الصفحة ${i + 1}`, placeholder: i === 0 ? 'اكتب هنا…' : '', value: pg.text, readonly: drawing });
    ta.addEventListener('input', () => { pg.text = ta.value; touch(); });
    const inkHost = el('div');
    const page = el('div', { class: 'note-page', 'data-paper': note.paper }, ta, inkHost, el('div', { class: 'page-no' }, `${i + 1}`));
    if (note.pages.length > 1) page.append(el('button', { class: 'icon-btn del-page', 'aria-label': 'حذف الصفحة', title: 'حذف الصفحة', onclick: () => { const [gone] = note.pages.splice(i, 1); Store.del('ink', 'np:' + gone.id, true); touch(); renderNotes(); } }, icon('trash')));
    const ink = new Ink(inkHost, { blend: false, onStart: (k) => { activeInk = k; }, onCommit: (s) => { pg.strokes = s.slice(); saveNoteInk(pg); touch(); } });
    ink.load(pg.strokes); ink.setEnabled(drawing); page._ink = ink; noteInks.push(ink);
    ro.observe(page); scroll.append(page);
  });
  scroll.append(el('div', { style: 'text-align:center' }, el('button', { class: 'btn', onclick: () => { note.pages.push({ id: uid(), text: '', strokes: [] }); touch(); renderNotes(); requestAnimationFrame(() => { const s = $('.editor-scroll'); s && (s.scrollTop = s.scrollHeight); }); } }, icon('plus'), 'صفحة جديدة')));
  host.append(bar, scroll);
}

// ---------- Stats ----------
function lastDays(n) { const out = []; const d = new Date(); d.setHours(12); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x); } return out; }
function streak() {
  let s = 0; const d = new Date(); d.setHours(12);
  if (!((S.daily[dayKey(d)]?.sec || 0) >= 60)) d.setDate(d.getDate() - 1);
  while ((S.daily[dayKey(d)]?.sec || 0) >= 60) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return v; }
function barChart(days) {
  const W = 640, H = 230, padL = 36, padR = 8, padT = 22, padB = 40, n = days.length;
  const vals = days.map((d) => (S.daily[dayKey(d)]?.sec || 0) / 60);
  const max = niceMax(Math.max(...vals, 1));
  const iw = W - padL - padR, ih = H - padT - padB, bw = iw / n;
  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'دقائق القراءة في آخر 14 يومًا' });
  for (const t of [0, max / 2, max]) {
    const y = padT + ih - (t / max) * ih;
    svg.append(el('line', { class: 'grid', x1: padL, x2: W - padR, y1: y, y2: y }));
    svg.append(el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, fmt(t)));
  }
  days.forEach((d, i) => {
    // الزمن يجري من اليمين إلى اليسار: الأقدم يمينًا واليوم يسارًا
    const x = padL + (n - 1 - i) * bw, v = vals[i], h = (v / max) * ih, y = padT + ih - h;
    const today = i === n - 1;
    svg.append(el('rect', { class: 'bar' + (today ? ' today' : ''), x: x + bw * 0.18, y, width: bw * 0.64, height: Math.max(h, v > 0 ? 2 : 0), rx: 3 }));
    if (v >= 1) svg.append(el('text', { class: 'val', x: x + bw / 2, y: y - 6, 'text-anchor': 'middle' }, fmt(v)));
    if (i % 2 === (n - 1) % 2) {
      svg.append(el('text', { x: x + bw / 2, y: H - padB + 18, 'text-anchor': 'middle' }, today ? 'اليوم' : d.toLocaleDateString('ar-u-nu-latn', { weekday: 'short' })));
      svg.append(el('text', { x: x + bw / 2, y: H - padB + 34, 'text-anchor': 'middle' }, fmt(d.getDate())));
    }
  });
  return svg;
}
function renderStats() {
  const days7 = lastDays(7), days14 = lastDays(14);
  const sum = (days, f) => days.reduce((a, d) => a + f(S.daily[dayKey(d)] || { sec: 0, pages: [] }), 0);
  const weekMin = sum(days7, (r) => r.sec) / 60;
  const prevWeekMin = lastDays(14).slice(0, 7).reduce((a, d) => a + (S.daily[dayKey(d)]?.sec || 0), 0) / 60;
  const weekPages = sum(days7, (r) => r.pages.length);
  const groups = groupMarks();
  const tile = (k, v, unit, extra) => el('div', { class: 'tile' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, fmt(v), unit ? el('small', {}, unit) : null), extra ? el('div', { class: 'muted', style: 'font-size:12.5px' }, extra) : null);
  const delta = weekMin - prevWeekMin;
  const books = [...S.books].sort((a, b) => (b.seen.length / b.pages) - (a.seen.length / a.pages));
  const byColor = Object.keys(COLORS).map((c) => [c, groups.filter((g) => g.color === c).length]);
  const totalMarks = groups.length || 1;
  const colorNames = { yellow: 'أصفر', green: 'أخضر', pink: 'وردي', blue: 'أزرق' };
  const view = el('div', { class: 'view' }, el('div', { class: 'view-inner' },
    el('div', { class: 'view-head' }, el('div', {}, el('h1', {}, 'إحصائيات القراءة'), el('div', { class: 'sub' }, 'تتحدّث تلقائيًا أثناء القراءة والتظليل والكتابة.'))),
    el('div', { class: 'tiles' },
      tile('القراءة هذا الأسبوع', weekMin, 'دقيقة', prevWeekMin || weekMin ? `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} عن الأسبوع الماضي` : null),
      tile('صفحات هذا الأسبوع', weekPages, 'صفحة'),
      tile('أيام متتالية', streak(), 'يوم', 'يُحتسب اليوم بدقيقة قراءة واحدة على الأقل'),
      tile('التظليلات', groups.length, null, `${fmt(groups.filter((g) => g.note).length)} منها بملاحظة`),
      tile('الملاحظات', S.notes.length, null, `${fmt(S.notes.reduce((a, n) => a + n.pages.length, 0))} صفحة في الدفتر`)),
    el('div', { class: 'cards' },
      el('div', { class: 'card', style: 'grid-column:1/-1' }, el('h2', {}, 'دقائق القراءة يوميًا'), el('div', { class: 'hint' }, 'آخر 14 يومًا. العمود الداكن هو اليوم.'), el('div', { style: 'overflow-x:auto' }, barChart(days14))),
      el('div', { class: 'card' }, el('h2', {}, 'التقدّم في الكتب'), el('div', { class: 'hint' }, 'نسبة الصفحات التي فُتحت من كل كتاب.'),
        books.length ? books.map((b) => {
          const pct = Math.round((b.seen.length / b.pages) * 100);
          return el('div', { class: 'pbar' }, el('div', { class: 't' }, b.title), el('div', { class: 'n' }, `${pct}% · ${fmt(b.seen.length)}/${fmt(b.pages)} · ${fmt((b.secs || 0) / 60)} د`), el('div', { class: 'track' }, el('i', { style: `width:${pct}%` })));
        }) : el('p', { class: 'muted' }, 'أضف كتابًا لترى تقدّمك.')),
      el('div', { class: 'card' }, el('h2', {}, 'التظليلات حسب اللون'), el('div', { class: 'hint' }, 'استخدم الألوان لتصنيف ما تقرؤه: تعريفات، أفكار، أسئلة…'),
        byColor.map(([c, v]) => el('div', { class: 'pbar' }, el('div', { class: 't' }, colorNames[c]), el('div', { class: 'n' }, fmt(v)), el('div', { class: 'track' }, el('i', { style: `width:${(v / totalMarks) * 100}%;background:${COLORS[c]}` })))))),
  ));
  const keep = main.querySelector('.view')?.scrollTop || 0;
  main.replaceChildren(view); view.scrollTop = keep;
}

// ---------- Settings ----------
function renderSettings() {
  const st = S.settings;
  const seg = (opts, cur, set) => el('div', { class: 'seg' }, ...opts.map(([k, l]) => el('button', { 'aria-pressed': String(cur === k), onclick: () => { set(k); saveSettings(); renderSettings(); } }, l)));
  const usage = el('span', { class: 'muted num', style: 'font-size:14px' }, '');
  if (Cloud.ok) cap('assets').then((a) => a?.list()).then((r) => { if (r?.usage) usage.textContent = `الكتب المرفوعة: ${fmt(r.usage.bytes / 1048576)} م.ب من ${fmt(r.usage.maxBytes / 1048576)} م.ب`; }).catch(() => {});
  else navigator.storage?.estimate?.().then((e) => { usage.textContent = `المستخدم ${(e.usage / 1048576).toFixed(1)} م.ب`; }).catch(() => {});
  const view = el('div', { class: 'view' }, el('div', { class: 'view-inner' },
    el('div', { class: 'view-head' }, el('div', {}, el('h1', {}, 'الإعدادات'), el('div', { class: 'sub' }, Cloud.ok ? 'كل التغييرات تُحفظ فورًا في حسابك.' : 'كل التغييرات تُحفظ فورًا على هذا الجهاز.'))),
    el('div', { class: 'settings' },
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'مكان الحفظ'),
        el('span', {}, Cloud.ok ? 'حسابك في Claude. تبقى مكتبتك بعد إغلاق التطبيق وتظهر على أجهزتك الأخرى. ملفات PDF حتى 20 م.ب تُرفع إلى حسابك، والأكبر تبقى على الجهاز الذي أُضيفت منه.'
          : 'على هذا الـ iPad نفسه، وتبقى بعد إغلاق التطبيق. لا تحذف التطبيق من الشاشة الرئيسية لأن حذفه يحذف مكتبته، وصدّر نسخة احتياطية من حين لآخر.')), usage),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'مظهر التطبيق'), el('span', {}, 'شكل الرفوف نفسها تختاره من زر «تخصيص» في المكتبة.')),
        seg(SKINS, st.skin, (k) => { st.skin = k; applySkin(); })),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'عرض الصفحات'), el('span', {}, 'التلقائي يعرض صفحتين متقابلتين حين يكون الـ iPad أفقيًا، وصفحة واحدة حين يكون عموديًا.')),
        seg([['auto', 'تلقائي'], ['single', 'صفحة واحدة'], ['double', 'صفحتان']], st.pageMode, (k) => { st.pageMode = k; })),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'قلب الصفحة'), el('span', {}, 'الواقعي ينحني كالورق ويتبع إصبعك حين تسحب طرف الصفحة.')),
        seg([['curl', 'واقعي'], ['slide', 'انزلاق'], ['none', 'دون حركة']], st.turnAnim, (k) => { st.turnAnim = k; })),
      translationSettings(),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'لغة الترجمة'), el('span', {}, 'يُترجم النص العربي إليها، ويُترجم غير العربي إلى العربية.')),
        seg([['en', 'الإنجليزية'], ['fr', 'الفرنسية'], ['es', 'الإسبانية'], ['tr', 'التركية']], st.translateTo, (k) => { st.translateTo = k; })),
      !window.claude ? null : el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'محرّك استخراج النص'), el('span', {}, 'المحلي يعمل دون إنترنت ولا يرسل الصفحة. Claude أدقّ مع الخطوط العربية الصعبة.')),
        seg([['local', 'على الجهاز'], ['claude', 'Claude']], st.ocrEngine, (k) => { st.ocrEngine = k; })),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'الرسم بـ Apple Pencil فقط'), el('span', {}, 'يتجاهل لمس الإصبع وراحة اليد أثناء الكتابة، ويبقى الإصبع لتقليب الصفحات.')),
        seg([[true, 'مفعّل'], [false, 'الإصبع يرسم أيضًا']], st.penOnly, (k) => { st.penOnly = k; })),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'حجم خط النص المستخرج'), el('span', { class: 'num' }, `${st.readSize} بكسل`)),
        el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => { setReadSize(-2); renderSettings(); } }, 'أصغر'), el('button', { class: 'btn', onclick: () => { setReadSize(2); renderSettings(); } }, 'أكبر'))),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'نسخة احتياطية'), el('span', {}, 'تصدير الملاحظات والتظليلات والكتابة بالقلم والإحصائيات في ملف واحد. ملفات PDF نفسها لا تُضمَّن.')),
        el('div', { class: 'row' }, el('button', { class: 'btn', onclick: exportBackup }, 'تصدير'), el('button', { class: 'btn', onclick: () => $('#backupIn').click() }, 'استيراد'))),
      el('div', { class: 'set-row' }, el('div', { class: 'l' }, el('b', {}, 'على iPad'), el('span', {}, isInstalled() ? 'التطبيق مثبّت على الشاشة الرئيسية ويعمل دون إنترنت.' : 'افتح رابط التطبيق في Safari، ثم «مشاركة» ← «إضافة إلى الشاشة الرئيسية». يفتح بعدها مباشرة بملء الشاشة ويعمل دون إنترنت.')))),
  ));
  main.replaceChildren(view);
}
function translationSettings() {
  const st = S.settings;
  const key = el('input', { class: 'input', type: 'password', id: 'claudeKey', placeholder: 'sk-ant-…', value: st.claudeKey, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'مفتاح Claude API', style: 'max-width:280px;direction:ltr' });
  const status = el('span', { class: 'muted', style: 'font-size:13px' }, st.claudeKey ? 'المفتاح محفوظ على هذا الجهاز فقط.' : 'بلا مفتاح: تظهر ترجمة سريعة في النافذة نفسها.');
  const save = () => { st.claudeKey = key.value.trim(); saveSettings(); status.textContent = st.claudeKey ? 'حُفظ المفتاح على هذا الجهاز فقط.' : 'أُزيل المفتاح.'; };
  key.addEventListener('change', save);
  const test = el('button', { class: 'btn', onclick: async () => {
    save(); if (!st.claudeKey) return;
    status.textContent = 'جارٍ الاختبار…';
    try { const r = await translateClaudeApi('sovereignty', 'ar', () => {}); status.textContent = `يعمل. مثال: sovereignty ← ${r.split('\n')[0].slice(0, 40)}`; }
    catch (e) { status.textContent = `لم ينجح: ${e.reason || 'خطأ غير متوقع'}.`; }
  } }, 'اختبار');
  return el('div', { class: 'set-row' },
    el('div', { class: 'l' }, el('b', {}, 'المترجم الافتراضي: المساعد الأكاديمي (Claude)'),
      el('span', {}, 'يترجم بمصطلحات العلوم السياسية والعلاقات الدولية والدراسات الأمنية والقانون الدولي، داخل نافذة مصغّرة فوق الصفحة دون مغادرة التطبيق. يحتاج مفتاح Claude API (من console.anthropic.com)؛ وبدونه أو عند التعذّر تظهر ترجمة Google السريعة في النافذة نفسها.'),
      el('div', { class: 'row', style: 'margin-top:10px' }, key, test), status));
}
async function exportBackup() {
  const dump = { app: 'raff', version: 1, at: new Date().toISOString(), settings: { ...S.settings, claudeKey: '' }, books: S.books, shelves: S.shelves, notes: S.notes, marks: S.marks, daily: Object.values(S.daily), ink: {}, ocr: {} };
  for (const s of ['ink', 'ocr']) for (const k of await Store.keys(s)) dump[s][k] = await Store.get(s, k);
  const data = JSON.stringify(dump);
  const dl = await cap('downloads');
  if (!dl) {
    const file = new File([data], `raff-backup-${dayKey()}.json`, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'نسخة رفّ الاحتياطية' }); toast('اختر «حفظ في الملفات» لحفظ النسخة.'); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    const a = el('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove();
    toast('صُدّرت النسخة الاحتياطية.');
    return;
  }
  try { await dl.save({ filename: `raff-backup-${dayKey()}.json`, data: new Blob([data], { type: 'application/json' }) }); toast('صُدّرت النسخة الاحتياطية.'); }
  catch (e) { if (e?.code !== 'declined') toast('لم يكتمل التصدير.'); }
}
$('#backupIn').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (d.app !== 'raff') throw 0;
    for (const b of d.books || []) { const cur = S.books.find((x) => x.id === b.id); if (cur) { Object.assign(cur, b); await Store.put('books', b.id, cur); } }
    for (const n of d.notes || []) {
      n.pages.forEach((p) => { p.id ||= uid(); p.strokes ||= []; });
      S.notes = S.notes.filter((x) => x.id !== n.id).concat(n);
      await Store.put('notes', n.id, noteForSave(n));
      for (const p of n.pages) if (p.strokes.length) await Store.put('ink', 'np:' + p.id, p.strokes, true);
    }
    for (const m of d.marks || []) { S.marks = S.marks.filter((x) => x.id !== m.id).concat(m); await Store.put('marks', m.id, m); }
    for (const r of d.daily || []) { S.daily[r.date] = r; await Store.put('daily', r.date, r); }
    for (const s of ['ink', 'ocr']) for (const [k, v] of Object.entries(d[s] || {})) await Store.put(s, k, s === 'ink' ? unpackInk(v) : v, true);
    for (const sh of d.shelves || []) { S.shelves = S.shelves.filter((x) => x.id !== sh.id).concat(sh); await Store.put('shelves', sh.id, sh, true); }
    changed('import'); toast('استُعيدت النسخة الاحتياطية.'); showView(S.view);
  } catch { toast('الملف ليس نسخة احتياطية من رفّ.'); }
});

// ---------- Boot ----------
addEventListener('visibilitychange', () => { if (document.hidden) flushLater(); });
addEventListener('pagehide', flushLater);

/** أول تشغيل داخل Claude: ينقل ما كان محفوظًا في هذا المتصفح إلى حسابك. */
async function migrateLocalToCloud() {
  const [books, notes] = await Promise.all([Local.all('books'), Local.all('notes')]);
  if (!books.length && !notes.length) return false;
  for (const s of ['shelves', 'notes', 'marks', 'ocr', 'daily', 'ink']) {
    for (const k of await Local.keys(s)) {
      const v = await Local.get(s, k);
      if (v != null) await Cloud.put(s, k, s === 'ink' ? packInk(v) : v).catch(() => {});
    }
  }
  const settings = await Local.get('meta', 'settings');
  if (settings) await Cloud.put('meta', 'settings', settings).catch(() => {});
  for (const b of books) {
    const buf = await Local.get('files', b.id);
    if (buf && !b.assetId) await storeBookFile(b, buf);
    await Cloud.put('books', b.id, b).catch(() => {});
  }
  return true;
}

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.claude) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  // عند نزول تحديث جديد يُعاد تحميل التطبيق مرة واحدة ليعمل بالنسخة الجديدة.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && R.book == null) location.reload(); });
}
(async function boot() {
  navigator.storage?.persist?.().catch(() => {});
  main.replaceChildren(el('div', { class: 'empty' }, 'جارٍ تحميل مكتبتك…'));
  await Local.open();
  if (await Cloud.init()) {
    const [cb, cn] = await Promise.all([Cloud.keys('books').catch(() => []), Cloud.keys('notes').catch(() => [])]);
    if (!cb.length && !cn.length && await migrateLocalToCloud()) toast('نُقلت مكتبتك إلى حسابك في Claude.');
  }
  const [books, shelves, notes, marks, daily, settings] = await Promise.all(
    [Store.all('books'), Store.all('shelves'), Store.all('notes'), Store.all('marks'), Store.all('daily'), Store.get('meta', 'settings')]);
  S.books = books; S.shelves = shelves; S.notes = notes; S.marks = marks;
  for (const d of daily) S.daily[d.date] = d;
  for (const n of S.notes) for (const pg of n.pages) pg.id ||= uid();
  await Promise.all(S.notes.flatMap((n) => n.pages.map(async (pg) => {
    const ink = await Store.get('ink', 'np:' + pg.id);
    pg.strokes = ink || pg.strokes || [];
  })));
  if (settings) S.settings = { ...structuredClone(DEFAULTS), ...settings, pen: { ...DEFAULTS.pen, ...(settings.pen || {}) } };
  applySkin();
  woodTexture();
  setSaveState('saved');
  showView('library');
  if (!S.settings.seeded) {
    S.settings.seeded = true; saveSettings();
    try {
      const res = await fetch('samples/sample.pdf');
      if (res.ok && !S.books.length) await addBook(new File([await res.blob()], 'sample.pdf'), 'كتاب تجريبي: فن القراءة');
    } catch {}
    if (!S.notes.length) {
      newNote({ title: 'مثال: كيف أستخدم رفّ', pages: [{ strokes: [], text:
        'هذه ملاحظة تجريبية يمكنك حذفها.\n\n• افتح «كتاب تجريبي» من المكتبة، ثم اضغط زر النص (T) واختر «استخراج نص هذه الصفحة».\n• حدّد جملة لتظهر أدوات التلوين والتسطير والترجمة والملاحظة.\n• اضغط زر القلم لتكتب على الصفحة بـ Apple Pencil.\n• في الدفتر اختر «رسم بالقلم» لتكتب بخط يدك.\n• أنشئ رفوفًا من أعلى المكتبة، واختر شكل كل رف من زر «تخصيص».' }] });
    }
    showView(S.view);
  }
})();
