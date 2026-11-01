'use strict';

/* =========================================================
   STRIDE – Stages 1-3
   Sections: Storage · Helpers · State · Views · Render · Events
   Later stages add task CRUD, Focus Studio, calendar, progress.
   ========================================================= */

/* ---------- Storage ---------- */
const KEYS = { settings: 'stride.v2.settings', tasks: 'stride.v2.tasks', history: 'stride.v2.history', welcomed: 'stride.v2.welcomed' };
const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked or full */ } };

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const icons = () => window.lucide && window.lucide.createIcons();
const empty = (icon, title, text) => `<div class="empty"><i data-lucide="${icon}"></i><h3>${title}</h3><p>${text}</p></div>`;


/* ---------- State ---------- */
const NAV = [
  ['myday', 'My Day', 'sunrise'], ['tasks', 'Tasks', 'list-checks'], ['upcoming', 'Upcoming', 'calendar-clock'],
  ['calendar', 'Calendar', 'calendar-days'], ['focus', 'Focus Studio', 'trees'], ['progress', 'Progress', 'trending-up'],
  ['settings', 'Settings', 'settings'],
];
const STAGE = { tasks: 4, upcoming: 4, focus: 5, calendar: 8, progress: 8 };   // which stage builds each view
const ACCENTS = [['sage', 'Sage'], ['olive', 'Olive'], ['pine', 'Pine'], ['lake', 'Lake'], ['bark', 'Bark']];
const CATS = ['Personal', 'Work', 'Study', 'Health'];
const PRIS = ['high', 'medium', 'low'];
const ui = { q: '', pri: 'all', cat: 'all', status: 'all', sort: 'due' };
const SORT = {
  due: (a, b) => dueKey(a).localeCompare(dueKey(b)),
  priority: (a, b) => PRIS.indexOf(a.priority) - PRIS.indexOf(b.priority) || SORT.due(a, b),
  title: (a, b) => a.title.localeCompare(b.title),
  newest: (a, b) => b.created - a.created,
};

let settings = {
  name: '', accent: 'sage',
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  ...load(KEYS.settings, {}),
};
const tasks = load(KEYS.tasks, []);       // filled by Stage 4
const history = load(KEYS.history, []);   // focus sessions, filled by Stage 6

/* ---------- Task helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cap = s => s[0].toUpperCase() + s.slice(1);
const fmtDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const hm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isOverdue = t => !t.done && (t.date < todayStr() || (t.date === todayStr() && t.time && t.time < hm()));
const dueKey = t => t.date + (t.time || '99:99');
// Search + priority + category (+ status where offered) all apply together.
const matches = (t, useStatus) => {
  const q = ui.q.toLowerCase();
  if (q && !`${t.title} ${t.desc} ${t.category}`.toLowerCase().includes(q)) return false;
  if (ui.pri !== 'all' && t.priority !== ui.pri) return false;
  if (ui.cat !== 'all' && t.category !== ui.cat) return false;
  if (useStatus && ui.status !== 'all' && (ui.status === 'done') !== t.done) return false;
  return true;
};
const list = (arr, useStatus = false) => arr.filter(t => matches(t, useStatus)).sort(SORT[ui.sort]);
const filtering = useStatus => ui.q || ui.pri !== 'all' || ui.cat !== 'all' || (useStatus && ui.status !== 'all');
const persistTasks = () => save(KEYS.tasks, tasks);

/* ---------- Views ---------- */
const miniRow = t => `<li><span>${esc(t.title)}</span><small>${fmtDay(t.date)}${t.time ? ', ' + fmtTime(t.time) : ''}</small></li>`;
const opts = (arr, cur) => arr.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');

