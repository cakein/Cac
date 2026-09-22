import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const req = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, createFetchMock } = req('miniflare');
const server = path.resolve('dist/server');
const modules = ['index.js', ...fs.readdirSync(server, { recursive: true }).filter(f => f.endsWith('.js') && f !== 'index.js')].map(f => ({ type: 'ESModule', path: path.join(server, f) }));
const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
const provider = fetchMock.get('https://auth.habitlab.test');
const user = { id: 'test-alice-id', email: 'alice@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const other = { id: 'test-bob-id', email: 'bob@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
provider.intercept({ path: '/auth/v1/otp', method: 'POST' }).reply(200, '{}');
provider.intercept({ path: '/auth/v1/verify', method: 'POST' }).reply(403, '{}');
provider.intercept({ path: '/auth/v1/verify', method: 'POST' }).reply(200, { access_token: 'alice-access', refresh_token: 'alice-refresh', expires_in: 3600, user });
provider.intercept({ path: '/auth/v1/user', method: 'GET', headers: { authorization: 'Bearer alice-access' } }).reply(200, user).persist();
provider.intercept({ path: '/auth/v1/user', method: 'GET', headers: { authorization: 'Bearer bob-access' } }).reply(200, other).persist();
provider.intercept({ path: '/auth/v1/user', method: 'GET', headers: { authorization: 'Bearer forged-access' } }).reply(401, '{}').persist();
provider.intercept({ path: '/auth/v1/token?grant_type=refresh_token', method: 'POST' }).reply(200, { access_token: 'alice-access', refresh_token: 'alice-refresh-2', expires_in: 3600, user }).times(3);
provider.intercept({ path: '/auth/v1/logout?scope=local', method: 'POST', headers: { authorization: 'Bearer alice-access' } }).reply(204, '').times(3);
provider.intercept({ path: '/auth/v1/logout?scope=local', method: 'POST', headers: { authorization: 'Bearer expired-access' } }).reply(401, '{}');
const options = { modules, modulesRoot: server, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], cf: false };
const mf = new Miniflare({ ...options, d1Databases: { DB: 'auth-test' }, fetchMock, bindings: { SUPABASE_URL: 'https://auth.habitlab.test', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', APP_ORIGIN: 'https://habitlab.test' } });
try {
 const db = await mf.getD1Database('DB');
 for (const sql of fs.readFileSync('drizzle/0000_greedy_ser_duncan.sql', 'utf8').split('--> statement-breakpoint')) await db.prepare(sql.trim()).run();
 const call = async (url, body, cookies = '', extra = {}) => {
  const response = await mf.dispatchFetch('https://habitlab.test' + url, { method: body ? 'POST' : 'GET', headers: { origin: 'https://habitlab.test', 'Content-Type': 'application/json', cookie: cookies, ...extra }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, headers: response.headers, data: await response.json() };
 };
 assert.equal((await call('/api/auth/session')).data.configured, true);
 assert.equal((await call('/api/habits', null, '', { 'oai-authenticated-user-id': 'old-alice', 'oai-authenticated-user-email': user.email })).status, 401, 'Configured email auth must not silently trust legacy identity');
 assert.equal((await call('/api/auth/code', { email: user.email }, '', { origin: 'https://evil.test' })).status, 403);
 assert.equal((await call('/api/auth/code', { email: 'not-an-email' })).status, 400);
 assert.equal((await call('/api/auth/code', { email: user.email })).status, 200);
 const invalid = await call('/api/auth/verify', { email: user.email, token: '000000' });
 assert.equal(invalid.status, 401); assert.equal(invalid.headers.get('set-cookie'), null);
 // A public deployment must ignore forged Sites headers even when linking accounts.
 const legacyHabit = { id: 'legacy-habit', name: 'Private legacy habit', type: 'build', cue: 'Morning', behavior: 'Forget', reward: 'Progress', barrier: 'I forget', time: '8 AM', firstStep: 'Begin.', createdAt: '2026-01-01T00:00:00Z' };
 await db.prepare('INSERT INTO habits (id,user_id,data,created_at) VALUES (?,?,?,?)').bind(legacyHabit.id, 'old-alice', JSON.stringify(legacyHabit), legacyHabit.createdAt).run();
 const verified = await call('/api/auth/verify', { email: user.email, token: '123456' }, '', { 'oai-authenticated-user-id': 'old-alice', 'oai-authenticated-user-email': user.email });
 assert.equal(verified.status, 200); assert.equal(verified.data.user.userId, 'email:test-alice-id');
 assert.equal((await db.prepare('SELECT user_id FROM habits WHERE id = ?').bind(legacyHabit.id).first()).user_id, 'old-alice', 'Forged identity headers must not migrate someone else’s records');
 assert.equal('access_token' in verified.data, false);
 const setCookies = verified.headers.getSetCookie();
 assert.ok(setCookies.every(c => c.includes('HttpOnly') && c.includes('Secure') && /SameSite=Lax/i.test(c)));
 const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
 assert.equal((await call('/api/auth/session', null, cookie)).data.user.email, user.email);
 const forged = cookie.replace('alice-access', 'forged-access').split('; ')[0];
 assert.equal((await call('/api/habits', null, forged)).status, 401);
 const habit = await call('/api/habits', { name: 'Read books', type: 'build', cue: 'After dinner', behavior: 'Scroll', reward: 'A playlist', barrier: 'I forget', time: '7 PM' }, cookie);
 assert.equal(habit.status, 200);
 assert.equal((await call('/api/habits', null, cookie)).data.habits.length, 1);
 const bobCookie = cookie.split('; ')[0].replace('alice-access', 'bob-access');
 assert.equal((await call('/api/habits', null, bobCookie)).data.habits.length, 0);
 const entry = { habitId: habit.data.habit.id, date: '2026-09-21', status: 'completed', phone: 'away', strategy: '5-minute start', trigger: 'After dinner', hour: 19, minutes: 5, note: '' };
 assert.equal((await call('/api/logs', entry, bobCookie)).status, 404);
 assert.equal((await call('/api/logs', entry, cookie, { origin: 'https://evil.test' })).status, 403);
 assert.equal((await call('/api/logs', entry, cookie)).status, 200);
 const refreshOnly = cookie.split('; ').find(c => c.includes('refresh='));
 const refreshed = await call('/api/auth/session', null, refreshOnly);
 assert.equal(refreshed.data.user.email, user.email); assert.ok(refreshed.headers.get('set-cookie'));
 const out = await call('/api/auth/signout', {}, cookie);
 assert.equal(out.status, 200); assert.ok(out.headers.getSetCookie().every(c => /Max-Age=0/i.test(c)));
 const expiredCookie = cookie.replace('alice-access', 'expired-access');
 for (const signoutCookie of [refreshOnly, expiredCookie]) {
  const expiredOut = await call('/api/auth/signout', {}, signoutCookie);
  assert.equal(expiredOut.status, 200);
  assert.ok(expiredOut.headers.getSetCookie().every(c => /Max-Age=0/i.test(c)), 'Logout must clear both cookies after refreshing an expired access token');
 }
 fetchMock.assertNoPendingInterceptors();
} finally { await mf.dispose(); }

// A clone runs without the trusted Sites ingress. It must fail closed by default.
for (const trustSites of [undefined, 'false', 'true']) {
 const bindings = { APP_ORIGIN: 'https://habitlab.test', ...(trustSites === undefined ? {} : { TRUST_SITES_AUTH: trustSites }) };
 const local = new Miniflare({ ...options, bindings });
 try {
  const headers = { 'oai-authenticated-user-id': 'old-alice', 'oai-authenticated-user-email': user.email };
  const session = await local.dispatchFetch('https://habitlab.test/api/auth/session', { headers });
  assert.equal(session.status, 200);
  const result = await session.json();
  assert.equal(result.configured, false);
  if (trustSites === 'true') {
   assert.equal(result.user.userId, 'old-alice', 'An explicitly trusted Sites deployment keeps legacy identity support');
  } else {
   assert.equal(result.user, null, 'Provider-disabled deployments must reject forged Sites identity headers by default');
   const habits = await local.dispatchFetch('https://habitlab.test/api/habits', { headers });
   assert.equal(habits.status, 401);
  }
 } finally { await local.dispose(); }
}
console.log('PASS: email codes, CSRF, secure cookies, verified identity, refresh, expired-access logout, per-user storage, and spoofed legacy identity/migration regressions. No real emails sent.');
