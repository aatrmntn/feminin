// The time windows for the pregnancy scans and the date suggestions.
// No DOM here, so the tests can import it (test/ssw.test.js). Nothing is stored or sent.
//
// Windows are in days since the first day of the last period (LMP), written as
// "weeks + days" (12+0 = 12 completed weeks). Set by the practice on 28 Oct 2026;
// 3D-Ultraschall still as in FEMININ_SSW-RECHNER.xlsx, its preferred window a proposal.

const w = (weeks, days = 0) => weeks * 7 + days;

export const EXAMS = [
  {
    id: 'ets',
    name: 'Ersttrimesterscreening',
    note: 'Combined Test, Nackenfaltenmessung',
    possible: [w(11, 0), w(13, 6)],
    preferred: [w(12, 0), w(13, 4)],
  },
  {
    id: 'organ',
    name: 'Organscreening',
    note: 'genaue Untersuchung der kindlichen Organe',
    possible: [w(18, 0), w(23, 6)],
    preferred: [w(21, 0), w(22, 4)],
  },
  {
    id: '3d',
    name: '3D-Ultraschall',
    note: '3/4D-Schwangerschaftsultraschall',
    possible: [w(26, 0), w(29, 6)],
    preferred: [w(27, 0), w(28, 6)],
  },
  {
    id: 'growth',
    name: 'Wachstumsultraschall',
    note: 'Wachstum, Fruchtwasser, Doppler',
    possible: [w(30, 0), w(33, 6)],
    preferred: [w(31, 0), w(32, 4)],
  },
];

export const PREGNANCY_DAYS = 280; // Naegele: due date = LMP + 280 days

// ---------- dates (ISO yyyy-mm-dd, counted in UTC so time zones never shift a day) ----------

const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);

export function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateOf(s).toISOString().slice(0, 10) === s;
}

export function addDays(iso, n) {
  const d = dateOf(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
export const weekdayKey = (iso) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateOf(iso).getUTCDay()];

export const lmpFromDue = (due) => addDays(due, -PREGNANCY_DAYS);
export const dueFromLmp = (lmp) => addDays(lmp, PREGNANCY_DAYS);

// Pregnancy age on a date: { weeks, days, total } or null before the LMP.
export function gestation(lmp, iso) {
  const total = daysBetween(lmp, iso);
  if (total < 0) return null;
  return { weeks: Math.floor(total / 7), days: total % 7, total };
}

export const sswText = (total) => `${Math.floor(total / 7)}+${total % 7}`;

// ---------- public holidays (Austria), same rules as the Urlaubsplaner ----------

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function publicHolidays(year) {
  const easter = easterSunday(year);
  const fixed = (md, name) => ({ date: `${year}-${md}`, name });
  const moving = (offset, name) => ({ date: addDays(easter, offset), name });
  return [
    fixed('01-01', 'Neujahr'),
    fixed('01-06', 'Heilige Drei Könige'),
    moving(1, 'Ostermontag'),
    fixed('05-01', 'Staatsfeiertag'),
    moving(39, 'Christi Himmelfahrt'),
    moving(50, 'Pfingstmontag'),
    moving(60, 'Fronleichnam'),
    fixed('08-15', 'Mariä Himmelfahrt'),
    fixed('10-26', 'Nationalfeiertag'),
    fixed('11-01', 'Allerheiligen'),
    fixed('12-08', 'Mariä Empfängnis'),
    fixed('12-25', 'Christtag'),
    fixed('12-26', 'Stefanitag'),
  ].sort((x, y) => x.date.localeCompare(y.date));
}

// A test for "is the practice open?": opening weekdays, no public holiday, no closure.
// closures: [{ start, end }], e.g. CLOSURES in app.js.
export function openDayTest(openDays = ['mon', 'tue', 'wed', 'thu', 'fri'], closures = []) {
  const holidays = new Map();
  const isHoliday = (iso) => {
    const y = Number(iso.slice(0, 4));
    if (!holidays.has(y)) holidays.set(y, new Set(publicHolidays(y).map((x) => x.date)));
    return holidays.get(y).has(iso);
  };
  return (iso) => openDays.includes(weekdayKey(iso)) && !isHoliday(iso)
    && !closures.some((c) => c.start <= iso && iso <= c.end);
}

// ---------- plan for one exam ----------

// status: 'upcoming' (not started), 'early' (possible, preferred not yet), 'now' (in the
// preferred window), 'late' (preferred over, still possible), 'missed' (window over).
// suggestions: up to `count` open days, spread over the window that is still ahead.
export function planExam(exam, lmp, today, { isOpen = () => true, count = 4 } = {}) {
  const span = ([a, b]) => ({ start: addDays(lmp, a), end: addDays(lmp, b), from: a, to: b });
  const possible = span(exam.possible);
  const preferred = span(exam.preferred);

  let status;
  if (today > possible.end) status = 'missed';
  else if (today > preferred.end) status = 'late';
  else if (today >= preferred.start) status = 'now';
  else if (today >= possible.start) status = 'early';
  else status = 'upcoming';

  let days = [];
  if (status !== 'missed') {
    days = openDays(status === 'late' ? possible : preferred, today, isOpen);
    // Only closed days left in the preferred window: offer the rest of the possible one.
    if (!days.length) days = openDays(possible, today, isOpen);
  }
  const suggestions = spread(days, count).map((date) => ({ date, ssw: sswText(daysBetween(lmp, date)) }));
  return { exam, possible, preferred, status, suggestions };
}

function openDays(range, today, isOpen) {
  const out = [];
  for (let d = range.start > today ? range.start : today; d <= range.end; d = addDays(d, 1)) {
    if (isOpen(d)) out.push(d);
  }
  return out;
}

function spread(list, count) {
  if (list.length <= count) return list;
  if (count === 1) return [list[Math.floor(list.length / 2)]];
  return Array.from({ length: count }, (_, i) => list[Math.round((i * (list.length - 1)) / (count - 1))]);
}
