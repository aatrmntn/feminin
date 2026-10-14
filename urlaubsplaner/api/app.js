// Routes of the API. Independent of AWS: the Lambda handler and the local dev server both
// pass in a request and a database. Every route checks the caller itself.
import { randomUUID } from 'node:crypto';
import * as rules from './rules.js';
import { ConflictError, HttpError } from './errors.js';

export { ConflictError, HttpError };

const NOT_FOUND = 'Diesen Eintrag gibt es nicht (mehr).';
const NOT_SET_UP = 'Dein Zugang ist noch nicht eingerichtet. Bitte melde dich bei der Praxisleitung.';

export function createApp({ db, now = () => new Date() }) {
  async function handle(req) {
    try {
      const body = await route(req);
      return { status: req.method === 'POST' && body?.created ? 201 : 200, body: strip(body) };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
      console.error('Unexpected error', err?.name, err?.message);
      return { status: 500, body: { error: 'Etwas ist schiefgelaufen. Bitte versuche es gleich noch einmal.' } };
    }
  }

  async function route(req) {
    if (!req.user?.id) throw new HttpError(401, 'Bitte melde dich an.');
    const path = req.path.replace(/\/+$/, '');
    const m = path.match(/^\/api\/entries\/([0-9a-f-]{36})$/);

    if (req.method === 'GET' && path === '/api/overview') return overview(req);
    if (req.method === 'POST' && path === '/api/check') return check(req);
    if (req.method === 'POST' && path === '/api/entries') return createEntry(req);
    if (req.method === 'PUT' && path === '/api/me') return updateMe(req);
    if (m && req.method === 'GET') return getEntry(req, m[1]);
    if (m && req.method === 'PUT') return updateEntry(req, m[1]);
    if (m && req.method === 'DELETE') return deleteEntry(req, m[1]);
    if (path.startsWith('/api/entries/')) throw new HttpError(404, NOT_FOUND);
    throw new HttpError(404, 'Diese Adresse gibt es nicht.');
  }

  // ----- helpers -----

  async function caller(req) {
    const person = await db.getPerson(req.user.id);
    if (!person || person.active === false) throw new HttpError(403, NOT_SET_UP);
    const isApprover = (req.user.groups || []).includes('approver');
    return { person, isApprover };
  }

  async function context() {
    const settings = { ...rules.DEFAULT_SETTINGS, ...(await db.getSettings()) };
    const today = rules.todayIn(settings.timeZone, now());
    return { settings, today };
  }

  // Approved and pending closures around a date range (closures are practice-wide).
  async function closuresAround(start, end) {
    const years = new Set([start.slice(0, 4), end.slice(0, 4)]);
    const all = [];
    for (const y of years) all.push(...(await db.listYearEntries(Number(y))));
    const seen = new Set();
    return all.filter((e) => e.kind === 'closure' && !seen.has(e.id) && seen.add(e.id));
  }

  // The entry and its owner, if the caller may see it. Anything else is a 404.
  async function visibleEntry(id, me) {
    const entry = await db.getEntry(id);
    if (!entry) throw new HttpError(404, NOT_FOUND);
    if (entry.userId !== me.person.userId && !me.isApprover) throw new HttpError(404, NOT_FOUND);
    const owner = entry.userId === me.person.userId ? me.person : await db.getPerson(entry.userId);
    if (!owner) throw new HttpError(404, NOT_FOUND);
    return { entry, owner };
  }

  function readBody(req) {
    if (req.body === undefined || req.body === null) return {};
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new HttpError(400, 'Die Anfrage konnte nicht gelesen werden.');
    }
    return req.body;
  }

  async function validate(input, owner, id) {
    if (input.kind === 'closure') {
      throw new HttpError(400, 'Betriebsurlaub kann erst in einer späteren Version eingetragen werden.');
    }
    const start = rules.isIsoDate(input.start) ? input.start : null;
    const end = rules.isIsoDate(input.end) ? input.end : start;
    let existing = [];
    let closures = [];
    if (start && end && end >= start && rules.spanDays(start, end) <= rules.MAX_SPAN_DAYS) {
      existing = await db.listUserEntries(owner.userId, start, end);
      closures = await closuresAround(start, end);
    }
    const result = rules.validateEntry(input, {
      existing: existing.filter((e) => e.kind !== 'closure'),
      pattern: rules.normalizePattern(owner.workPattern),
      closures,
      id,
    });
    return { ...result, closures };
  }

  function present(entry, owner, closures, { withNote }) {
    const pattern = rules.normalizePattern(owner.workPattern);
    const out = {
      id: entry.id,
      userId: entry.userId,
      kind: entry.kind,
      reason: entry.reason || '',
      start: entry.start,
      end: entry.end,
      half: entry.half || '',
      status: entry.status,
      rev: entry.rev,
      days: entry.kind === 'vacation' ? rules.countEntry(entry, pattern, rules.closureDays(closures)).total : 0,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
    if (withNote) out.note = entry.note || '';
    return out;
  }

  function auditRecord(me, action, entry) {
    // Never put notes or tokens in the audit log.
    return {
      id: randomUUID(),
      at: now().toISOString(),
      actorId: me.person.userId,
      action,
      entryId: entry.id,
      subjectUserId: entry.userId,
      kind: entry.kind,
      start: entry.start,
      end: entry.end,
      half: entry.half || '',
      status: entry.status,
    };
  }

  function initialStatus(kind, settings) {
    if (kind === 'absence' && !settings.absenceNeedsApproval) return 'approved';
    return 'pending';
  }

  // ----- routes -----

  async function overview(req) {
    const me = await caller(req);
    const { settings, today } = await context();
    const year = req.query?.year ? Number(req.query.year) : Number(today.slice(0, 4));
    if (!Number.isInteger(year) || year < 2020 || year > 2040) {
      throw new HttpError(400, 'Bitte wähle ein Jahr zwischen 2020 und 2040.');
    }
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const [own, yearEntries] = await Promise.all([
      db.listUserEntries(me.person.userId, from, to),
      db.listYearEntries(year),
    ]);
    const closures = yearEntries.filter((e) => e.kind === 'closure');
    const entries = own
      .filter((e) => e.kind !== 'closure' && rules.ACTIVE_STATUSES.concat('declined').includes(e.status))
      .sort((a, b) => a.start.localeCompare(b.start));
    const pattern = rules.normalizePattern(me.person.workPattern);

    return {
      item: {
        year,
        today,
        me: {
          userId: me.person.userId,
          name: me.person.name,
          role: me.person.role,
          roleLabel: rules.ROLES[me.person.role] || '',
          workPattern: pattern,
          canApprove: me.isApprover,
        },
        practice: { name: settings.practiceName, openDays: settings.openDays },
        holidays: rules.publicHolidays(year),
        closures: closures
          .filter((c) => c.status === 'approved')
          .map((c) => ({ start: c.start, end: c.end, countsAsVacation: !!c.countsAsVacation, note: c.reason || '' })),
        entries: entries.map((e) => present(e, me.person, closures, { withNote: true })),
        balance: rules.balance({ person: me.person, year, today, entries, closures, settings }),
        reasons: rules.REASONS,
      },
    };
  }

  // Live summary for the drawer: how many days, what is left afterwards. Never writes.
  async function check(req) {
    const me = await caller(req);
    const input = readBody(req);
    const id = typeof input.id === 'string' ? input.id : null;
    let owner = me.person;
    if (id) ({ owner } = await visibleEntry(id, me));
    const { settings, today } = await context();
    const { value, error, closures } = await validate(input, owner, id);
    if (error) return { item: { ok: false, error } };

    const pattern = rules.normalizePattern(owner.workPattern);
    const { total, byYear } = value.kind === 'vacation'
      ? rules.countEntry(value, pattern, rules.closureDays(closures))
      : { total: 0, byYear: {} };
    const after = {};
    for (const y of Object.keys(byYear)) {
      const entries = (await db.listUserEntries(owner.userId, `${y}-01-01`, `${y}-12-31`))
        .filter((e) => e.kind === 'vacation' && e.id !== id);
      const b = rules.balance({ person: owner, year: Number(y), today, entries, closures, settings });
      after[y] = b.remaining - b.pending - byYear[y];
    }
    return { item: { ok: true, days: total, byYear, remainingAfter: after } };
  }

  async function createEntry(req) {
    const me = await caller(req);
    const { settings } = await context();
    const { value, error, closures } = await validate(readBody(req), me.person, null);
    if (error) throw new HttpError(400, error);
    const at = now().toISOString();
    const entry = {
      id: randomUUID(),
      userId: me.person.userId,
      ...value,
      status: initialStatus(value.kind, settings),
      rev: 1,
      createdAt: at,
      updatedAt: at,
    };
    await db.createEntry(entry, auditRecord(me, 'create', entry));
    return { created: true, item: present(entry, me.person, closures, { withNote: true }) };
  }

  async function getEntry(req, id) {
    const me = await caller(req);
    const { entry, owner } = await visibleEntry(id, me);
    const closures = await closuresAround(entry.start, entry.end);
    return { item: present(entry, owner, closures, { withNote: true }) };
  }

  function guardPast(entry, me, today) {
    if (!me.isApprover && entry.status === 'approved' && entry.start < today) {
      throw new HttpError(403, 'Dieser Eintrag hat schon begonnen. Änderungen macht die Praxisleitung.');
    }
  }

  function expectedRev(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, 'Es fehlt die Versionsnummer. Bitte lade die Seite neu.');
    }
    return n;
  }

  async function updateEntry(req, id) {
    const me = await caller(req);
    const input = readBody(req);
    const { entry, owner } = await visibleEntry(id, me);
    if (entry.kind === 'closure') throw new HttpError(404, NOT_FOUND);
    const rev = expectedRev(input.expectedRev);
    if (rev !== entry.rev) throw new ConflictError();
    const { settings, today } = await context();
    guardPast(entry, me, today);

    const { value, error, closures } = await validate(input, owner, id);
    if (error) throw new HttpError(400, error);

    const datesChanged = ['kind', 'reason', 'start', 'end', 'half'].some((k) => (entry[k] || '') !== value[k]);
    let status = entry.status;
    if (datesChanged && status !== 'pending') status = initialStatus(value.kind, settings);
    const next = { ...entry, ...value, status, rev: entry.rev + 1, updatedAt: now().toISOString() };
    if (datesChanged) {
      delete next.decidedBy;
      delete next.decidedAt;
      delete next.decisionComment;
    }
    await db.updateEntry(next, rev, auditRecord(me, 'update', next));
    return { item: present(next, owner, closures, { withNote: true }) };
  }

  async function deleteEntry(req, id) {
    const me = await caller(req);
    const { entry } = await visibleEntry(id, me);
    if (entry.kind === 'closure') throw new HttpError(404, NOT_FOUND);
    const rev = expectedRev(req.query?.rev);
    if (rev !== entry.rev) throw new ConflictError();
    const { today } = await context();
    guardPast(entry, me, today);
    await db.deleteEntry(id, rev, auditRecord(me, 'delete', entry));
    return { item: { id, deleted: true } };
  }

  async function updateMe(req) {
    const me = await caller(req);
    const { value, error } = rules.validateName(readBody(req).name);
    if (error) throw new HttpError(400, error);
    const person = { ...me.person, name: value, updatedAt: now().toISOString() };
    await db.putPerson(person);
    return { item: { name: person.name } };
  }

  return { handle };
}

function strip(body) {
  if (body && typeof body === 'object' && 'created' in body) {
    const { created, ...rest } = body;
    return rest;
  }
  return body;
}
