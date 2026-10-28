// SSW-Rechner feminin: due date (or last period) in, then the windows for the chosen scans. Runs only in the browser; nothing is saved or sent.
import {
  EXAMS, dueFromLmp, gestation, isIsoDate, lmpFromDue, planExam, sswText,
} from './ssw-rules.js';

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// All text is set as text nodes, never as HTML.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = true;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);
const longDate = (iso) => {
  const d = dateOf(iso);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const weekdayDate = (iso) => `${WEEKDAYS[dateOf(iso).getUTCDay()]}, ${longDate(iso)}`;
// Today in Vienna, as yyyy-mm-dd.
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), 4000);
}

// Kept while switching tabs, gone on reload.
const form = { mode: 'due', date: '', exams: new Set(EXAMS.map((e) => e.id)) };

const STATUS_TEXT = {
  upcoming: 'Noch nicht möglich',
  early: 'Schon möglich, bevorzugter Zeitraum kommt noch',
  now: 'Jetzt im bevorzugten Zeitraum',
  late: 'Bevorzugter Zeitraum vorbei, nur noch möglich',
  missed: 'Zeitraum vorbei',
};

const statusText = (p) => (p.status === 'now' && !p.preferred ? 'Jetzt möglich' : STATUS_TEXT[p.status]);

const AXIS = [10, 36]; // weeks shown on the bars

const short = (iso) => iso.split('-').reverse().join('.');

function sswPage() {
  const results = h('div', { class: 'ssw-results', 'aria-live': 'polite' });

  const modeRadio = (value, text) => h('label', { class: 'choice' },
    h('input', {
      type: 'radio', name: 'ssw-mode', value, checked: form.mode === value,
      onchange: () => { form.mode = value; dateLabel.textContent = labelText(); update(); },
    }), text);
  const labelText = () => (form.mode === 'due' ? 'Errechneter Geburtstermin' : 'Erster Tag der letzten Regel');
  const dateLabel = h('label', { for: 'ssw-date' }, labelText());
  const dateInput = h('input', {
    type: 'date', id: 'ssw-date', value: form.date,
    oninput: () => { form.date = dateInput.value; update(); },
  });

  const examChoices = h('fieldset', { class: 'choices' }, h('legend', {}, '2. Welche Untersuchungen?'),
    EXAMS.map((e) => h('label', { class: 'choice' },
      h('input', {
        type: 'checkbox', value: e.id, checked: form.exams.has(e.id),
        onchange: (ev) => { if (ev.target.checked) form.exams.add(e.id); else form.exams.delete(e.id); update(); },
      }), e.name)));

  function update() {
    results.replaceChildren(...renderResults(todayIso()));
  }

  const section = h('section', { class: 'ssw' },
    h('div', { class: 'intro' },
      h('h1', {}, 'Den richtigen Termin finden'),
      h('p', { class: 'hint' }, 'Für Ultraschall-Untersuchungen in der Schwangerschaft. Es wird nichts gespeichert.')),
    h('div', { class: 'card ssw-form' },
      h('fieldset', { class: 'choices' }, h('legend', {}, '1. Was weißt du?'),
        modeRadio('due', 'Geburtstermin'),
        modeRadio('lmp', 'Letzte Regel')),
      h('div', { class: 'field ssw-date' }, dateLabel, dateInput),
      examChoices,
      h('div', { class: 'actions' },
        h('button', {
          class: 'button small', type: 'button',
          onclick: () => { form.date = ''; dateInput.value = ''; update(); dateInput.focus(); },
        }, 'Neue Patientin'))),
    results);
  update();
  return section;
}

function renderResults(today) {
  if (!form.date) return [h('p', { class: 'hint' }, 'Gib zuerst ein Datum ein.')];
  if (!isIsoDate(form.date)) return [h('p', { class: 'error', role: 'alert' }, 'Bitte gib ein gültiges Datum ein.')];

  const lmp = form.mode === 'due' ? lmpFromDue(form.date) : form.date;
  const due = dueFromLmp(lmp);
  const age = gestation(lmp, today);
  if (!age) {
    return [h('p', { class: 'error', role: 'alert' }, form.mode === 'due'
      ? 'Dieser Geburtstermin liegt zu weit in der Zukunft (mehr als 40 Wochen).'
      : 'Der erste Tag der letzten Regel liegt in der Zukunft.')];
  }
  if (age.total > 44 * 7) {
    return [h('p', { class: 'error', role: 'alert' }, 'Dieser Geburtstermin liegt mehr als 4 Wochen zurück. Bitte prüfe das Datum.')];
  }

  const plans = EXAMS.filter((e) => form.exams.has(e.id)).map((e) => planExam(e, lmp, today));
  const out = [
    h('div', { class: 'balance ssw-facts' },
      fact('Heute', `SSW ${age.weeks}+${age.days}`, `${age.weeks + 1}. Schwangerschaftswoche`, 'is-main'),
      fact('Geburtstermin', short(due), weekdayDate(due)),
      fact('Letzte Regel', short(lmp), weekdayDate(lmp))),
  ];
  if (!plans.length) {
    out.push(h('p', { class: 'hint' }, 'Wähle mindestens eine Untersuchung.'));
    return out;
  }
  out.push(...examBlocks(plans, age.total),
    h('div', { class: 'actions' },
      h('button', { class: 'button', type: 'button', onclick: () => copy(plans, due, age) }, 'Als Text kopieren')));
  return out;
}

