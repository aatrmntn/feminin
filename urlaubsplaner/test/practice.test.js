// Phase 3: closures, settings, people management, export, calendar feed, retention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../api/app.js';
import { toCsv } from '../api/csv.js';
import { calendar, fold } from '../api/ical.js';
import * as r from '../api/rules.js';
import { createMemoryDb } from '../dev/memory-db.js';

const FULL = r.FULL_WEEK;
const people = [
  { userId: 'fo1', username: 'frida', name: 'Frida', role: 'frontoffice', active: true, workPattern: FULL },
  { userId: 'bo1', username: 'ida', name: 'Ida', role: 'backoffice', active: true, workPattern: ['mon', 'tue', 'wed', 'thu'], carryOver: { 2026: 2 } },
  { userId: 'ow1', username: 'olga', name: 'Olga', role: 'owner', active: true, approver: true, workPattern: FULL },
  { userId: 'ow2', username: 'paul', name: 'Paul', role: 'owner', active: true, approver: true, workPattern: FULL },
];
const FO = { id: 'fo1', groups: ['staff'] };
const BO = { id: 'bo1', groups: ['staff'] };
const OW = { id: 'ow1', groups: ['approver'] };

let n = 0;
const entry = (userId, start, end = start, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  userId, kind: 'vacation', reason: '', start, end, half: '', note: 'privat', status: 'approved', rev: 1,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...extra,
});

function setup({ entries = [], now = '2026-10-14T08:00:00Z' } = {}) {
  const db = createMemoryDb({ people, entries });
  const calls = [];
  const directory = {
    async createUser(args) { calls.push(['create', args]); return { userId: 'new-1', startPassword: 'Start-Passwort-1' }; },
    async setEnabled(...args) { calls.push(['enabled', ...args]); },
    async setApprover(...args) { calls.push(['approver', ...args]); },
  };
  const app = createApp({ db, now: () => new Date(now), directory, appUrl: 'https://planer.example/' });
  const call = (user, method, path, body, query = {}) => app.handle({ method, path, body, query, user });
  return { db, call, calls, app };
}

// ---------- closures ----------

test('closures: only approvers create them; they count as vacation when set so', async () => {
  const { call } = setup();
  const body = { start: '2026-12-24', end: '2027-01-06', label: 'Weihnachten', countsAsVacation: true, substitute: 'Dr. Muster' };
  assert.equal((await call(FO, 'POST', '/api/closures', body)).status, 403);
  const res = await call(OW, 'POST', '/api/closures', body);
  assert.equal(res.status, 201);
  assert.equal(res.body.item.reopens, '2027-01-07');
  assert.equal(res.body.item.substitute, 'Dr. Muster');

  const o = (await call(FO, 'GET', '/api/overview')).body.item;
  assert.equal(o.closures.length, 1);
  // 24, 28, 29, 30, 31 Dec are working days for a full week (25, 26 holidays)
  assert.equal(o.balance.planned, 5);
  const ida = (await call(BO, 'GET', '/api/overview')).body.item;
  assert.equal(ida.balance.planned, 5, 'Ida works Mon–Thu: 24, 28, 29, 30, 31 Dec are all hers');
  // nobody can book vacation on closure days alone
  const book = await call(FO, 'POST', '/api/entries', { kind: 'vacation', start: '2026-12-28', end: '2026-12-31' });
  assert.match(book.body.error, /nichts zu buchen/);
});

test('closures: change with rev, delete, and the team view shows them as closed', async () => {
  const { call } = setup();
  const made = (await call(OW, 'POST', '/api/closures', { start: '2026-11-02', end: '2026-11-03', label: 'Umbau' })).body.item;
  const t = (await call(FO, 'GET', '/api/team', undefined, { month: '2026-11' })).body.item;
  assert.equal(t.days.find((d) => d.date === '2026-11-02').open, false);
  const path = `/api/closures/${made.id}`;
  assert.equal((await call(OW, 'PUT', path, { start: '2026-11-02', end: '2026-11-04', expectedRev: 9 })).status, 409);
  const changed = await call(OW, 'PUT', path, { start: '2026-11-02', end: '2026-11-04', label: 'Umbau', expectedRev: 1 });
  assert.equal(changed.body.item.end, '2026-11-04');
  assert.equal((await call(FO, 'DELETE', path, undefined, { rev: '2' })).status, 403);
  assert.equal((await call(OW, 'DELETE', path, undefined, { rev: '2' })).status, 200);
  assert.equal((await call(OW, 'DELETE', path, undefined, { rev: '2' })).status, 404);
});

