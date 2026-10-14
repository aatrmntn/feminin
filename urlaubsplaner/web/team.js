// "Team": one month as a timeline, a row per person grouped by role, and a staffing row
// that turns red below the minimum. Shows names, dates, type and status; never notes.
import {
  HALF, MONTHS, STATUS, WD_KEYS, WEEKDAYS, addDays, api, h, kindText, longDate, weekdayIndex,
} from './ui.js';

const view = { month: null, query: '', role: '' };

// canApprove + onPick: approvers click a day in someone's row to enter or open their leave.
export function teamPage({ today, myId, canApprove = false, onPick = null }) {
  if (!view.month) view.month = today.slice(0, 7);
  const section = h('section', { class: 'team' }, h('p', { class: 'loading' }, 'Wird geladen …'));
  view.pick = canApprove && onPick ? onPick : null;
  load(section, today, myId);
  return section;
}

function pickCell(ev) {
  if (!view.pick) return;
  if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
  const cell = ev.target.closest('td[data-user]');
  if (!cell) return;
  ev.preventDefault();
  view.pick({ userId: cell.dataset.user, date: cell.dataset.date, entryId: cell.dataset.entry || '' });
}

async function load(section, today, myId) {
  try {
    const data = await api('GET', `/api/team?month=${view.month}`);
    if (data) draw(section, data, myId);
  } catch (err) {
    if (err.status === 401) return;
    section.replaceChildren(h('p', { class: 'error', role: 'alert' }, err.message));
  }

  function draw(target, data) {
    const [y, m] = view.month.split('-').map(Number);
    const step = (delta) => () => {
      const d = new Date(Date.UTC(y, m - 1 + delta, 1));
      view.month = d.toISOString().slice(0, 7);
      load(section, today, myId);
    };
    const search = h('input', {
      type: 'search', id: 'team-search', value: view.query, placeholder: 'Name', autocomplete: 'off',
    });
    const roleSelect = h('select', { id: 'team-role' },
      h('option', { value: '' }, 'Alle'),
      Object.entries(data.roles).map(([k, v]) => h('option', { value: k, selected: view.role === k }, v)));
    const body = h('div', { class: 'team-body' });
    const refilter = () => {
      view.query = search.value;
      view.role = roleSelect.value;
      body.replaceChildren(...content(data, myId).filter(Boolean));
    };
    search.addEventListener('input', refilter);
    roleSelect.addEventListener('change', refilter);

    target.replaceChildren(...[
      h('div', { class: 'toolbar' },
        h('div', { class: 'pager' },
          h('button', { class: 'button icon', type: 'button', 'aria-label': 'Monat davor', onclick: step(-1), disabled: view.month <= '2020-01' }, '‹'),
          h('h1', { class: 'pager-label', 'aria-live': 'polite' }, `${MONTHS[m - 1]} ${y}`),
          h('button', { class: 'button icon', type: 'button', 'aria-label': 'Nächster Monat', onclick: step(1), disabled: view.month >= '2040-12' }, '›')),
        h('div', { class: 'filters' },
          h('label', { for: 'team-search' }, 'Suchen'), search,
          h('label', { for: 'team-role' }, 'Bereich'), roleSelect)),
      awayStrip(data),
      body,
    ].filter(Boolean));
    refilter();
  }
}

function content(data, myId) {
  const q = view.query.trim().toLocaleLowerCase('de');
  const people = data.people.filter((p) => (!view.role || p.role === view.role)
    && (!q || p.name.toLocaleLowerCase('de').includes(q)));
  return [
    view.pick ? h('p', { class: 'hint' }, 'Klick auf einen Tag in der Zeile einer Person, um für sie einzutragen. Ein farbiger Tag öffnet den Eintrag.') : null,
    timeline(data, people, myId),
    h('ul', { class: 'legend', 'aria-label': 'Legende' },
      legendItem('k-vacation', 'Urlaub'),
      legendItem('k-absence', 'Andere Abwesenheit'),
      legendItem('k-vacation pending', 'Beantragt'),
      legendItem('holiday', 'Feiertag'),
      legendItem('free', 'Kein Arbeitstag'),
      legendItem('short', 'Zu wenig Leute'),
      legendItem('tight', 'Zu wenig, wenn alle Anträge bestätigt werden')),
  ];
}

function legendItem(cls, text) {
  return h('li', {}, h('span', { class: `swatch ${cls}`, 'aria-hidden': 'true' }), text);
}

// "Heute weg" and "Diese Woche weg", from the loaded month.
function awayStrip(data) {
  const today = data.today;
  if (!today.startsWith(data.month)) return null;
  const monday = addDays(today, -weekdayIndex(today));
  const sunday = addDays(monday, 6);
  const names = (from, to) => {
    const list = [];
    for (const p of data.people) {
      const hits = data.entries.filter((e) => e.userId === p.userId && e.start <= to && e.end >= from);
      if (hits.length) list.push(`${p.name}${hits.every((e) => e.status === 'pending') ? ' (beantragt)' : ''}`);
    }
    return list.length ? list.join(', ') : 'niemand';
  };
  return h('section', { class: 'away' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Heute weg'), h('span', {}, names(today, today))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Diese Woche weg'), h('span', {}, names(monday, sunday))));
}

