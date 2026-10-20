// Runs on Cloudflare before every request, including the HTML page itself and
// the /api routes, so nothing is served until the shared password is given.
// The browser shows its built-in login box (HTTP Basic auth); the username is
// ignored and only the password is checked against the APP_PASSWORD secret.

const REALM = 'Jewelry Inventory';

export async function onRequest({ request, env, next }) {
  if (!env.APP_PASSWORD) {
    return new Response('Not configured yet: add an APP_PASSWORD secret in the Cloudflare Pages settings.', { status: 503 });
  }

  const password = readBasicAuthPassword(request.headers.get('Authorization'));
  if (password !== null && await safeEqual(password, env.APP_PASSWORD)) {
    return next();
  }

  return new Response('Password required.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

function readBasicAuthPassword(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded.slice(decoded.indexOf(':') + 1);
  } catch (e) {
    return null;
  }
}

// Compares SHA-256 digests byte by byte so the time taken doesn't reveal how
// much of a guessed password was right.
async function safeEqual(a, b) {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}