test('substitute: owners can name one on their entries, others cannot', async () => {
  const { call } = setup();
  const own = await call(OW, 'POST', '/api/entries', { kind: 'absence', reason: 'conference', start: '2026-11-12', substitute: 'Dr. Muster' });
  assert.equal(own.body.item.substitute, 'Dr. Muster');
  const staff = await call(FO, 'POST', '/api/entries', { kind: 'vacation', start: '2026-11-12', substitute: 'Jemand' });
  assert.equal(staff.body.item.substitute, '');
});

// ---------- settings ----------

test('settings: approvers only; validated; used for staffing', async () => {
  const { call } = setup();
  assert.equal((await call(FO, 'GET', '/api/settings')).status, 403);
  assert.equal((await call(FO, 'PUT', '/api/settings', { openDays: ['mon'] })).status, 403);
  const cur = (await call(OW, 'GET', '/api/settings')).body.item;
  assert.deepEqual(cur.minimumStaffing, { frontoffice: 2 });
  assert.equal((await call(OW, 'PUT', '/api/settings', { openDays: [] })).status, 400);
  assert.equal((await call(OW, 'PUT', '/api/settings', { minimumStaffing: { frontoffice: 1.5 } })).status, 400);
  const saved = await call(OW, 'PUT', '/api/settings', { minimumStaffing: { frontoffice: 1, backoffice: 1 }, absenceNeedsApproval: false });
  assert.deepEqual(saved.body.item.minimumStaffing, { frontoffice: 1, backoffice: 1 });
  const absence = await call(FO, 'POST', '/api/entries', { kind: 'absence', reason: 'training', start: '2026-11-12' });
  assert.equal(absence.body.item.status, 'approved', 'no approval needed any more');
});

// ---------- people ----------

test('people: list with balances and carry-over suggestion, approvers only', async () => {
  const { call } = setup({ entries: [entry('fo1', '2025-08-04', '2025-08-08')] });
  assert.equal((await call(FO, 'GET', '/api/people')).status, 403);
  const list = (await call(OW, 'GET', '/api/people', undefined, { year: '2026' })).body.item.people;
  const frida = list.find((p) => p.userId === 'fo1');
  assert.equal(frida.suggestedCarryOver, 20, '25 in 2025 minus 5 taken');
  assert.equal(frida.defaultAllowance, 25);
  const ida = list.find((p) => p.userId === 'bo1');
  assert.equal(ida.suggestedCarryOver, null, 'no entries last year: no suggestion');
  assert.equal(ida.defaultAllowance, 20);
  assert.equal(ida.carryOver, 2);
  assert.equal(ida.balance.carryOverExpired, 2, 'not used by 31 March');
});