function taskHTML(t) {
  const name = esc(t.title), od = isOverdue(t);
  return `<li class="trow${t.done ? ' done' : ''}" data-id="${t.id}">
    <input class="check" type="checkbox" data-act="toggle" ${t.done ? 'checked' : ''} aria-label="${t.done ? 'Reopen' : 'Complete'}: ${name}">
    <div><p class="ttl">${name}</p>${t.desc ? `<p class="tdesc">${esc(t.desc)}</p>` : ''}
      <div class="meta"><span class="chip">${esc(t.category)}</span><span class="chip ${t.priority}">${cap(t.priority)}</span>
      <span class="chip${od ? ' late' : ''}">${fmtDay(t.date)}${t.time ? ', ' + fmtTime(t.time) : ''}${od ? ' · Overdue' : ''}</span></div></div>
    <div class="tact"><button class="icon-btn sm" data-act="edit" aria-label="Edit: ${name}"><i data-lucide="pencil"></i></button>
      <button class="icon-btn sm" data-act="remove" aria-label="Delete: ${name}"><i data-lucide="trash-2"></i></button></div></li>`;
}
function taskList(arr, emptyHTML, useStatus) {
  if (arr.length) return `<ul class="tlist">${arr.map(taskHTML).join('')}</ul>`;
  return filtering(useStatus)
    ? empty('search-x', 'No matching tasks', 'Try a different search or clear the filters.') + '<p class="center"><button class="btn" data-act="clearFilters">Clear search and filters</button></p>'
    : emptyHTML;
}
function filterBar(showStatus) {
  return `<div class="filters" role="group" aria-label="Filters">
    <label>Priority<select data-f="pri">${opts([['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], ui.pri)}</select></label>
    <label>Category<select data-f="cat">${opts([['all', 'All'], ...CATS.map(c => [c, c])], ui.cat)}</select></label>
    ${showStatus ? `<label>Status<select data-f="status">${opts([['all', 'All'], ['pending', 'Pending'], ['done', 'Completed']], ui.status)}</select></label>` : ''}
    <label>Sort by<select data-f="sort">${opts([['due', 'Due date'], ['priority', 'Priority'], ['title', 'Title'], ['newest', 'Newest first']], ui.sort)}</select></label></div>`;
}
const quickAdd = `<form id="quickForm" class="quick"><input name="title" maxlength="80" placeholder="Add a task for today and press Enter" aria-label="Quick add a task for today"><button class="btn" type="submit"><i data-lucide="plus"></i>Add</button></form>`;

function nextUp() {
  const t = tasks.filter(x => !x.done && x.date <= todayStr()).sort(SORT.due)[0];
  if (!t) return '';
  return `<div class="next" data-id="${t.id}"><div><small>Next up</small><p class="ttl">${esc(t.title)}</p>
    <span class="muted">${fmtDay(t.date)}${t.time ? ', ' + fmtTime(t.time) : ''}${isOverdue(t) ? ' · Overdue' : ''}</span></div>
    <button class="btn" data-act="toggle"><i data-lucide="check"></i>Done</button></div>`;
}

function vMyDay() {
  const t0 = todayStr(), h = new Date().getHours();
  const overdue = tasks.filter(t => !t.done && t.date < t0).sort(SORT.due);
  const today = tasks.filter(t => t.date === t0).sort(SORT.due);
  const done = today.filter(t => t.done).length;
  const pct = today.length ? Math.round((done / today.length) * 100) : 0;
  const upcoming = tasks.filter(t => !t.done && t.date > t0).sort(SORT.due).slice(0, 5);
  const focusMin = history.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const greet = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (settings.name ? `, ${esc(settings.name)}` : '');
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const todayHTML = (overdue.length ? `<h4 class="gh late">Overdue</h4><ul class="tlist">${overdue.map(taskHTML).join('')}</ul><h4 class="gh">Today</h4>` : '') +
    (today.length ? `<ul class="tlist">${today.map(taskHTML).join('')}</ul>` : empty('sprout', 'Nothing planned yet', 'Add a task above to grow your day.'));

  return `<section class="hero">
      <div><p class="date">${date}</p><h2>${greet}</h2>
        <p class="sub">${today.length ? `${done} of ${today.length} tasks done today.` : 'Your day is open. Find your pace.'}</p></div>
      <div class="ring" role="img" aria-label="${pct}% of today’s tasks complete">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="42"/><circle class="fill" cx="50" cy="50" r="42" style="stroke-dashoffset:${264 * (1 - pct / 100)}"/></svg>
        <div><strong>${pct}%</strong><small>today</small></div></div>
    </section>
    <section class="strip" aria-label="Productivity summary">
      <div><strong>${tasks.filter(t => t.done).length}</strong><span>Completed</span></div>
      <div><strong>${tasks.filter(t => !t.done).length}</strong><span>Pending</span></div>
      <div><strong>${history.length}</strong><span>Focus sessions</span></div>
      <div><strong>${focusMin} min</strong><span>Focus time</span></div>
    </section>
    ${quickAdd}${nextUp()}
    <div class="cols">
      <section class="panel"><h3>Today’s tasks</h3>${todayHTML}</section>
      <section class="panel"><h3>Upcoming deadlines</h3>${upcoming.length ? `<ul class="rows">${upcoming.map(miniRow).join('')}</ul>` : empty('calendar-check', 'No deadlines ahead', 'Tasks due after today will appear here.')}</section>
    </div>`;
}

