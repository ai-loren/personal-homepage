// 星系到访计数：POST /visit 登记一次到访并返回总数，GET /stats 只返回总数。
// 旅人按浏览器里的随机 ID 认，同一 ID 隔 30 分钟以上再来才算一次新的到访。

const VISIT_GAP_MS = 30 * 60 * 1000;
const NEW_TRAVELERS_PER_SOURCE_PER_DAY = 30;
const MAX_BODY_BYTES = 1024;
const TRAVELER_ID = /^[0-9a-f]{32}$/;
const REFERRER_HOST = /^[a-z0-9.-]{1,100}$/;
const AUTOMATED = /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python|go-http/i;

class BadRequest extends Error {}

export default {
  fetch: (request, env) => handle(request, env, Date.now()),
};

export async function handle(request, env, now) {
  const url = new URL(request.url);
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allowed = origins.includes(origin);
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
  const refuse = () => reply(403, { error: `Origin ${JSON.stringify(origin)} may not record visits; expected one of ${origins.join(', ') || '(none configured)'}. Add the site's origin to ALLOWED_ORIGINS in wrangler.toml and deploy again.` }, cors);

  if (request.method === 'OPTIONS') {
    if (!allowed) return refuse();
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  try {
    if (url.pathname === '/stats' && request.method === 'GET') return reply(200, { ...(await readTotals(env.DB)), counted: false }, cors);
    if (url.pathname === '/visit' && request.method === 'POST') {
      if (!allowed) return refuse();
      return reply(200, await recordVisit(request, env.DB, now), cors);
    }
    return reply(404, { error: `${request.method} ${url.pathname} is not a route; expected POST /visit or GET /stats.` }, cors);
  } catch (error) {
    if (error instanceof BadRequest) return reply(400, { error: error.message }, cors);
    console.error('visits: request failed', error);
    const hint = /no such table/i.test(String(error?.message)) ? ' The tables do not exist yet: run `npx wrangler d1 execute galaxy-visits --remote --file schema.sql`.' : ' Try again later; the page hides the counter meanwhile.';
    return reply(500, { error: `The visit counter could not use its database.${hint}` }, cors);
  }
}

async function recordVisit(request, db, now) {
  const { id, referrer } = await readBody(request);
  if (typeof id !== 'string' || !TRAVELER_ID.test(id)) {
    throw new BadRequest(`POST /visit expects {"id": 32 lowercase hex characters}; got ${String(JSON.stringify(id)).slice(0, 60)}. Send the ID the page keeps in localStorage.`);
  }
  if (AUTOMATED.test(request.headers.get('User-Agent') || '')) return { ...(await readTotals(db)), counted: false };

  const day = new Date(now).toISOString().slice(0, 10);
  let source = '';
  if (!await db.prepare('SELECT 1 FROM travelers WHERE id = ?1').bind(id).first()) {
    source = await sourceOf(db, day, request.headers.get('CF-Connecting-IP') || '');
    const arrived = await db.prepare('SELECT count FROM arrivals WHERE day = ?1 AND source = ?2').bind(day, source).first();
    if (arrived && arrived.count >= NEW_TRAVELERS_PER_SOURCE_PER_DAY) return { ...(await readTotals(db)), counted: false };
  }
  const country = /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : '';
  const from = typeof referrer === 'string' && REFERRER_HOST.test(referrer) ? referrer : '';
  const stale = now - VISIT_GAP_MS;
  // 新旅人先以 last_seen = 0、visits = 0 插入：后面几条语句据此判断「新旅人」与「新到访」，
  // 最后一条才把它们改成真实值。顺序是承重的，整批在一个事务里，两个总数才不会和明细表对不上。
  const results = await db.batch([
    db.prepare('INSERT INTO travelers (id, first_seen, last_seen, visits) VALUES (?1, ?2, 0, 0) ON CONFLICT(id) DO NOTHING').bind(id, now),
    db.prepare("UPDATE totals SET value = value + 1 WHERE name = 'travelers' AND EXISTS (SELECT 1 FROM travelers WHERE id = ?1 AND visits = 0)").bind(id),
    db.prepare('INSERT INTO arrivals (day, source, count) SELECT ?2, ?3, 1 WHERE EXISTS (SELECT 1 FROM travelers WHERE id = ?1 AND visits = 0) ON CONFLICT(day, source) DO UPDATE SET count = count + 1').bind(id, day, source),
    db.prepare("UPDATE totals SET value = value + 1 WHERE name = 'visits' AND EXISTS (SELECT 1 FROM travelers WHERE id = ?1 AND last_seen < ?2)").bind(id, stale),
    db.prepare('INSERT INTO visits (traveler, at, country, referrer) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM travelers WHERE id = ?1 AND last_seen < ?5)').bind(id, now, country, from, stale),
    db.prepare('UPDATE travelers SET visits = visits + (last_seen < ?3), last_seen = ?2 WHERE id = ?1').bind(id, now, stale),
    db.prepare('SELECT name, value FROM totals'),
  ]);
  return { ...totalsFrom(results.at(-1).results), counted: results[3].meta.changes === 1 };
}

// 来源 = 当天随机盐 + IP 的哈希。旧盐当天就删，过了这一天谁也算不回是哪个 IP。
async function sourceOf(db, day, ip) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO salts (day, value) VALUES (?1, ?2)').bind(day, hex(crypto.getRandomValues(new Uint8Array(16)))),
    db.prepare('DELETE FROM salts WHERE day < ?1').bind(day),
    db.prepare('DELETE FROM arrivals WHERE day < ?1').bind(day),
  ]);
  const { value } = await db.prepare('SELECT value FROM salts WHERE day = ?1').bind(day).first();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${value}:${ip}`));
  return hex(new Uint8Array(digest)).slice(0, 32);
}

async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  const text = declared > MAX_BODY_BYTES ? '' : await request.text();
  if (declared > MAX_BODY_BYTES || new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new BadRequest(`POST /visit expects a JSON body under ${MAX_BODY_BYTES} bytes (1 KB); got ${declared || text.length} bytes. Send only {"id", "referrer"}.`);
  }
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {}
  throw new BadRequest(`POST /visit expects a JSON object like {"id": "<32 hex>", "referrer": "<host>"}; got ${JSON.stringify(text.slice(0, 60))}. Send the body as JSON text.`);
}

async function readTotals(db) {
  const { results } = await db.prepare('SELECT name, value FROM totals').all();
  return totalsFrom(results);
}

function totalsFrom(rows) {
  const value = (name) => rows.find((row) => row.name === name)?.value ?? 0;
  return { travelers: value('travelers'), visits: value('visits') };
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reply(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