test('people: change pattern, allowance and carry-over; validation', async () => {
  const { call, db } = setup();
  const path = '/api/people/fo1';
  assert.equal((await call(FO, 'PUT', path, { name: 'X' })).status, 403);
  assert.equal((await call(OW, 'PUT', '/api/people/nobody', { name: 'X' })).status, 404);
  assert.equal((await call(OW, 'PUT', path, { workPattern: [] })).status, 400);
  assert.equal((await call(OW, 'PUT', path, { year: 2026, allowance: 25.3 })).status, 400);
  const res = await call(OW, 'PUT', path, { workPattern: ['mon', 'tue', 'wed', 'thu'], year: 2026, allowance: 22, carryOver: 1.5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.item.allowanceOverride, 22);
  assert.equal(res.body.item.balance.total, 22, 'carry-over 1.5 expired on 31 March, today is October');
  const saved = await db.getPerson('fo1');
  assert.deepEqual(saved.workPattern, ['mon', 'tue', 'wed', 'thu']);
  // back to automatic
  const auto = await call(OW, 'PUT', path, { year: 2026, allowance: null });
  assert.equal(auto.body.item.allowanceOverride, null);
  assert.equal(db.audit.filter((a) => a.action === 'person-update').length, 2);
});

test('people: deactivate and approver rights go through the login system; not for yourself', async () => {
  const { call, calls, db } = setup();
  assert.equal((await call(OW, 'PUT', '/api/people/ow1', { active: false })).status, 400);
  assert.equal((await call(OW, 'PUT', '/api/people/ow1', { approver: false })).status, 400);
  await call(OW, 'PUT', '/api/people/fo1', { active: false });
  await call(OW, 'PUT', '/api/people/bo1', { approver: true });
  assert.deepEqual(calls, [['enabled', 'frida', false], ['approver', 'ida', true]]);
  assert.equal((await db.getPerson('fo1')).active, false);
  // a deactivated person cannot use the planner and leaves the team view
  assert.equal((await call(FO, 'GET', '/api/overview')).status, 403);
  const t = (await call(OW, 'GET', '/api/team', undefined, { month: '2026-11' })).body.item;
  assert.ok(!t.people.some((p) => p.userId === 'fo1'));
});

test('people: add a person, start password shown once, username must be new', async () => {
  const { call, calls, db } = setup();
  const body = { username: 'Vera', name: 'Vera', role: 'frontoffice', workPattern: FULL };
  assert.equal((await call(FO, 'POST', '/api/people', body)).status, 403);
  assert.equal((await call(OW, 'POST', '/api/people', { ...body, username: 'v' })).status, 400);
  assert.equal((await call(OW, 'POST', '/api/people', { ...body, username: 'frida' })).status, 409);
  const res = await call(OW, 'POST', '/api/people', { ...body, email: 'vera@example.at' });
  assert.equal(res.status, 201);
  assert.equal(res.body.item.startPassword, 'Start-Passwort-1');
  assert.equal(res.body.item.person.username, 'vera');
  assert.deepEqual(calls[0], ['create', { username: 'vera', email: 'vera@example.at', approver: false }]);
  assert.equal((await db.getPerson('new-1')).role, 'frontoffice');
  assert.ok(!JSON.stringify(db.audit).includes('Start-Passwort'), 'passwords never in the audit log');
});

// ---------- export and feed ----------

test('ical: CRLF, folding at 75 octets without breaking characters, escaping', () => {
  const long = `SUMMARY:${'Ä'.repeat(60)}`;
  const folded = fold(long).split('\r\n');
  assert.ok(folded.every((l) => Buffer.byteLength(l) <= 75));
  assert.ok(folded.slice(1).every((l) => l.startsWith(' ')));
  assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(''), long);

  const ics = calendar({
    name: 'Test',
    events: [
      { uid: 'a@x', start: '2026-11-02', end: '2026-11-04', summary: 'Anna: Urlaub', updatedAt: '2026-10-01T10:00:00.000Z' },
      { uid: 'b@x', start: '2026-11-05', end: '2026-11-05', half: 'pm', summary: 'Kurs; Teil 1, neu', updatedAt: '2026-10-01T10:00:00Z' },
    ],
  });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'only CRLF line endings');
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Vienna/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261105/);
  assert.match(ics, /DTSTART;TZID=Europe\/Vienna:20261105T130000\r\nDTEND;TZID=Europe\/Vienna:20261105T170000/);
  assert.match(ics, /SUMMARY:Kurs\\; Teil 1\\, neu/);
  assert.match(ics, /DTSTAMP:20261001T100000Z/);
  assert.equal((ics.match(/TRANSP:TRANSPARENT/g) || []).length, 2);
});

test('csv: semicolons, BOM, quotes, and formulas are made harmless', () => {
  const csv = toCsv([['a', 'b;c', 'say "hi"', '=HYPERLINK("x")', '-5']]);
  assert.equal(csv, '﻿a;"b;c";"say ""hi""";"\'=HYPERLINK(""x"")";\'-5\r\n');
});

