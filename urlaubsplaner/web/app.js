// "Mein Kalender": year and month view, balance, own entries and the entry drawer,
// plus the page switch to the team view and the requests inbox.
// The browser never counts days; numbers come from the API (/api/overview, /api/check).
import { devSignIn, devUsers, initAuth, isSignedIn, signIn, signOut } from './auth.js';
import {
  HALF, MONTHS, STATUS, WD_KEYS, WEEKDAYS, addDays, api, days, h, isoOf, kindText as kindLabel,
  longDate, num, onSignedOut, rangeText, showToast, weekdayIndex,
} from './ui.js';
import { requestsPage } from './requests.js';
import { teamPage } from './team.js';

const main = document.getElementById('main');
const topActions = document.getElementById('top-actions');
const drawer = document.getElementById('drawer');
const nameDialog = document.getElementById('name-dialog');

const state = { year: null, view: 'year', month: 0, data: null, drag: null, suppressClick: false };

const kindText = (e) => kindLabel(e, state.data.reasons);

// ---------- start ----------

async function start() {
  onSignedOut(showSignedOut);
  window.addEventListener('hashchange', () => { if (state.data) render(); });
  try {
    await initAuth();
  } catch {
    main.replaceChildren(h('p', { class: 'error' }, 'Die Seite konnte nicht geladen werden. Bitte versuche es später noch einmal.'));
    return;
  }
  if (!isSignedIn()) {
    showSignedOut();
    return;
  }
  await load();
}

function showSignedOut() {
  topActions.replaceChildren();
  const users = devUsers();
  const card = h('section', { class: 'card welcome' },
    h('h1', {}, 'Willkommen im Urlaubsplaner'),
    h('p', {}, 'Hier trägst du deinen Urlaub und andere Abwesenheiten ein und siehst, wie viele Tage dir noch bleiben.'));
  if (users) {
    card.append(
      h('p', { class: 'hint' }, 'Lokale Testversion: Wähle, als wer du dich anmeldest.'),
      h('div', { class: 'dev-users' }, users.map((u) => h('button', {
        class: 'button',
        type: 'button',
        onclick: () => { devSignIn(u.id); load(); },
      }, `${u.name} (${u.label})`))),
    );
  } else {
    card.append(h('button', { class: 'button primary', type: 'button', onclick: signIn }, 'Anmelden'));
  }
  main.replaceChildren(card);
}

async function load(year = state.year) {
  try {
    const data = await api('GET', `/api/overview${year ? `?year=${year}` : ''}`);
    if (!data) return;
    const first = !state.data;
    state.data = data;
    state.year = data.year;
    if (first) state.month = Number(data.today.slice(5, 7)) - 1;
    render();
  } catch (err) {
    if (err.status === 401) return;
    main.replaceChildren(h('section', { class: 'card' },
      h('p', { class: 'error', role: 'alert' }, err.message),
      h('button', { class: 'button', type: 'button', onclick: () => load() }, 'Nochmal versuchen')));
  }
}

// ---------- page ----------

function currentPage() {
  const page = location.hash.slice(1);
  if (page === 'team') return page;
  if (page === 'antraege' && state.data.me.canApprove) return page;
  return 'me';
}

function renderNav(page) {
  const d = state.data;
  const link = (href, id, ...label) => h('a', { href, class: 'tab', 'aria-current': page === id ? 'page' : null }, ...label);
  return h('nav', { class: 'tabs', 'aria-label': 'Bereiche' },
    link('#', 'me', 'Mein Kalender'),
    link('#team', 'team', 'Team'),
    d.me.canApprove ? link('#antraege', 'antraege', 'Anträge',
      d.openRequests ? h('span', { class: 'count', 'aria-label': `${d.openRequests} offen` }, String(d.openRequests)) : null) : null);
}