function vTasks() {
  return `<div class="page wide"><h2>Tasks</h2>${quickAdd}${filterBar(true)}${taskList(list(tasks, true), empty('sprout', 'No tasks yet', 'Add your first task above, or press N.'), true)}</div>`;
}
function vUpcoming() {
  const g = {};
  list(tasks.filter(t => !t.done && t.date > todayStr())).forEach(t => (g[t.date] ??= []).push(t));
  const body = Object.keys(g).sort().map(d => `<h4 class="gh">${fmtDay(d)}</h4><ul class="tlist">${g[d].map(taskHTML).join('')}</ul>`).join('');
  return `<div class="page wide"><h2>Upcoming</h2>${filterBar(false)}${body || taskList([], empty('calendar-check', 'Nothing coming up', 'Tasks due after today will appear here.'), false)}</div>`;
}

function vSettings() {
  const seg = (items, cur, key) => items.map(([v, label, icon]) =>
    `<button role="radio" aria-checked="${v === cur}" data-set="${key}" data-value="${v}"><i data-lucide="${icon}"></i>${label}</button>`).join('');
  return `<div class="page">
    <div class="group"><h3>Your name</h3><p>Used in your greeting.</p>
      <label class="field">Name<input id="nameInput" maxlength="30" value="${esc(settings.name)}" placeholder="Your name" autocomplete="given-name"></label></div>
    <div class="group"><h3>Theme</h3><p>Warm daylight or a quiet forest at night.</p>
      <div class="seg" role="radiogroup" aria-label="Theme">${seg([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']], settings.theme, 'theme')}</div></div>
    <div class="group"><h3>Accent colour</h3><p>Pick a shade from the woods.</p>
      <div class="swatches" role="radiogroup" aria-label="Accent colour">${ACCENTS.map(([v, label]) =>
        `<button class="sw" role="radio" aria-checked="${v === settings.accent}" data-set="accent" data-value="${v}" data-accent="${v}"><i></i>${label}</button>`).join('')}</div></div>
    <div class="group"><h3>Welcome screen</h3><p>Show the Stride introduction again.</p><button class="btn" data-act="welcome"><i data-lucide="leaf"></i>Show welcome screen</button></div>
    <div class="group"><h3>Backup</h3><p>Download your tasks and settings, or restore them from a backup file.</p>
      <div class="btns"><button class="btn" data-act="export"><i data-lucide="download"></i>Export</button><button class="btn" data-act="import"><i data-lucide="upload"></i>Import</button></div>
      <input type="file" id="importFile" accept="application/json,.json" hidden></div>
    <div class="group"><h3>Keyboard shortcuts</h3><p><kbd>N</kbd> new task &nbsp; <kbd>/</kbd> search &nbsp; <kbd>Esc</kbd> close a dialog</p></div>
  </div>`;
}

const VIEWS = { myday: vMyDay, tasks: vTasks, upcoming: vUpcoming, settings: vSettings };

/* ---------- Render ---------- */
const viewFromHash = () => { const v = location.hash.slice(1); return NAV.some(n => n[0] === v) ? v : 'myday'; };

