// The time windows for the pregnancy scans.
// No DOM here, so the tests can import it (test/ssw.test.js). Nothing is stored or sent.
//
// Windows are in days since the first day of the last period (LMP), written as
// "weeks + days" (12+0 = 12 completed weeks). Set by the practice on 28 Oct 2026.
// An exam without `preferred` has only a possible window.

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

export const lmpFromDue = (due) => addDays(due, -PREGNANCY_DAYS);
export const dueFromLmp = (lmp) => addDays(lmp, PREGNANCY_DAYS);

// Pregnancy age on a date: { weeks, days, total } or null before the LMP.
export function gestation(lmp, iso) {
  const total = daysBetween(lmp, iso);
  if (total < 0) return null;
  return { weeks: Math.floor(total / 7), days: total % 7, total };
}

export const sswText = (total) => `${Math.floor(total / 7)}+${total % 7}`;

// ---------- plan for one exam ----------

// status: 'upcoming' (not started), 'early' (possible, preferred not yet), 'now' (in the
// preferred window, or the possible one if there is no preferred), 'late' (preferred over,
// still possible), 'missed' (window over). preferred is null if the exam has none.
export function planExam(exam, lmp, today) {
  const span = ([a, b]) => ({ start: addDays(lmp, a), end: addDays(lmp, b), from: a, to: b });
  const possible = span(exam.possible);
  const preferred = exam.preferred ? span(exam.preferred) : null;
  const target = preferred || possible;

  let status;
  if (today > possible.end) status = 'missed';
  else if (today > target.end) status = 'late';
  else if (today >= target.start) status = 'now';
  else if (today >= possible.start) status = 'early';
  else status = 'upcoming';
  return { exam, possible, preferred, status };
}
