import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handle } from '../src/worker.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const SITE = 'https://ai-loren.github.io';
const ENV_ORIGINS = `${SITE}, https://example.org`;
const MINUTE = 60 * 1000;
const T0 = Date.UTC(2026, 9, 29, 8, 0, 0);
const ids = { c: 'c'.repeat(32), a: 'a'.repeat(32), b: 'b'.repeat(32), d: '0123456789abcdef0123456789abcdef' };

// D1 的最小替身：prepare/bind/first/all/run 与 batch（同一事务），底下是真实的 SQLite。
function d1({ schema = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  if (schema) sqlite.exec(SCHEMA);
  const execute = (sql, args) => (/^\s*select/i.test(sql)
    ? { results: sqlite.prepare(sql).all(...args).map((row) => ({ ...row })), meta: { changes: 0 } }
    : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } });
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    first: async () => {
      const row = sqlite.prepare(sql).get(...args);
      return row ? { ...row } : null;
    },
    all: async () => execute(sql, args),
    run: async () => execute(sql, args),
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(({ sql, args }) => execute(sql, args));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function visit(env, { id, at = T0, origin = SITE, ip = '203.0.113.7', agent = 'Mozilla/5.0 (Macintosh) Safari/605.1.15', referrer = '', country, body } = {}) {
  const request = new Request('https://galaxy-visits.example.workers.dev/visit', {
    method: 'POST',
    headers: { Origin: origin, 'User-Agent': agent, 'CF-Connecting-IP': ip },
    body: body ?? JSON.stringify({ id, referrer }),
  });
  if (country !== undefined) Object.defineProperty(request, 'cf', { value: { country } });
  return handle(request, env, at);
}

const stats = (env, origin = SITE) => handle(new Request('https://galaxy-visits.example.workers.dev/stats', { headers: { Origin: origin } }), env, T0);
const environment = (options) => ({ DB: d1(options), ALLOWED_ORIGINS: ENV_ORIGINS });
const rows = (env, sql) => env.DB.sqlite.prepare(sql).all().map((row) => ({ ...row }));