function applyAppearance() {
  const d = document.documentElement;
  d.dataset.theme = settings.theme;
  d.dataset.accent = settings.accent;
  $('#themeBtn').innerHTML = `<i data-lucide="${settings.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  $('#themeBtn').setAttribute(
    'aria-label',
    settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  );
  $('#profName').textContent = settings.name || 'Your profile';
  $('#avatar').textContent = settings.name
    ? String(settings.name)[0].toUpperCase()
    : '?';
}

function render() {
  const view = viewFromHash(), label = NAV.find(n => n[0] === view)[1];
  applyAppearance();
  $('#nav').innerHTML = NAV.map(([id, name, icon]) =>
    `<a href="#${id}"${id === view ? ' aria-current="page"' : ''}><i data-lucide="${icon}"></i>${name}</a>`).join('');
  $('#pageTitle').textContent = label;
  $('#main').innerHTML = VIEWS[view] ? VIEWS[view]() : empty('sprout', label, `${label} is built in Stage ${STAGE[view]}.`);
  document.title = `${label} – Stride`;
  icons();
}

function setMenu(open) {
  document.body.classList.toggle('nav-open', open);
  $('#menuBtn').setAttribute('aria-expanded', open);
}

/* ---------- Task actions and forms (Stage 4) ---------- */
function toast(msg, { undo } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(document.createTextNode(msg));
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.addEventListener('click', () => { undo(); el.remove(); });
    el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), undo ? 6000 : 2800);
}

/* Due-time picker: three selects keep the hidden `time` input (HH:MM, 24 h) in sync,
   so the rest of the code still reads and saves `time` exactly as before. */
function syncTime() {
  const h = $('#tHour'), m = $('#tMin'), p = $('#tAmpm');
  m.disabled = p.disabled = !h.value;
  $('#taskForm').elements.time.value = h.value ? `${pad((Number(h.value) % 12) + (p.value === 'PM' ? 12 : 0))}:${m.value}` : '';
}
function setTimeUI(value) {
  const h = $('#tHour'), m = $('#tMin'), p = $('#tAmpm');
  if (!value) h.value = '';
  else {
    const [hh, mm] = value.split(':').map(Number);
    h.value = String(hh % 12 || 12);
    p.value = hh >= 12 ? 'PM' : 'AM';
    if (![...m.options].some(o => o.value === pad(mm))) m.add(new Option(pad(mm), pad(mm)));   // keep odd minutes (e.g. from an import)
    m.value = pad(mm);
  }
  syncTime();
}

function openTask(id) {
  const t = id ? tasks.find(x => x.id === id) : null, form = $('#taskForm'), f = form.elements;
  form.reset();
  $('#formErr').textContent = '';
  $('#taskDlgTitle').textContent = t ? 'Edit task' : 'New task';
  f.category.innerHTML = CATS.map(c => `<option>${c}</option>`).join('');
  f.id.value = t ? t.id : '';
  f.title.value = t ? t.title : '';
  f.desc.value = t ? t.desc : '';
  f.category.value = t ? t.category : (CATS.includes(settings.lastCat) ? settings.lastCat : CATS[0]);   // smart default
  f.priority.value = t ? t.priority : 'medium';
  f.date.value = t ? t.date : todayStr();
  f.time.value = t ? t.time : '';
  setTimeUI(f.time.value);
  $('#taskDlg').showModal();
  f.title.focus();
}
function saveTask(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target)), title = d.title.trim();
  if (!title) { $('#formErr').textContent = 'Give the task a title.'; return; }
  const fields = { title, desc: d.desc.trim(), category: d.category, priority: d.priority, date: d.date || todayStr(), time: d.time };
  const existing = d.id && tasks.find(t => t.id === d.id);
  if (existing) Object.assign(existing, fields);
  else tasks.push({ id: uid(), done: false, doneAt: null, created: Date.now(), ...fields });
  settings.lastCat = d.category;
  save(KEYS.settings, settings);
  persistTasks(); $('#taskDlg').close(); render();
  toast(existing ? 'Task updated' : 'Task added');
}
function quickAddTask(e) {
  e.preventDefault();
  const title = e.target.elements.title.value.trim();
  if (!title) return;
  tasks.push({ id: uid(), title, desc: '', category: CATS.includes(settings.lastCat) ? settings.lastCat : CATS[0], priority: 'medium', date: todayStr(), time: '', done: false, doneAt: null, created: Date.now() });
  persistTasks(); render(); toast('Task added for today');
  $('#quickForm input')?.focus();
}

const ACTIONS = {
  add: () => openTask(),
  edit: id => openTask(id),
  toggle: id => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;   // real activity data for the Progress page later
    persistTasks(); render();
    toast(t.done ? 'Task completed' : 'Task reopened');
  },
  remove: id => {
    const i = tasks.findIndex(x => x.id === id);
    if (i < 0) return;
    const [t] = tasks.splice(i, 1);
    persistTasks(); render();
    toast('Task deleted', { undo: () => { tasks.splice(Math.min(i, tasks.length), 0, t); persistTasks(); render(); } });
  },
  clearFilters: () => { Object.assign(ui, { q: '', pri: 'all', cat: 'all', status: 'all' }); $('#search').value = ''; render(); },
  ask: () => {                                     // landing: "Get started" -> ask for a name
    $('#startBtn').hidden = true;
    $('#nameForm').hidden = false;
    $('#nameField').value = settings.name;
    $('#nameField').focus();
  },
  export: () => {
    const blob = new Blob([JSON.stringify({ app: 'stride', version: 2, exported: new Date().toISOString(), settings, tasks, history }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `stride-backup-${todayStr()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  },
  import: () => $('#importFile').click(),
  welcome: () => showWelcome(),
};