function render() {
  const d = state.data;
  topActions.replaceChildren(
    h('button', { class: 'link', type: 'button', onclick: openNameDialog }, d.me.name),
    h('button', { class: 'button small', type: 'button', onclick: signOut }, 'Abmelden'),
  );
  const page = currentPage();
  if (page === 'team') {
    main.replaceChildren(renderNav(page), teamPage({ today: d.today, myId: d.me.userId }));
    return;
  }
  if (page === 'antraege') {
    main.replaceChildren(renderNav(page), requestsPage({ onDecided: () => load() }));
    return;
  }

  const focusDate = document.activeElement?.dataset?.date;
  main.replaceChildren(
    renderNav(page),
    h('section', { class: 'intro' },
      h('h1', {}, `Hallo ${d.me.name}`),
      h('p', { class: 'hint' }, `${d.me.roleLabel ? `${d.me.roleLabel} · ` : ''}Deine Arbeitstage: `,
        d.me.workPattern.map((k) => WEEKDAYS[WD_KEYS.indexOf(k)].slice(0, 2)).join(', '))),
    renderBalance(d.balance),
    renderToolbar(),
    renderLegend(),
    renderCalendar(),
    renderEntries(),
  );
  if (focusDate) main.querySelector(`[data-date="${focusDate}"]`)?.focus();
}

