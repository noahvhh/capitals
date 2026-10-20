/*
 * Accounts: a username and password that stand for a sync code, so a
 * device joins the synced progress by signing in instead of typing a
 * code. There's no email and no password reset.
 *
 *   POST /api/account { action: 'signup' | 'login', username, password, key? }
 *     -> { username, key }   key is the sync code used with /api/sync
 *
 * Signing up on a device that already syncs with a code keeps that code
 * (sent as key), so its progress carries over. Passwords are stored as
 * scrypt hashes in the private Vercel Blob store, at users/<username>.json.
 */
import { get, put } from '@vercel/blob';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const USER = /^[a-z0-9._-]{3,32}$/;
const CODE = /^[a-z2-9]{12}$/;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';  // as in js/sync.js
const MIN_PASSWORD = 6, MAX_PASSWORD = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function newKey() {
  let out = '';
  while (out.length < 12) {
    for (const b of randomBytes(32)) {
      // 248 = 31 * 8, so every symbol is equally likely.
      if (b < 248 && out.length < 12) out += ALPHABET[b % 31];
    }
  }
  return out;
}

async function hash(password, salt) {
  return (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })).toString('base64');
}

function userPath(name) {
  return `users/${name}.json`;
}

async function readUser(name) {
  const res = await get(userPath(name), { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  try { return JSON.parse(await new Response(res.stream).text()); } catch (e) { return null; }
}

export async function POST(request) {
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: 'bad-request' }, 400); }
  const action = body && body.action;
  const username = String((body && body.username) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  if (!USER.test(username)) return json({ error: 'bad-username' }, 400);
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return json({ error: 'bad-password' }, 400);

  if (action === 'signup') {
    const given = String(body.key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = CODE.test(given) ? given : newKey();
    const salt = randomBytes(16).toString('base64');
    const user = { v: 1, salt, hash: await hash(password, salt), key, created: Date.now() };
    try {
      // Without allowOverwrite, put fails if the name is already taken,
      // so two sign-ups with the same name can't both succeed.
      await put(userPath(username), JSON.stringify(user), {
        access: 'private', contentType: 'application/json', cacheControlMaxAge: 60
      });
    } catch (err) {
      if (await readUser(username)) return json({ error: 'taken' }, 409);
      throw err;
    }
    return json({ username, key });
  }

  if (action === 'login') {
    const user = await readUser(username);
    // Hash even for unknown names, so the reply takes the same time.
    const attempt = await hash(password, user ? user.salt : 'unknown-user');
    if (!user || !timingSafeEqual(Buffer.from(attempt), Buffer.from(user.hash))) return json({ error: 'wrong' }, 401);
    return json({ username, key: user.key });
  }

  return json({ error: 'bad-request' }, 400);
}