function timeline(data, people, myId) {
  const holidays = new Map(data.holidays.map((x) => [x.date, x.name]));
  const closed = new Set();
  for (const c of data.closures) for (let d = c.start; d <= c.end; d = addDays(d, 1)) closed.add(d);
  const dayClass = (d) => [
    weekdayIndex(d.date) >= 5 ? 'weekend' : '',
    holidays.has(d.date) ? 'holiday' : '',
    closed.has(d.date) ? 'closure' : '',
    d.date === data.today ? 'today' : '',
  ].filter(Boolean).join(' ');

  const head = h('tr', {},
    h('th', { scope: 'col', class: 'name' }, 'Name'),
    data.days.map((d) => h('th', {
      scope: 'col',
      class: dayClass(d),
      title: `${WEEKDAYS[weekdayIndex(d.date)]}, ${longDate(d.date)}${holidays.has(d.date) ? ` – ${holidays.get(d.date)}` : ''}`,
    }, h('span', { class: 'wd' }, WEEKDAYS[weekdayIndex(d.date)].slice(0, 2)), h('span', {}, String(Number(d.date.slice(8)))))));

  const staffingRows = Object.entries(data.minimumStaffing || {}).map(([role, required]) => h('tr', { class: 'staffing' },
    h('th', { scope: 'row', class: 'name' }, `${data.roles[role] || role} da`, h('span', { class: 'hint' }, ` (mind. ${required})`)),
    data.days.map((d) => {
      if (!d.open) return h('td', { class: dayClass(d) });
      const present = d.roles[role]?.present ?? 0;
      const short = present < required;
      const tight = !short && d.belowIfApproved;
      const label = `${longDate(d.date)}: ${present} von mindestens ${required} da${short ? ', zu wenig' : tight ? ', zu wenig wenn alle Anträge bestätigt werden' : ''}`;
      return h('td', { class: `${dayClass(d)} ${short ? 'short' : tight ? 'tight' : ''}`, title: label },
        h('span', { 'aria-hidden': 'true' }, String(present)), h('span', { class: 'sr-only' }, label));
    })));

  const groups = [];
  for (const [role, label] of Object.entries(data.roles)) {
    const members = people.filter((p) => p.role === role);
    if (!members.length) continue;
    groups.push(h('tr', { class: 'group' }, h('th', { scope: 'rowgroup', colspan: String(data.days.length + 1) }, label)));
    for (const p of members) groups.push(personRow(p, data, dayClass, myId));
  }

  const table = h('table', { class: `timeline${view.pick ? ' can-pick' : ''}`, onclick: pickCell, onkeydown: pickCell },
    h('caption', { class: 'sr-only' }, 'Abwesenheiten im Team, ein Tag pro Spalte'),
    h('thead', {}, head),
    h('tbody', {}, staffingRows, groups));
  return h('div', { class: 'timeline-wrap', tabindex: '0', role: 'region', 'aria-label': 'Teamkalender, seitlich scrollbar' },
    people.length ? table : h('p', { class: 'hint' }, 'Niemand gefunden.'));
}

function personRow(p, data, dayClass, myId) {
  const holidays = new Set(data.holidays.map((x) => x.date));
  const mine = data.entries.filter((e) => e.userId === p.userId);
  return h('tr', { class: p.userId === myId ? 'me' : '' },
    h('th', { scope: 'row', class: 'name' }, p.name),
    data.days.map((d) => {
      const works = p.workPattern.includes(WD_KEYS[weekdayIndex(d.date)]);
      const hits = mine.filter((e) => e.start <= d.date && e.end >= d.date);
      const e = hits[0];
      const cls = [dayClass(d), works ? '' : 'free'];
      let text = '';
      // Entries are only coloured on days the person would work.
      if (e && works && !holidays.has(d.date)) {
        const both = hits.length > 1 && hits.every((x) => x.half);
        cls.push('has-entry', `k-${e.kind}`, e.status === 'pending' ? 'pending' : '', e.half && !both ? `half-${e.half}` : '');
        text = hits.map((x) => `${kindText(x, data.reasons)}${x.half ? ` (${HALF[x.half]})` : ''}, ${STATUS[x.status]}`).join('; ');
      }
      const pickable = !!view.pick;
      return h('td', {
        class: cls.filter(Boolean).join(' '),
        title: text ? `${p.name}, ${longDate(d.date)}: ${text}` : (pickable ? `${p.name}, ${longDate(d.date)}: eintragen` : null),
        dataset: pickable ? { user: p.userId, date: d.date, entry: e ? e.id : '' } : null,
        tabindex: pickable ? '0' : null,
        'aria-label': pickable ? `${p.name}, ${longDate(d.date)}${text ? `: ${text}` : ''}` : null,
      }, text ? h('span', { class: 'sr-only' }, text) : null);
    }));
}
