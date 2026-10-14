// Local copy for trying things out: `npm run dev`, then open http://localhost:8080.
// In-memory data (gone on restart) and a person picker instead of the real login.
// Never deployed; production runs api/handler.js behind Cognito.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../api/app.js';
import { addDays, todayIn } from '../api/rules.js';
import { createMemoryDb } from './memory-db.js';

const PORT = Number(process.env.PORT) || 8080;
const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const FULL = ['mon', 'tue', 'wed', 'thu', 'fri'];

const team = [
  { userId: 'dev-fo1', name: 'Anna', role: 'frontoffice', groups: ['staff'], workPattern: FULL },
  { userId: 'dev-fo2', name: 'Bea', role: 'frontoffice', groups: ['staff'], workPattern: FULL },
  { userId: 'dev-fo3', name: 'Clara', role: 'frontoffice', groups: ['staff'], workPattern: ['mon', 'tue', 'thu'] },
  { userId: 'dev-fo4', name: 'Dora', role: 'frontoffice', groups: ['staff'], workPattern: ['mon', 'tue', 'wed', 'thu'] },
  { userId: 'dev-bo1', name: 'Eva', role: 'backoffice', groups: ['staff'], workPattern: FULL },
  { userId: 'dev-ow1', name: 'Leitung A', role: 'owner', groups: ['approver'], workPattern: FULL },
  { userId: 'dev-ow2', name: 'Leitung B', role: 'owner', groups: ['approver'], workPattern: FULL },
];
const LABELS = { frontoffice: 'Frontoffice', backoffice: 'Backoffice', owner: 'Leitung, genehmigt' };

const today = todayIn();
const year = today.slice(0, 4);
const at = new Date().toISOString();
const seed = (n, userId, start, end, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  userId, kind: 'vacation', reason: '', start, end, half: '', note: '', status: 'approved', rev: 1,
  createdAt: at, updatedAt: at, ...extra,
});

const db = createMemoryDb({
  people: team.map(({ groups, ...p }) => ({ ...p, username: p.name.toLowerCase(), active: true })),
  entries: [
    seed(1, 'dev-fo1', `${year}-02-16`, `${year}-02-20`, { note: 'Skiurlaub' }),
    seed(2, 'dev-fo1', `${year}-07-27`, `${year}-08-07`),
    seed(3, 'dev-fo1', `${year}-03-13`, `${year}-03-13`, { half: 'pm' }),
    seed(4, 'dev-fo1', `${year}-05-20`, `${year}-05-21`, { kind: 'absence', reason: 'training', note: 'Kurs Abrechnung' }),
    seed(5, 'dev-fo1', addDays(today, 30), addDays(today, 34), { status: 'pending' }),
  ],
});
const app = createApp({ db });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const SECURITY = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
    + "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY });
  res.end(body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/config.json') {
      const users = team.map((p) => ({ id: p.userId, name: p.name, label: LABELS[p.role] }));
      return send(res, 200, TYPES['.json'], JSON.stringify({ mode: 'dev', users }));
    }
    if (url.pathname.startsWith('/api/')) {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return send(res, 400, TYPES['.json'], JSON.stringify({ error: 'Die Anfrage konnte nicht gelesen werden.' }));
      }
      const person = team.find((p) => p.userId === req.headers['x-dev-user']);
      const out = await app.handle({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        user: person ? { id: person.userId, groups: person.groups } : null,
      });
      return send(res, out.status, TYPES['.json'], JSON.stringify(out.body));
    }
    const file = normalize(join(WEB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(WEB)) return send(res, 404, 'text/plain', 'Not found');
    const data = await readFile(file);
    return send(res, 200, TYPES[extname(file)] || 'application/octet-stream', data);
  } catch {
    return send(res, 404, 'text/plain; charset=utf-8', 'Nicht gefunden');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Urlaubsplaner (Testversion) läuft auf http://localhost:${PORT}`);
});
