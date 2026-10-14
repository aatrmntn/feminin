// All counting and validation for the planner. The server is the only place that counts;
// the browser shows what the API returns. Dates are ISO days (YYYY-MM-DD) at UTC midnight.

export const TIME_ZONE = 'Europe/Vienna';
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const FULL_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const MIN_DATE = '2020-01-01';
export const MAX_DATE = '2040-12-31';
export const MAX_SPAN_DAYS = 92;
export const NOTE_MAX = 300;
export const NAME_MAX = 80;
export const KINDS = ['vacation', 'absence'];
export const HALVES = ['', 'am', 'pm'];
export const REASONS = {
  training: 'Fortbildung',
  conference: 'Kongress',
  school: 'Berufsschule',
  other: 'Sonstiges',
};
export const ROLES = { frontoffice: 'Frontoffice', backoffice: 'Backoffice', owner: 'Besitzer:in' };
// Entries in these states block the calendar and count; declined and withdrawn ones do not.
export const ACTIVE_STATUSES = ['pending', 'approved'];

export const DEFAULT_SETTINGS = {
  practiceName: 'feminin',
  openDays: FULL_WEEK,
  minimumStaffing: { frontoffice: 2 },
  defaultAllowance: 25,
  carryOverExpires: '03-31',
  absenceNeedsApproval: true,
  timeZone: TIME_ZONE,
  country: 'AT',
};

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

// ---------- dates ----------

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toIso(toDate(s)) === s;
}

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

// Number of calendar days from a to b, both included.
export function spanDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000) + 1;
}

export function weekdayOf(iso) {
  return WEEKDAYS[toDate(iso).getUTCDay()];
}

export function eachDay(start, end, fn) {
  for (let d = start; d <= end; d = addDays(d, 1)) fn(d);
}