test('a first visit registers one traveler and one visit, logging only the country and the referrer host', async () => {
  const env = environment();
  const response = await visit(env, { id: ids.c, country: 'CN', referrer: 'news.ycombinator.com' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { travelers: 1, visits: 1, counted: true });
  assert.deepEqual(rows(env, 'SELECT id, first_seen, last_seen, visits FROM travelers'), [{ id: ids.c, first_seen: T0, last_seen: T0, visits: 1 }]);
  assert.deepEqual(rows(env, 'SELECT traveler, at, country, referrer FROM visits'), [{ traveler: ids.c, at: T0, country: 'CN', referrer: 'news.ycombinator.com' }]);
  assert.deepEqual(Object.keys(rows(env, 'SELECT * FROM visits')[0]), ['seq', 'traveler', 'at', 'country', 'referrer']);
});

test('returning within thirty minutes is the same visit; past thirty minutes it is a new one', async () => {
  const env = environment();
  const at = (minutes, extra = 0) => T0 + minutes * MINUTE + extra;
  const totals = async (moment) => (await (await visit(env, { id: ids.c, at: moment })).json());
  assert.deepEqual(await totals(at(0)), { travelers: 1, visits: 1, counted: true });
  assert.deepEqual(await totals(at(29)), { travelers: 1, visits: 1, counted: false });
  assert.deepEqual(await totals(at(59)), { travelers: 1, visits: 1, counted: false }, 'each request moves last_seen, so a busy session stays one visit');
  assert.deepEqual(await totals(at(89)), { travelers: 1, visits: 1, counted: false }, 'exactly thirty minutes after the last request is still the same visit');
  assert.deepEqual(await totals(at(119, 1)), { travelers: 1, visits: 2, counted: true });
  assert.deepEqual(rows(env, 'SELECT visits, last_seen FROM travelers'), [{ visits: 2, last_seen: at(119, 1) }]);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM visits')[0].n, 2);
});

test('the totals always equal what the tables hold', async () => {
  const env = environment();
  const plan = [[ids.c, 0], [ids.a, 3], [ids.c, 10], [ids.d, 40], [ids.a, 45], [ids.c, 41], [ids.b, 100], [ids.d, 101], [ids.c, 200], [ids.a, 300]];
  let last;
  for (const [id, minutes] of plan) last = await (await visit(env, { id, at: T0 + minutes * MINUTE })).json();
  const travelers = rows(env, 'SELECT COUNT(*) AS n FROM travelers')[0].n;
  const visits = rows(env, 'SELECT COUNT(*) AS n FROM visits')[0].n;
  const perTraveler = rows(env, 'SELECT SUM(visits) AS n FROM travelers')[0].n;
  assert.deepEqual([last.travelers, last.visits], [travelers, visits]);
  assert.equal(perTraveler, visits);
  assert.deepEqual([travelers, visits], [4, 9]);
  assert.deepEqual(rows(env, 'SELECT id, visits FROM travelers ORDER BY first_seen'), [
    { id: ids.c, visits: 3 }, { id: ids.a, visits: 3 }, { id: ids.d, visits: 2 }, { id: ids.b, visits: 1 },
  ]);
});

test('an origin other than the site is refused and nothing is written', async () => {
  const env = environment();
  for (const origin of ['https://evil.example', '', 'https://ai-loren.github.io.evil.example', 'http://ai-loren.github.io']) {
    const response = await visit(env, { id: ids.c, origin });
    assert.equal(response.status, 403, `origin ${JSON.stringify(origin)}`);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.match((await response.json()).error, /ALLOWED_ORIGINS/);
  }
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM travelers')[0].n, 0);
  assert.deepEqual(rows(env, 'SELECT name, value FROM totals ORDER BY name'), [{ name: 'travelers', value: 0 }, { name: 'visits', value: 0 }]);
  assert.equal((await visit(env, { id: ids.c, origin: 'https://example.org' })).status, 200, 'every configured origin is accepted');
});

test('malformed ids and bodies are rejected with the shape the endpoint expects', async () => {
  const env = environment();
  for (const id of [undefined, 'C'.repeat(32), 'c'.repeat(31), 'c'.repeat(33), `${'c'.repeat(31)}g`, 7, ' '.concat('c'.repeat(31))]) {
    const response = await visit(env, { id });
    assert.equal(response.status, 400, `id ${JSON.stringify(id)}`);
    assert.match((await response.json()).error, /32 lowercase hex/);
  }
  for (const body of ['not json', '[1]', 'null', '"x"']) {
    const response = await visit(env, { body });
    assert.equal(response.status, 400, `body ${body}`);
    assert.match((await response.json()).error, /JSON object/);
  }
  const huge = await visit(env, { body: JSON.stringify({ id: ids.c, referrer: 'x'.repeat(2000) }) });
  assert.equal(huge.status, 400);
  assert.match((await huge.json()).error, /1 KB/);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM travelers')[0].n, 0);
});

test('referrers keep a host name only, and countries only a two-letter code', async () => {
  const env = environment();
  const cases = [
    [ids.c, 'juejin.cn', 'CN', 'juejin.cn', 'CN'],
    [ids.a, 'https://v2ex.com/t/1', 'US', '', 'US'],
    [ids.b, 'a'.repeat(101), 'xx', '', ''],
    [ids.d, '<b>x</b>', 'T1', '', ''],
  ];
  for (const [id, referrer, country] of cases) await visit(env, { id, referrer, country });
  assert.deepEqual(rows(env, 'SELECT referrer, country FROM visits ORDER BY seq'), cases.map(([, , , referrer, country]) => ({ referrer, country })));
});

test('crawlers and scripts read the totals without being counted', async () => {
  const env = environment();
  await visit(env, { id: ids.c });
  for (const agent of ['Googlebot/2.1', 'Mozilla/5.0 HeadlessChrome/131.0', 'curl/8.7.1', 'python-requests/2.32', 'Mozilla/5.0 (compatible; bingbot/2.0)']) {
    assert.deepEqual(await (await visit(env, { id: ids.a, agent })).json(), { travelers: 1, visits: 1, counted: false }, agent);
  }
  assert.deepEqual(rows(env, 'SELECT id FROM travelers'), [{ id: ids.c }]);
});

test('one source registers at most thirty new travelers a day, while returning travelers keep counting', async () => {
  const env = environment();
  const fresh = (n) => n.toString(16).padStart(32, '0');
  const counted = [];
  for (let n = 1; n <= 31; n += 1) counted.push((await (await visit(env, { id: fresh(n), at: T0 + n })).json()).counted);
  assert.deepEqual(counted, [...Array(30).fill(true), false]);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM travelers')[0].n, 30);
  assert.equal((await (await visit(env, { id: fresh(32), ip: '198.51.100.9' })).json()).counted, true, 'another source is not affected');
  assert.equal((await (await visit(env, { id: fresh(1), at: T0 + 40 * MINUTE })).json()).counted, true, 'a known traveler from the capped source still starts new visits');
  const nextDay = T0 + 24 * 60 * MINUTE;
  assert.equal((await (await visit(env, { id: fresh(33), at: nextDay })).json()).counted, true, 'the cap resets the next day');
});

test('the daily salt is replaced and the previous day\'s arrivals are forgotten', async () => {
  const env = environment();
  await visit(env, { id: ids.c });
  const first = rows(env, 'SELECT day, value FROM salts');
  assert.equal(first.length, 1);
  assert.match(first[0].value, /^[0-9a-f]{32}$/);
  await visit(env, { id: ids.a, at: T0 + 24 * 60 * MINUTE });
  const second = rows(env, 'SELECT day, value FROM salts');
  assert.deepEqual(second.map((row) => row.day), ['2026-10-30']);
  assert.notEqual(second[0].value, first[0].value);
  assert.deepEqual(rows(env, 'SELECT day FROM arrivals'), [{ day: '2026-10-30' }]);
  assert(!rows(env, 'SELECT source FROM arrivals')[0].source.includes('203.0.113.7'));
});

test('GET /stats returns the totals, readable by the site only', async () => {
  const env = environment();
  await visit(env, { id: ids.c });
  await visit(env, { id: ids.a });
  const own = await stats(env);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.deepEqual(await own.json(), { travelers: 2, visits: 2, counted: false });
  const other = await stats(env, 'https://evil.example');
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM visits')[0].n, 2, 'reading the totals records nothing');
});

test('preflight is answered for the site and refused for anyone else', async () => {
  const env = environment();
  const preflight = (origin) => handle(new Request('https://galaxy-visits.example.workers.dev/visit', { method: 'OPTIONS', headers: { Origin: origin } }), env, T0);
  const ok = await preflight(SITE);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.match(ok.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.equal((await preflight('https://evil.example')).status, 403);
});

test('unknown routes name the routes that exist', async () => {
  const env = environment();
  for (const [method, path] of [['GET', '/visit'], ['POST', '/stats'], ['GET', '/']]) {
    const response = await handle(new Request(`https://galaxy-visits.example.workers.dev${path}`, { method, headers: { Origin: SITE } }), env, T0);
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.match((await response.json()).error, /POST \/visit or GET \/stats/);
  }
});

test('a database without the tables answers 500 and says how to create them', async () => {
  const env = environment({ schema: false });
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const response of [await visit(env, { id: ids.c }), await stats(env)]) {
      assert.equal(response.status, 500);
      assert.match((await response.json()).error, /--file schema\.sql/);
    }
  } finally {
    console.error = originalError;
  }
});
