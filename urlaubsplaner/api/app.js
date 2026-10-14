// Routes of the API. Independent of AWS: the Lambda handler and the local dev server both
// pass in a request and a database. Every route checks the caller itself.
import { randomUUID } from 'node:crypto';
import * as rules from './rules.js';
import { ConflictError, HttpError } from './errors.js';

export { ConflictError, HttpError };

const NOT_FOUND = 'Diesen Eintrag gibt es nicht (mehr).';
const NOT_SET_UP = 'Dein Zugang ist noch nicht eingerichtet. Bitte melde dich bei der Praxisleitung.';

// notify (optional): async ({ to: [emails], subject, text }) => void. Used for request emails.
export function createApp({ db, now = () => new Date(), notify = null, appUrl = '' }) {
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
    const decision = path.match(/^\/api\/entries\/([0-9a-f-]{36})\/decision$/);

    if (req.method === 'GET' && path === '/api/overview') return overview(req);
    if (req.method === 'POST' && path === '/api/check') return check(req);
    if (req.method === 'POST' && path === '/api/entries') return createEntry(req);
    if (req.method === 'PUT' && path === '/api/me') return updateMe(req);
    if (req.method === 'GET' && path === '/api/team') return team(req);
    if (req.method === 'GET' && path === '/api/requests') return requests(req);
    if (decision && req.method === 'POST') return decide(req, decision[1]);
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

  // Everyone's entries (all kinds and states) that touch a date range.
  async function entriesAround(start, end) {
    const all = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      all.push(...(await db.listYearEntries(y)));
    }
    const seen = new Set();
    return all.filter((e) => e.start <= end && e.end >= start && !seen.has(e.id) && seen.add(e.id));
  }

  // Closures around a date range (closures are practice-wide).
  async function closuresAround(start, end) {
    return (await entriesAround(start, end)).filter((e) => e.kind === 'closure');
  }

  function requireApprover(me) {
    if (!me.isApprover) throw new HttpError(403, 'Das darf nur die Praxisleitung.');
  }

  // Days on which this entry would leave the owner's role below the minimum.
  async function warningsFor(entry, owner, settings) {
    if (!settings.minimumStaffing?.[owner.role]) return { warnings: [], warningText: '' };
    const [people, around] = await Promise.all([db.listPeople(), entriesAround(entry.start, entry.end)]);
    const warnings = rules.staffingWarnings({
      entry,
      owner,
      people,
      entries: around.filter((e) => e.kind !== 'closure'),
      closures: around.filter((e) => e.kind === 'closure'),
      settings,
    });
    return { warnings, warningText: rules.describeWarnings(warnings) };
  }

  // Emails never contain notes. A failed email never fails the request.
  async function send(to, subject, lines) {
    const recipients = [...new Set(to.filter(Boolean))];
    if (!notify || !recipients.length) return;
    try {
      await notify({ to: recipients, subject, text: [...lines, '', appUrl ? `Zum Planer: ${appUrl}` : ''].join('\n').trim() });
    } catch (err) {
      console.error('Email failed', err?.name, err?.message);
    }
  }

  function describeEntry(entry, owner) {
    const what = entry.kind === 'vacation' ? 'Urlaub' : (rules.REASONS[entry.reason] || 'Abwesenheit');
    const half = entry.half === 'am' ? ', Vormittag' : entry.half === 'pm' ? ', Nachmittag' : '';
    const days = entry.kind === 'vacation'
      ? ` (${rules.countEntry(entry, rules.normalizePattern(owner.workPattern)).total} Tage)`
      : '';
    return `${what}: ${rules.formatRange(entry.start, entry.end)}${half}${days}`;
  }

  async function tellApprovers(entry, owner, settings) {
    if (entry.status !== 'pending' || !notify) return;
    const people = await db.listPeople();
    const to = people
      .filter((p) => p.active !== false && p.role === 'owner' && p.userId !== owner.userId)
      .map((p) => p.email);
    const { warningText } = await warningsFor(entry, owner, settings);
    await send(to, `Neuer Antrag von ${owner.name}`, [
      `${owner.name} hat einen Antrag gestellt.`,
      describeEntry(entry, owner),
      warningText ? `Achtung: ${warningText}` : '',
    ].filter(Boolean));
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
    if (withNote) {
      out.note = entry.note || '';
      out.decisionComment = entry.decisionComment || '';
    }
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
        openRequests: me.isApprover ? await countOpenRequests(me, today) : 0,
      },
    };
  }

  async function countOpenRequests(me, today) {
    const year = Number(today.slice(0, 4));
    const seen = new Set();
    const lists = await Promise.all([year - 1, year, year + 1].map((y) => db.listYearEntries(y)));
    return lists.flat().filter((e) => e.kind !== 'closure' && e.status === 'pending'
      && e.userId !== me.person.userId && !seen.has(e.id) && seen.add(e.id)).length;
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
    const { warnings, warningText } = await warningsFor({ ...value, id }, owner, settings);
    return { item: { ok: true, days: total, byYear, remainingAfter: after, warnings, warningText } };
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
    await tellApprovers(entry, me.person, settings);
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
    if (status === 'pending' && datesChanged) await tellApprovers(next, owner, settings);
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

  // Month timeline for everyone: names, dates, type and status. Never notes.
  async function team(req) {
    const me = await caller(req);
    const { settings, today } = await context();
    const month = typeof req.query?.month === 'string' ? req.query.month : today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2020-01' || month > '2040-12') {
      throw new HttpError(400, 'Bitte wähle einen Monat zwischen 2020 und 2040.');
    }
    const first = `${month}-01`;
    const last = rules.addDays(rules.addDays(first, 32).slice(0, 7) + '-01', -1);
    const dates = [];
    rules.eachDay(first, last, (d) => dates.push(d));

    const [people, around] = await Promise.all([db.listPeople(), entriesAround(first, last)]);
    const active = people.filter((p) => p.active !== false);
    const closures = around.filter((e) => e.kind === 'closure');
    const entries = around.filter((e) => e.kind !== 'closure' && rules.ACTIVE_STATUSES.includes(e.status)
      && active.some((p) => p.userId === e.userId));
    const approved = rules.staffing({ dates, people: active, entries: entries.filter((e) => e.status === 'approved'), closures, settings });
    const planned = rules.staffing({ dates, people: active, entries, closures, settings });
    const roleOrder = Object.keys(rules.ROLES);

    return {
      item: {
        month,
        today,
        me: { userId: me.person.userId, canApprove: me.isApprover },
        roles: rules.ROLES,
        reasons: rules.REASONS,
        minimumStaffing: settings.minimumStaffing,
        people: active
          .map((p) => ({
            userId: p.userId, name: p.name, role: p.role, workPattern: rules.normalizePattern(p.workPattern),
          }))
          .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name, 'de')),
        entries: entries.map((e) => ({
          id: e.id, userId: e.userId, kind: e.kind, reason: e.reason || '', start: e.start, end: e.end, half: e.half || '', status: e.status,
        })),
        holidays: dates.filter((d) => rules.holidayName(d)).map((d) => ({ date: d, name: rules.holidayName(d) })),
        closures: closures.filter((c) => c.status === 'approved').map((c) => ({ start: c.start, end: c.end })),
        days: dates.map((d) => ({
          date: d,
          open: approved.get(d).open,
          roles: approved.get(d).roles,
          below: approved.get(d).below,
          belowIfApproved: planned.get(d).below,
        })),
      },
    };
  }

  // Approvers: everything waiting for a decision, oldest request first, with staffing warnings.
  async function requests(req) {
    const me = await caller(req);
    requireApprover(me);
    const { settings, today } = await context();
    const year = Number(today.slice(0, 4));
    const [people, ...years] = await Promise.all([
      db.listPeople(),
      ...[year - 1, year, year + 1].map((y) => db.listYearEntries(y)),
    ]);
    const seen = new Set();
    const pending = years.flat()
      .filter((e) => e.kind !== 'closure' && e.status === 'pending' && !seen.has(e.id) && seen.add(e.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const items = [];
    for (const e of pending) {
      const owner = people.find((p) => p.userId === e.userId);
      if (!owner) continue;
      const closures = await closuresAround(e.start, e.end);
      items.push({
        ...present(e, owner, closures, { withNote: true }),
        name: owner.name,
        role: owner.role,
        roleLabel: rules.ROLES[owner.role] || '',
        isOwn: owner.userId === me.person.userId,
        ...(await warningsFor(e, owner, settings)),
      });
    }
    return { item: { today, reasons: rules.REASONS, requests: items } };
  }

  async function decide(req, id) {
    const me = await caller(req);
    requireApprover(me);
    const input = readBody(req);
    const { entry, owner } = await visibleEntry(id, me);
    if (entry.kind === 'closure') throw new HttpError(404, NOT_FOUND);
    if (!['approved', 'declined'].includes(input.status)) {
      throw new HttpError(400, 'Bitte wähle Bestätigen oder Ablehnen.');
    }
    const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
    if (comment.length > rules.NOTE_MAX) {
      throw new HttpError(400, `Der Kommentar darf höchstens ${rules.NOTE_MAX} Zeichen haben.`);
    }
    if (owner.userId === me.person.userId) {
      throw new HttpError(403, 'Den eigenen Antrag bestätigt die andere Person aus der Praxisleitung.');
    }
    const rev = expectedRev(input.expectedRev);
    if (rev !== entry.rev) throw new ConflictError();
    if (entry.status !== 'pending') {
      throw new HttpError(409, 'Über diesen Antrag wurde schon entschieden. Bitte lade die Seite neu.');
    }
    const at = now().toISOString();
    const next = {
      ...entry,
      status: input.status,
      decidedBy: me.person.userId,
      decidedAt: at,
      decisionComment: comment,
      rev: entry.rev + 1,
      updatedAt: at,
    };
    await db.updateEntry(next, rev, auditRecord(me, input.status === 'approved' ? 'approve' : 'decline', next));
    const word = input.status === 'approved' ? 'bestätigt' : 'abgelehnt';
    await send([owner.email], `Dein Antrag wurde ${word}`, [
      `${me.person.name} hat deinen Antrag ${word}.`,
      describeEntry(next, owner),
      comment ? `Kommentar: ${comment}` : '',
    ].filter(Boolean));
    const closures = await closuresAround(entry.start, entry.end);
    return { item: present(next, owner, closures, { withNote: true }) };
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