// "Today" as the practice sees it, not as the server's clock (UTC) sees it.
export function todayIn(timeZone = TIME_ZONE, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function formatDay(iso, { year = true } = {}) {
  const d = toDate(iso);
  const text = `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
  return year ? `${text} ${d.getUTCFullYear()}` : text;
}

export function formatRange(start, end) {
  if (start === end) return formatDay(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, { year: !sameYear })} bis ${formatDay(end)}`;
}

// ---------- public holidays (Austria) ----------

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year) {
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
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

// Good Friday, 24 and 31 December are not public holidays in Austria.
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

const holidayCache = new Map();
export function holidayName(iso) {
  const year = Number(iso.slice(0, 4));
  if (!holidayCache.has(year)) {
    holidayCache.set(year, new Map(publicHolidays(year).map((h) => [h.date, h.name])));
  }
  return holidayCache.get(year).get(iso) || '';
}

// ---------- closures ----------

// Set of ISO days on which the whole practice is closed (approved closure entries).
export function closureDays(closures = []) {
  const days = new Set();
  for (const c of closures) {
    if (c.kind !== 'closure' || c.status !== 'approved') continue;
    eachDay(c.start, c.end, (d) => days.add(d));
  }
  return days;
}

// ---------- counting ----------

export function normalizePattern(pattern) {
  if (!Array.isArray(pattern)) return [...FULL_WEEK];
  return WEEKDAYS.filter((d) => pattern.includes(d));
}

// A vacation day is a day in the person's work pattern that is neither a public holiday
// nor a practice closure day.
export function isVacationDay(iso, pattern, closed = new Set()) {
  return pattern.includes(weekdayOf(iso)) && !holidayName(iso) && !closed.has(iso);
}

// Vacation days an entry costs, split per calendar year. Half days count 0.5.
export function countEntry(entry, pattern, closed = new Set()) {
  const unit = entry.half ? 0.5 : 1;
  const byYear = {};
  let total = 0;
  eachDay(entry.start, entry.end, (d) => {
    if (!isVacationDay(d, pattern, closed)) return;
    const y = d.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + unit;
    total += unit;
  });
  return { total, byYear };
}

export function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

// 25 days on a 5-day week, scaled to the person's own days and rounded to half days.
export function defaultAllowance(pattern, base = DEFAULT_SETTINGS.defaultAllowance) {
  return roundHalf((base * normalizePattern(pattern).length) / 5);
}

export function allowanceFor(person, year, settings = DEFAULT_SETTINGS) {
  const override = person.allowances?.[String(year)];
  if (typeof override === 'number') return override;
  return defaultAllowance(person.workPattern, settings.defaultAllowance);
}

export function carryOverFor(person, year) {
  const n = person.carryOver?.[String(year)];
  return typeof n === 'number' ? n : 0;
}

// Balance of one person for one year.
// entries: the person's own entries; closures: practice closures (any status, filtered here).
// Days before today are "taken", today and later "planned". Pending shows separately.
export function balance({ person, year, today, entries = [], closures = [], settings = DEFAULT_SETTINGS }) {
  const pattern = normalizePattern(person.workPattern);
  const closed = closureDays(closures);
  const y = String(year);
  let taken = 0;
  let planned = 0;
  let pending = 0;

  for (const e of entries) {
    if (e.kind !== 'vacation') continue;
    const days = countEntry(e, pattern, closed).byYear[y] || 0;
    if (!days) continue;
    if (e.status === 'pending') {
      pending += days;
    } else if (e.status === 'approved') {
      const split = splitTakenPlanned(e, pattern, closed, y, today);
      taken += split.taken;
      planned += split.planned;
    }
  }

  // Closures that count as vacation cost each person their own working days in them.
  for (const c of closures) {
    if (c.kind !== 'closure' || c.status !== 'approved' || !c.countsAsVacation) continue;
    eachDay(c.start, c.end, (d) => {
      if (d.slice(0, 4) !== y) return;
      if (!pattern.includes(weekdayOf(d)) || holidayName(d)) return;
      if (d < today) taken += 1; else planned += 1;
    });
  }

  const allowance = allowanceFor(person, year, settings);
  const carryOver = carryOverFor(person, year);
  const total = allowance + carryOver;
  return {
    year: Number(year),
    allowance,
    carryOver,
    total,
    taken,
    planned,
    pending,
    remaining: total - taken - planned,
  };
}

function splitTakenPlanned(entry, pattern, closed, year, today) {
  const unit = entry.half ? 0.5 : 1;
  let taken = 0;
  let planned = 0;
  eachDay(entry.start, entry.end, (d) => {
    if (d.slice(0, 4) !== year || !isVacationDay(d, pattern, closed)) return;
    if (d < today) taken += unit; else planned += unit;
  });
  return { taken, planned };
}

// ---------- minimum staffing ----------

// Is the practice open on this day (opening weekday, no public holiday, no closure)?
export function isOpenDay(iso, settings = DEFAULT_SETTINGS, closed = new Set()) {
  return settings.openDays.includes(weekdayOf(iso)) && !holidayName(iso) && !closed.has(iso);
}

// Is this person away at that time of day? Both vacation and other absences count.
function awayAt(entries, iso, half) {
  return entries.some((e) => e.start <= iso && e.end >= iso && (!e.half || e.half === half));
}

// Who is in, per role with a minimum, for each day. A half-day absence counts for its half,
// and the weaker half decides. entries: everyone's entries that should count as away.
// Returns Map(date → { open, roles: { role: { present, required } }, below }).
export function staffing({ dates, people, entries, closures = [], settings = DEFAULT_SETTINGS }) {
  const closed = closureDays(closures);
  const minimum = settings.minimumStaffing || {};
  const byPerson = new Map();
  for (const e of entries) {
    if (!['vacation', 'absence'].includes(e.kind)) continue;
    if (!byPerson.has(e.userId)) byPerson.set(e.userId, []);
    byPerson.get(e.userId).push(e);
  }
  const result = new Map();
  for (const iso of dates) {
    if (!isOpenDay(iso, settings, closed)) {
      result.set(iso, { open: false, roles: {}, below: false });
      continue;
    }
    const wd = weekdayOf(iso);
    const roles = {};
    let below = false;
    for (const [role, required] of Object.entries(minimum)) {
      const members = people.filter((p) => p.active !== false && p.role === role
        && normalizePattern(p.workPattern).includes(wd));
      const presentAt = (half) => members.filter((p) => !awayAt(byPerson.get(p.userId) || [], iso, half)).length;
      const present = Math.min(presentAt('am'), presentAt('pm'));
      roles[role] = { present, required };
      if (present < required) below = true;
    }
    result.set(iso, { open: true, roles, below });
  }
  return result;
}

// Days on which this entry leaves the owner's role below its minimum, counting the
// approved entries of everyone else. Returns [{ date, role, present, required }].
export function staffingWarnings({ entry, owner, people, entries, closures = [], settings = DEFAULT_SETTINGS }) {
  const required = settings.minimumStaffing?.[owner.role];
  if (!required) return [];
  const pattern = normalizePattern(owner.workPattern);
  const dates = [];
  eachDay(entry.start, entry.end, (d) => { if (pattern.includes(weekdayOf(d))) dates.push(d); });
  const counted = entries.filter((e) => e.status === 'approved' && e.id !== entry.id && e.userId !== owner.userId)
    .concat({ ...entry, userId: owner.userId });
  const map = staffing({ dates, people, entries: counted, closures, settings });
  return dates
    .filter((d) => map.get(d).open && map.get(d).roles[owner.role]?.present < required)
    .map((d) => ({ date: d, role: owner.role, ...map.get(d).roles[owner.role] }));
}

export function describeWarnings(warnings) {
  if (!warnings.length) return '';
  const role = ROLES[warnings[0].role] || warnings[0].role;
  const worst = Math.min(...warnings.map((w) => w.present));
  const { required } = warnings[0];
  const days = warnings.length === 1
    ? `Am ${formatDay(warnings[0].date)}`
    : `An ${warnings.length} Tagen (${formatRange(warnings[0].date, warnings.at(-1).date)})`;
  const who = worst === 0 ? 'wäre im ROLE niemand' : worst === 1 ? 'wäre im ROLE nur 1 Person' : `wären im ROLE nur ${worst} Personen`;
  return `${days} ${who.replace('ROLE', role)} da. Gebraucht werden ${required}.`;
}

// ---------- validation ----------

export function overlaps(a, b) {
  if (a.start > b.end || b.start > a.end) return false;
  // A morning and an afternoon half day on the same date may sit side by side.
  if (a.half && b.half && a.start === b.start && a.half !== b.half) return false;
  return true;
}

// Checks and normalises an entry a person wants to book or change.
// existing: the person's own entries (the one being edited is skipped by id).
// Returns { value } or { error } with a message a person can act on.
export function validateEntry(input, { existing = [], pattern = FULL_WEEK, closures = [], id = null } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const kind = src.kind;
  if (!KINDS.includes(kind)) return fail('Bitte wähle Urlaub oder eine andere Abwesenheit.');

  const reason = kind === 'absence' ? src.reason : '';
  if (kind === 'absence' && !Object.hasOwn(REASONS, reason)) {
    return fail('Bitte wähle einen Grund: Fortbildung, Kongress, Berufsschule oder Sonstiges.');
  }

  const start = typeof src.start === 'string' ? src.start.trim() : '';
  const end = typeof src.end === 'string' && src.end.trim() ? src.end.trim() : start;
  if (!isIsoDate(start)) return fail('Bitte gib ein gültiges Startdatum an.');
  if (!isIsoDate(end)) return fail('Bitte gib ein gültiges Enddatum an.');
  if (start < MIN_DATE || end > MAX_DATE) {
    return fail('Daten müssen zwischen 2020 und 2040 liegen.');
  }
  if (end < start) return fail('Das Enddatum liegt vor dem Startdatum.');
  if (spanDays(start, end) > MAX_SPAN_DAYS) {
    return fail(`Ein Eintrag darf höchstens ${MAX_SPAN_DAYS} Tage lang sein. Teile ihn bitte auf.`);
  }

  const half = src.half || '';
  if (!HALVES.includes(half)) return fail('Halber Tag: bitte Vormittag oder Nachmittag wählen.');
  if (half && start !== end) return fail('Ein halber Tag beginnt und endet am selben Datum.');

  const note = typeof src.note === 'string' ? src.note.trim() : '';
  if (note.length > NOTE_MAX) return fail(`Die Notiz darf höchstens ${NOTE_MAX} Zeichen haben.`);

  const value = { kind, reason, start, end, half, note };
  const ownPattern = normalizePattern(pattern);
  const closed = closureDays(closures);

  if (kind === 'vacation' && countEntry(value, ownPattern, closed).total === 0) {
    return fail('In diesem Zeitraum liegen nur freie Tage (Wochenende, Feiertag, Betriebsurlaub '
      + 'oder kein Arbeitstag von dir). Es gibt nichts zu buchen.');
  }

  const clash = existing.find((e) => e.id !== id && ACTIVE_STATUSES.includes(e.status) && overlaps(value, e));
  if (clash) {
    return fail(`Das überschneidet sich mit deinem Eintrag ${describeDates(clash)}. `
      + 'Ändere lieber diesen Eintrag.');
  }
  return { value };
}

export function validateName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return fail('Bitte gib einen Namen an.');
  if (value.length > NAME_MAX) return fail(`Der Name darf höchstens ${NAME_MAX} Zeichen haben.`);
  return { value };
}

function describeDates(e) {
  if (e.start === e.end) {
    const half = e.half === 'am' ? ' (Vormittag)' : e.half === 'pm' ? ' (Nachmittag)' : '';
    return `am ${formatDay(e.start)}${half}`;
  }
  return `vom ${formatRange(e.start, e.end)}`;
}

function fail(error) {
  return { error };
}