/* Import: never trust a file blindly – rebuild every task from validated fields. */
function cleanTask(t) {
  if (!t || typeof t.title !== 'string' || !t.title.trim()) return null;
  return {
    id: typeof t.id === 'string' ? t.id : uid(), title: t.title.trim().slice(0, 80), desc: String(t.desc || '').slice(0, 240),
    category: CATS.includes(t.category) ? t.category : CATS[0], priority: PRIS.includes(t.priority) ? t.priority : 'medium',
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayStr(), time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : '',
    done: !!t.done, doneAt: t.done ? Number(t.doneAt) || null : null, created: Number(t.created) || Date.now(),
  };
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || !Array.isArray(data.tasks)) throw new Error('not a backup');
      const clean = data.tasks.map(cleanTask).filter(Boolean);
      if (!confirm(`Replace your ${tasks.length} current tasks with ${clean.length} tasks from this backup?`)) return;
      tasks.splice(0, tasks.length, ...clean);
      const hist = Array.isArray(data.history) ? data.history.filter(h => h && Number(h.minutes) > 0).map(h => ({ minutes: Number(h.minutes), at: Number(h.at) || 0 })) : [];
      history.splice(0, history.length, ...hist);
      const s = data.settings || {};
      if (typeof s.name === 'string') settings.name = s.name.slice(0, 30);
      if (s.theme === 'light' || s.theme === 'dark') settings.theme = s.theme;
      if (ACCENTS.some(a => a[0] === s.accent)) settings.accent = s.accent;
      persistTasks(); save(KEYS.history, history); save(KEYS.settings, settings);
      render(); toast(`Imported ${clean.length} tasks`);
    } catch { toast('That file is not a valid Stride backup.'); }
  };
  r.readAsText(file);
}

document.addEventListener('submit', e => {
  // matches() not .id: the task form has a field named "id", which shadows form.id
  if (e.target.matches('#taskForm')) saveTask(e);
  if (e.target.matches('#quickForm')) quickAddTask(e);
  if (e.target.matches('#nameForm')) {
    e.preventDefault();
    const name = $('#nameField').value.trim();
    if (!name) return $('#nameField').focus();
    settings.name = name; save(KEYS.settings, settings);
    startApp();
  }
});
document.addEventListener('change', e => {
  const f = e.target.dataset.f;
  if (f) { ui[f] = e.target.value; render(); $(`[data-f="${f}"]`)?.focus(); }
  if (e.target.classList?.contains('tsel')) syncTime();
  if (e.target.id === 'importFile' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});
// declared before listener to avoid TDZ
const history_replace = hash => window.history.replaceState(null, '', hash);   // changes the view without a hashchange (keeps focus in the search box)
$('#search').addEventListener('input', e => {
  ui.q = e.target.value.trim();
  if (viewFromHash() !== 'tasks') history_replace('#tasks');
  render();
});
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (document.documentElement.dataset.stage === 'landing' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTask(); }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
});

/* ---------- Events ---------- */
const update = patch => { Object.assign(settings, patch); save(KEYS.settings, settings); render(); };

document.addEventListener('click', e => {
  const set = e.target.closest('[data-set]');
  if (set) return update({ [set.dataset.set]: set.dataset.value });
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'theme') update({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  if (act === 'menu') setMenu(!document.body.classList.contains('nav-open'));
  if (act === 'start') startApp();
  ACTIONS[act]?.(e.target.closest('[data-id]')?.dataset.id, e.target);
  if (e.target.closest('nav a')) setMenu(false);
});
document.addEventListener('change', e => {
  if (e.target.id === 'nameInput') update({ name: e.target.value.trim() });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });

/* ---------- Welcome screen ---------- */
// <html data-stage> is "landing" or "app"; CSS shows one and hides the other.
const setStage = stage => { document.documentElement.dataset.stage = stage; window.scrollTo(0, 0); };
function startApp() {
  save(KEYS.welcomed, true);                 // remember: skip the welcome next time
  if (!location.hash) location.hash = '#myday';
  $('#startBtn').hidden = false;
  $('#nameForm').hidden = true;
  setStage('app');
  render();
  $('#main').focus({ preventScroll: true });
}
function showWelcome() {
  try { localStorage.removeItem(KEYS.welcomed); } catch { /* storage blocked */ }
  $('#startBtn').hidden = false;
  $('#nameForm').hidden = true;
  setStage('landing');
}

document.documentElement.dataset.stage = load(KEYS.welcomed, false) ? 'app' : 'landing';
render();