function fact(label, value, sub, cls = '') {
  return h('div', { class: `stat ${cls}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    h('span', { class: 'stat-sub' }, sub));
}

// "Mo 26.10. – Fr 6.11.2026": short enough to read at a glance.
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dayText(iso, withYear) {
  const d = dateOf(iso);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.${withYear ? d.getUTCFullYear() : ''}`;
}
const spanText = (w) => `${dayText(w.start, w.start.slice(0, 4) !== w.end.slice(0, 4))} – ${dayText(w.end, true)}`;

// One block per exam: name and status, the dates, and a bar from week 10 to 36
// (light = possible, dark = preferred, line = today) with its week scale.
function examBlocks(plans, todayDays) {
  const [a, b] = AXIS.map((x) => x * 7);
  const pos = (d) => `${Math.min(100, Math.max(0, ((d - a) / (b - a)) * 100))}%`;
  const place = (el, from, to) => {
    el.style.left = pos(from);
    el.style.width = `calc(${pos(to + 1)} - ${pos(from)})`;
    return el;
  };
  const marker = () => {
    if (todayDays < a || todayDays > b) return null;
    const el = h('span', { class: 'ssw-today', 'aria-hidden': 'true' });
    el.style.left = pos(todayDays);
    return el;
  };
  const ticks = () => {
    const axis = h('div', { class: 'ssw-axis', 'aria-hidden': 'true' });
    for (let wk = AXIS[0]; wk <= AXIS[1]; wk += 2) {
      const t = h('span', { class: wk % 4 ? 'minor' : null }, String(wk));
      t.style.left = pos(wk * 7);
      axis.append(t);
    }
    return axis;
  };
  const line = (label, w, main) => h('div', { class: `ssw-line${main ? ' is-main' : ''}` },
    h('span', { class: 'ssw-line-label' }, label),
    h('span', { class: 'ssw-line-dates' }, spanText(w)),
    h('span', { class: 'ssw-line-ssw' }, `SSW ${sswText(w.from)} – ${sswText(w.to)}`));

  return [
    h('ul', { class: 'legend' },
      h('li', {}, h('span', { class: 'swatch ssw-preferred' }), 'bevorzugt'),
      h('li', {}, h('span', { class: 'swatch ssw-possible' }), 'möglich'),
      h('li', {}, h('span', { class: 'swatch ssw-today-swatch' }), 'heute'),
      h('li', {}, 'Zahlen unter dem Balken: SSW')),
    ...plans.map((p) => h('article', { class: `card ssw-item is-${p.status}` },
      h('div', { class: 'ssw-item-head' },
        h('h2', {}, p.exam.name),
        h('span', { class: `ssw-status is-${p.status}` }, statusText(p))),
      p.preferred ? line('Bevorzugt', p.preferred, true) : null,
      line('Möglich', p.possible, !p.preferred),
      h('div', { class: 'ssw-track', 'aria-hidden': 'true' },
        place(h('span', { class: 'ssw-bar ssw-possible' }), p.possible.from, p.possible.to),
        p.preferred ? place(h('span', { class: 'ssw-bar ssw-preferred' }), p.preferred.from, p.preferred.to) : null,
        marker()),
      ticks())),
  ];
}

async function copy(plans, due, age) {
  const lines = [
    `Geburtstermin: ${longDate(due)} (heute SSW ${age.weeks}+${age.days})`,
    ...plans.flatMap((p) => [
      '',
      `${p.exam.name}: ${statusText(p)}`,
      `  möglich SSW ${sswText(p.possible.from)}–${sswText(p.possible.to)}: ${short(p.possible.start)} – ${short(p.possible.end)}`,
      ...(p.preferred ? [`  bevorzugt SSW ${sswText(p.preferred.from)}–${sswText(p.preferred.to)}: ${short(p.preferred.start)} – ${short(p.preferred.end)}`] : []),
    ]),
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showToast('Kopiert. Du kannst den Text jetzt einfügen.');
  } catch {
    showToast('Kopieren hat nicht geklappt.');
  }
}

document.getElementById('main').replaceChildren(sswPage());