function renderBalance(b) {
  const box = (label, value, sub, cls = '') => h('div', { class: `stat ${cls}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, num(value)),
    sub ? h('span', { class: 'stat-sub' }, sub) : null);
  return h('section', { class: 'balance', 'aria-label': `Urlaubskonto ${b.year}` },
    box(`Anspruch ${b.year}`, b.total, b.carryOver ? `${num(b.allowance)} + ${num(b.carryOver)} aus dem Vorjahr` : 'Tage'),
    box('Genommen', b.taken, 'bis gestern'),
    box('Geplant', b.planned, 'ab heute, bestätigt'),
    box('Beantragt', b.pending, 'wartet auf Bestätigung', b.pending ? 'is-pending' : ''),
    box('Übrig', b.remaining, b.pending ? `${num(b.remaining - b.pending)} wenn alles bestätigt wird` : 'Tage', 'is-main'));
}

function renderToolbar() {
  const y = state.year;
  const isYear = state.view === 'year';
  const step = (delta) => () => {
    if (isYear) {
      load(y + delta);
      return;
    }
    const m = state.month + delta;
    if (m < 0 || m > 11) {
      state.month = (m + 12) % 12;
      load(y + Math.sign(delta));
    } else {
      state.month = m;
      render();
    }
  };
  const label = isYear ? String(y) : `${MONTHS[state.month]} ${y}`;
  const switchView = (view) => () => {
    state.view = view;
    render();
  };
  return h('section', { class: 'toolbar' },
    h('div', { class: 'pager' },
      h('button', { class: 'button icon', type: 'button', 'aria-label': isYear ? 'Jahr davor' : 'Monat davor', onclick: step(-1), disabled: isYear ? y <= 2020 : (y <= 2020 && state.month === 0) }, '‹'),
      h('h2', { class: 'pager-label', 'aria-live': 'polite' }, label),
      h('button', { class: 'button icon', type: 'button', 'aria-label': isYear ? 'Nächstes Jahr' : 'Nächster Monat', onclick: step(1), disabled: isYear ? y >= 2040 : (y >= 2040 && state.month === 11) }, '›')),
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Ansicht' },
      h('button', { type: 'button', 'aria-pressed': String(isYear), onclick: switchView('year') }, 'Jahr'),
      h('button', { type: 'button', 'aria-pressed': String(!isYear), onclick: switchView('month') }, 'Monat')),
    h('button', { class: 'button primary', type: 'button', onclick: () => openDrawer(null, defaultNewDate()) }, '+ Neuer Eintrag'));
}

function defaultNewDate() {
  const today = state.data.today;
  if (today.startsWith(String(state.year)) && (state.view === 'year' || Number(today.slice(5, 7)) - 1 === state.month)) return today;
  return isoOf(state.year, state.view === 'year' ? 0 : state.month, 1);
}

function renderLegend() {
  const item = (cls, text) => h('li', {}, h('span', { class: `swatch ${cls}`, 'aria-hidden': 'true' }), text);
  return h('ul', { class: 'legend', 'aria-label': 'Legende' },
    item('k-vacation', 'Urlaub'),
    item('k-vacation half-am', 'Halber Tag'),
    item('k-absence', 'Andere Abwesenheit'),
    item('k-vacation pending', 'Beantragt'),
    item('holiday', 'Feiertag'),
    item('closure', 'Betriebsurlaub'),
    item('free', 'Kein Arbeitstag'),
    item('today', 'Heute'));
}

// ---------- calendar ----------

function dayIndex() {
  const d = state.data;
  const holidays = new Map(d.holidays.map((x) => [x.date, x.name]));
  const closures = new Map();
  for (const c of d.closures) for (let x = c.start; x <= c.end; x = addDays(x, 1)) closures.set(x, c);
  const entries = new Map();
  for (const e of d.entries) {
    if (e.status === 'declined') continue;
    for (let x = e.start; x <= e.end; x = addDays(x, 1)) {
      if (!entries.has(x)) entries.set(x, []);
      entries.get(x).push(e);
    }
  }
  return { holidays, closures, entries };
}

function dayCell(iso, idx, { big }) {
  const d = state.data;
  const wd = WD_KEYS[weekdayIndex(iso)];
  const works = d.me.workPattern.includes(wd) && d.practice.openDays.includes(wd);
  const holiday = idx.holidays.get(iso);
  const closure = idx.closures.get(iso);
  const list = idx.entries.get(iso) || [];
  const e = list[0];
  const both = list.length > 1 && list.every((x) => x.half);
  const cls = ['day'];
  const said = [];
  if (!works) { cls.push('free'); said.push('kein Arbeitstag'); }
  if (holiday) { cls.push('holiday'); said.push(`Feiertag: ${holiday}`); }
  if (closure) { cls.push('closure'); said.push('Betriebsurlaub'); }
  if (e) {
    cls.push('has-entry', `k-${e.kind}`);
    if (e.status === 'pending') cls.push('pending');
    if (e.half && !both) cls.push(`half-${e.half}`);
    for (const x of list) said.push(`${kindText(x)}${x.half && !kindText(x).includes('halber') ? `, ${HALF[x.half]}` : ''} (${STATUS[x.status]})`);
  }
  if (iso === d.today) { cls.push('today'); said.push('heute'); }

  const label = `${WEEKDAYS[weekdayIndex(iso)]}, ${longDate(iso)}${said.length ? ` – ${said.join(', ')}` : ''}`;
  const short = big ? (holiday || (e ? kindText(e) : closure ? 'Betriebsurlaub' : '')) : '';
  return h('button', {
    type: 'button',
    class: cls.join(' '),
    dataset: { date: iso },
    'aria-label': label,
    title: label,
    tabindex: '-1',
  },
  h('span', { class: 'num' }, String(Number(iso.slice(8)))),
  short ? h('span', { class: 'tag' }, short) : null);
}

function monthGrid(y, m, idx, { big }) {
  const first = isoOf(y, m, 1);
  const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < weekdayIndex(first); i++) cells.push(h('span', { class: 'blank', 'aria-hidden': 'true' }));
  for (let day = 1; day <= length; day++) cells.push(dayCell(isoOf(y, m, day), idx, { big }));
  return h('div', { class: `month ${big ? 'big' : ''}` },
    h('h3', { class: 'month-title' }, big ? `${MONTHS[m]} ${y}` : MONTHS[m]),
    h('div', { class: 'weekdays', 'aria-hidden': 'true' }, WEEKDAYS.map((w) => h('span', {}, w.slice(0, 2)))),
    h('div', { class: 'days' }, cells));
}

function renderCalendar() {
  const idx = dayIndex();
  const y = state.year;
  const big = state.view === 'month';
  const months = big ? [state.month] : [...Array(12).keys()];
  const cal = h('section', {
    class: `calendar ${big ? 'is-month' : 'is-year'}`,
    'aria-label': 'Kalender. Mit den Pfeiltasten wählst du einen Tag, mit Enter öffnest du ihn.',
    onclick: onDayClick,
    onkeydown: onCalendarKey,
    onpointerdown: onPointerDown,
    onpointerover: onPointerOver,
  }, months.map((m) => monthGrid(y, m, idx, { big })));

  // One day is reachable with Tab; the arrow keys move from there.
  const today = state.data.today;
  const target = cal.querySelector(`[data-date="${today}"]`) || cal.querySelector('[data-date]');
  if (target) target.tabIndex = 0;
  return cal;
}

function onDayClick(ev) {
  const btn = ev.target.closest('[data-date]');
  if (!btn) return;
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }
  const iso = btn.dataset.date;
  const e = (dayIndex().entries.get(iso) || [])[0];
  if (e) openDrawer(e);
  else openDrawer(null, iso);
}

function onCalendarKey(ev) {
  const btn = ev.target.closest('[data-date]');
  if (!btn) return;
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(ev.key in moves)) return;
  const next = ev.currentTarget.querySelector(`[data-date="${addDays(btn.dataset.date, moves[ev.key])}"]`);
  if (!next) return;
  ev.preventDefault();
  btn.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

// Drag across days with the mouse to book a range. Touch keeps normal scrolling.
function onPointerDown(ev) {
  const btn = ev.target.closest('[data-date]');
  if (!btn || ev.pointerType !== 'mouse' || ev.button !== 0) return;
  state.drag = { anchor: btn.dataset.date, current: btn.dataset.date };
  document.addEventListener('pointerup', onPointerUp, { once: true });
}

function onPointerOver(ev) {
  if (!state.drag) return;
  const btn = ev.target.closest('[data-date]');
  if (!btn || btn.dataset.date === state.drag.current) return;
  state.drag.current = btn.dataset.date;
  const [a, b] = [state.drag.anchor, state.drag.current].sort();
  for (const el of main.querySelectorAll('[data-date]')) {
    el.classList.toggle('selecting', el.dataset.date >= a && el.dataset.date <= b);
  }
}

function onPointerUp() {
  const drag = state.drag;
  state.drag = null;
  for (const el of main.querySelectorAll('.selecting')) el.classList.remove('selecting');
  if (!drag || drag.anchor === drag.current) return;
  state.suppressClick = true;
  setTimeout(() => { state.suppressClick = false; }, 0);
  const [a, b] = [drag.anchor, drag.current].sort();
  openDrawer(null, a, b);
}

// ---------- own entries ----------

function renderEntries() {
  const list = state.data.entries;
  const section = h('section', { class: 'card entries' }, h('h2', {}, `Meine Einträge ${state.year}`));
  if (!list.length) {
    section.append(h('p', { class: 'hint' }, 'Noch nichts eingetragen. Klick auf einen Tag im Kalender oder auf „Neuer Eintrag“.'));
    return section;
  }
  section.append(h('ul', { class: 'entry-list' }, list.map((e) => h('li', {},
    h('button', { type: 'button', class: `entry k-${e.kind} ${e.status}`, onclick: () => openDrawer(e) },
      h('span', { class: 'entry-dates' }, rangeText(e)),
      h('span', { class: 'entry-kind' }, kindText(e), e.kind === 'vacation' ? ` · ${days(e.days)}` : ''),
      e.note ? h('span', { class: 'entry-note' }, e.note) : null,
      e.decisionComment ? h('span', { class: 'entry-note' }, `Praxisleitung: ${e.decisionComment}`) : null,
      h('span', { class: `badge ${e.status}` }, STATUS[e.status]))))));
  return section;
}

// ---------- drawer ----------

function openDrawer(entry, start, end = start) {
  const d = state.data;
  const isNew = !entry;
  const e = entry || { kind: 'vacation', reason: '', start, end, half: '', note: '' };
  const locked = !isNew && !d.me.canApprove && e.status === 'approved' && e.start < d.today;
  let checkSeq = 0;

  const radio = (name, value, text, checked) => h('label', { class: 'choice' },
    h('input', { type: 'radio', name, value, checked }), h('span', {}, text));

  const form = h('form', { method: 'dialog', class: 'drawer-form', novalidate: true });
  const reasonSelect = h('select', { name: 'reason', id: 'f-reason' },
    h('option', { value: '' }, 'Bitte wählen'),
    Object.entries(d.reasons).map(([k, v]) => h('option', { value: k, selected: e.reason === k }, v)));
  const startInput = h('input', { type: 'date', name: 'start', id: 'f-start', value: e.start, min: '2020-01-01', max: '2040-12-31', required: true });
  const endInput = h('input', { type: 'date', name: 'end', id: 'f-end', value: e.end, min: '2020-01-01', max: '2040-12-31', required: true });
  const note = h('textarea', { name: 'note', id: 'f-note', maxlength: '300', rows: '3' });
  note.value = e.note || '';
  const counter = h('span', { class: 'counter' });
  const summary = h('p', { class: 'summary', 'aria-live': 'polite' });
  const warning = h('p', { class: 'notice warning', 'aria-live': 'polite' });
  const error = h('p', { class: 'error', role: 'alert' });
  const halfField = h('fieldset', { class: 'choices' }, h('legend', {}, 'Dauer'),
    radio('half', '', 'Ganzer Tag', !e.half),
    radio('half', 'am', 'Vormittag', e.half === 'am'),
    radio('half', 'pm', 'Nachmittag', e.half === 'pm'));
  const reasonField = h('div', { class: 'field' }, h('label', { for: 'f-reason' }, 'Grund'), reasonSelect);
  const saveBtn = h('button', { class: 'button primary', type: 'submit' }, isNew ? 'Eintragen' : 'Speichern');

  form.append(...[
    h('header', { class: 'drawer-head' },
      h('h2', { id: 'drawer-title' }, isNew ? 'Neuer Eintrag' : 'Eintrag'),
      isNew ? null : h('span', { class: `badge ${e.status}` }, STATUS[e.status]),
      h('button', { class: 'button icon close', type: 'button', 'aria-label': 'Schließen', onclick: () => drawer.close() }, '×')),
    locked ? h('p', { class: 'notice' }, 'Dieser Urlaub hat schon begonnen. Änderungen macht die Praxisleitung.') : null,
    h('fieldset', { class: 'choices' }, h('legend', {}, 'Art'),
      radio('kind', 'vacation', 'Urlaub', e.kind === 'vacation'),
      radio('kind', 'absence', 'Andere Abwesenheit', e.kind === 'absence')),
    reasonField,
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', { for: 'f-start' }, 'Von'), startInput),
      h('div', { class: 'field' }, h('label', { for: 'f-end' }, 'Bis'), endInput)),
    halfField,
    h('div', { class: 'field' },
      h('label', { for: 'f-note' }, 'Notiz ', h('span', { class: 'hint' }, '(sehen nur du und die Praxisleitung)')),
      note, counter),
    summary,
    warning,
    !isNew && e.decisionComment ? h('p', { class: 'hint' }, `Kommentar der Praxisleitung: ${e.decisionComment}`) : null,
    error,
    h('div', { class: 'actions' },
      locked ? null : saveBtn,
      !isNew && !locked ? h('button', { class: 'button danger', type: 'button', onclick: remove }, 'Löschen') : null,
      h('button', { class: 'button', type: 'button', onclick: () => drawer.close() }, locked ? 'Schließen' : 'Abbrechen')),
  ].filter(Boolean));
  if (locked) for (const el of form.querySelectorAll('input, select, textarea')) el.disabled = true;

  function values() {
    const fd = new FormData(form);
    const kind = fd.get('kind');
    const s = startInput.value;
    let en = endInput.value || s;
    const half = s === en ? (fd.get('half') || '') : '';
    return {
      kind, reason: kind === 'absence' ? reasonSelect.value : '', start: s, end: en, half, note: note.value,
    };
  }

  function sync() {
    const v = values();
    reasonField.hidden = v.kind !== 'absence';
    const oneDay = v.start && v.start === v.end;
    for (const input of halfField.querySelectorAll('input[value="am"], input[value="pm"]')) input.disabled = locked || !oneDay;
    if (!oneDay) halfField.querySelector('input[value=""]').checked = true;
    counter.textContent = `${note.value.length} / 300`;
  }

  async function check() {
    if (locked) return;
    const seq = ++checkSeq;
    const v = values();
    if (!v.start) {
      summary.textContent = '';
      return;
    }
    try {
      const res = await api('POST', '/api/check', { ...v, id: entry?.id });
      if (seq !== checkSeq || !res) return;
      summary.classList.toggle('warn', !res.ok);
      summary.textContent = res.ok ? summaryText(v, res) : res.error;
      warning.textContent = res.ok && res.warningText
        ? `Achtung: ${res.warningText} Du kannst trotzdem eintragen. Die Praxisleitung sieht den Hinweis.`
        : '';
    } catch {
      // the live summary is optional; saving shows any real error
    }
  }

  async function save(ev) {
    ev.preventDefault();
    if (locked) return;
    error.textContent = '';
    saveBtn.disabled = true;
    try {
      const v = values();
      if (isNew) await api('POST', '/api/entries', v);
      else await api('PUT', `/api/entries/${entry.id}`, { ...v, expectedRev: entry.rev });
      drawer.close();
      showToast(isNew && v.kind === 'vacation' ? 'Eingetragen. Die Praxisleitung bestätigt deinen Antrag.' : 'Gespeichert.');
      await load();
    } catch (err) {
      error.textContent = err.message;
      if (err.status === 409) error.append(' ', h('button', { class: 'link', type: 'button', onclick: () => { drawer.close(); load(); } }, 'Neu laden'));
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function remove() {
    if (!window.confirm(`Eintrag ${rangeText(entry)} wirklich löschen?`)) return;
    try {
      await api('DELETE', `/api/entries/${entry.id}?rev=${entry.rev}`);
      drawer.close();
      showToast('Gelöscht.');
      await load();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  let timer;
  form.addEventListener('input', () => {
    if (startInput.value && endInput.value && endInput.value < startInput.value && document.activeElement === startInput) {
      endInput.value = startInput.value;
    }
    sync();
    clearTimeout(timer);
    timer = setTimeout(check, 250);
  });
  form.addEventListener('submit', save);

  drawer.replaceChildren(form);
  sync();
  check();
  drawer.showModal();
  (locked ? form.querySelector('.close') : form.querySelector('input[name="kind"]:checked'))?.focus();
}

function summaryText(v, res) {
  if (v.kind !== 'vacation') {
    return 'Zählt nicht als Urlaub. Für die Mindestbesetzung zählt es trotzdem als abwesend.';
  }
  const years = Object.keys(res.byYear);
  const what = `${num(res.days)} ${res.days === 1 ? 'Urlaubstag' : 'Urlaubstage'}`;
  if (years.length === 1) {
    return `${what}. Danach bleiben dir ${days(res.remainingAfter[years[0]])} für ${years[0]}.`;
  }
  const split = years.map((y) => `${num(res.byYear[y])} in ${y}`).join(', ');
  const left = years.map((y) => `${days(res.remainingAfter[y])} für ${y}`).join(' und ');
  return `${what} (${split}). Danach bleiben dir ${left}.`;
}

// ---------- display name ----------

function openNameDialog() {
  const input = h('input', { id: 'f-name', name: 'name', maxlength: '80', value: state.data.me.name, autocomplete: 'off' });
  const error = h('p', { class: 'error', role: 'alert' });
  const form = h('form', {
    method: 'dialog',
    onsubmit: async (ev) => {
      ev.preventDefault();
      try {
        await api('PUT', '/api/me', { name: input.value });
        nameDialog.close();
        showToast('Name gespeichert.');
        await load();
      } catch (err) {
        error.textContent = err.message;
      }
    },
  },
  h('h2', { id: 'name-title' }, 'Dein Name im Planer'),
  h('p', { class: 'hint' }, 'So sehen dich deine Kolleg:innen.'),
  h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'Name'), input),
  error,
  h('div', { class: 'actions' },
    h('button', { class: 'button primary', type: 'submit' }, 'Speichern'),
    h('button', { class: 'button', type: 'button', onclick: () => nameDialog.close() }, 'Abbrechen')));
  nameDialog.replaceChildren(form);
  nameDialog.showModal();
  input.select();
}

start();