test('export: own entries as .ics and .csv, with notes (they are your own)', async () => {
  const { call } = setup({ entries: [entry('fo1', '2026-08-03', '2026-08-07', { note: '=Kreta' }), entry('bo1', '2026-08-03')] });
  const ics = await call(FO, 'GET', '/api/export.ics', undefined, { year: '2026' });
  assert.equal(ics.status, 200);
  assert.equal(ics.contentType, 'text/calendar; charset=utf-8');
  assert.equal(ics.filename, 'abwesenheiten-2026.ics');
  assert.equal((ics.raw.match(/BEGIN:VEVENT/g) || []).length, 1, 'only own entries');
  const csv = await call(FO, 'GET', '/api/export.csv', undefined, { year: '2026' });
  assert.match(csv.raw, /03\.08\.2026;07\.08\.2026;Urlaub;;5;bestätigt;'=Kreta;/);
});

test('feed: token link shows the team without notes; replace kills the old link; inactive owner 404', async () => {
  const { call, db } = setup({
    entries: [
      entry('fo1', '2026-11-02', '2026-11-03', { note: 'geheim' }),
      entry('bo1', '2026-11-05', '2026-11-05', { status: 'pending' }),
      entry('ow1', '2026-12-01', '2026-12-01', { kind: 'closure', reason: 'Fortbildung Team', substitute: 'Dr. Muster' }),
      entry('fo1', '2025-01-02'), // too old
    ],
  });
  const first = (await call(FO, 'PUT', '/api/me/feed')).body.item.url;
  const token = first.match(/feed\/([A-Za-z0-9_-]{32})\.ics$/)[1];
  assert.equal((await call(FO, 'GET', '/api/overview')).body.item.me.feedUrl, first);

  const res = await call(null, 'GET', `/feed/${token}.ics`);
  assert.equal(res.status, 200);
  assert.match(res.raw, /SUMMARY:Frida: Urlaub/);
  assert.match(res.raw, /SUMMARY:feminin: Ordination geschlossen \(Fortbildung Team\)/);
  assert.match(res.raw, /DESCRIPTION:Vertretung: Dr. Muster/);
  assert.ok(!res.raw.includes('geheim'), 'never notes');
  assert.ok(!res.raw.includes('Ida'), 'only approved entries');
  assert.ok(!res.raw.includes('20250102'), 'only from last month on');

  const second = (await call(FO, 'PUT', '/api/me/feed')).body.item.url;
  assert.notEqual(second, first);
  assert.equal((await call(null, 'GET', `/feed/${token}.ics`)).status, 404, 'old link is dead at once');
  const token2 = second.match(/feed\/(.+)\.ics$/)[1];
  assert.equal((await call(null, 'GET', `/feed/${token2}.ics`)).status, 200);

  await db.putPerson({ ...(await db.getPerson('fo1')), active: false });
  assert.equal((await call(null, 'GET', `/feed/${token2}.ics`)).status, 404);
  assert.equal((await call(null, 'GET', '/feed/short.ics')).status, 404);
  assert.equal((await call(null, 'GET', '/feed/../api/overview')).status, 404);
  assert.ok(!JSON.stringify(db.audit).includes(token2), 'tokens never in the audit log');
});

test('feed: delete the link', async () => {
  const { call } = setup();
  const url = (await call(FO, 'PUT', '/api/me/feed')).body.item.url;
  await call(FO, 'DELETE', '/api/me/feed');
  const token = url.match(/feed\/(.+)\.ics$/)[1];
  assert.equal((await call(null, 'GET', `/feed/${token}.ics`)).status, 404);
  assert.equal((await call(FO, 'GET', '/api/overview')).body.item.me.feedUrl, '');
});

// ---------- retention ----------

test('retention: keeps this year and the two before, deletes older entries and audit', async () => {
  const old = entry('fo1', '2023-12-27', '2024-01-05'); // ends in 2024: keep
  const older = entry('fo1', '2023-08-01', '2023-08-05'); // delete
  const { app, db } = setup({ entries: [old, older, entry('fo1', '2026-08-03')], now: '2026-01-02T02:00:00Z' });
  db.audit.push({ id: 'a1', at: '2023-05-01T00:00:00.000Z', action: 'create' }, { id: 'a2', at: '2024-02-01T00:00:00.000Z', action: 'create' });
  const res = await app.runRetention();
  assert.deepEqual(res, { cutoff: '2024-01-01', deletedEntries: 1, deletedAudit: 1 });
  assert.equal(await db.getEntry(older.id), null);
  assert.ok(await db.getEntry(old.id));
  assert.ok(db.audit.some((a) => a.id === 'a2'));
  assert.ok(db.audit.some((a) => a.action === 'retention' && a.actorId === 'system'));
});
