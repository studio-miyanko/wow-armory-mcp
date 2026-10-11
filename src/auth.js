import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import pkg from '../package.json' with { type: 'json' };

const run = promisify(execFile);

// Blizzard sees who is asking, so it can reach the maintainers instead of blocking blindly.
export const USER_AGENT = `wow-armory-mcp/${pkg.version} (+https://github.com/studio-miyanko/wow-armory-mcp)`;

const TOKEN_URL = 'https://oauth.battle.net/token';

// A token is renewed a minute early, so it never expires between the check and the request.
const TOKEN_MARGIN_MS = 60_000;

export const SETUP = [
  'No Blizzard API client is set up yet, so characters and realms cannot be read.',
  '1. Sign in at https://develop.battle.net/access/clients and create a client. It is free.',
  '2. Copy its client id and client secret.',
  '3. Set them as BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in the environment of this MCP server, then restart the MCP host.',
  '   On macOS the keychain works instead, without a restart. Run each command and paste the value when asked:',
  '   security add-generic-password -s blizzard-api -a client-id -w',
  '   security add-generic-password -s blizzard-api -a client-secret -w',
].join('\n');

let keychainHit = null;
let token = null;

// The keychain is read without a shell, and a missing item counts as no credentials instead of an error.
async function keychainItem(account) {
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', 'blizzard-api', '-a', account, '-w'], { timeout: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// Environment variables win over the keychain, so a host config can override it.
// Only a found keychain entry is kept, so credentials added later work without a restart.
export async function findCredentials() {
  const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
  if (id && secret) return { id, secret };
  if (process.platform !== 'darwin') return null;
  if (keychainHit) return keychainHit;
  const [keychainId, keychainSecret] = await Promise.all([keychainItem('client-id'), keychainItem('client-secret')]);
  if (keychainId && keychainSecret) keychainHit = { id: keychainId, secret: keychainSecret };
  return keychainHit;
}

export async function requireCredentials() {
  const credentials = await findCredentials();
  if (!credentials) throw new Error(SETUP);
  return credentials;
}

async function requestToken({ id, secret }) {
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'user-agent': USER_AGENT },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`The Battle.net login did not answer (${error.name === 'TimeoutError' ? 'timeout' : error.message}). Try again.`);
  }
  if ([400, 401, 403].includes(response.status)) {
    throw new Error('Battle.net rejected the client id or secret. Compare BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET, '
      + 'or the blizzard-api keychain items, with the client at https://develop.battle.net/access/clients.');
  }
  if (!response.ok) throw new Error(`The Battle.net login answered ${response.status}. Try again in a minute.`);
  const body = await response.json().catch(() => null);
  if (!body?.access_token || !(body.expires_in > 0)) throw new Error('The Battle.net login sent no access token, so its OAuth response may have changed.');
  return body;
}

// The promise is stored, so parallel calls share one token request, and a failed one is dropped for a retry.
export function accessToken(credentials) {
  if (token?.id === credentials.id && Date.now() < token.expires) return token.load;
  const entry = { id: credentials.id, expires: Infinity };
  entry.load = requestToken(credentials).then(({ access_token: value, expires_in: seconds }) => {
    entry.value = value;
    entry.expires = Date.now() + seconds * 1000 - TOKEN_MARGIN_MS;
    return value;
  });
  entry.load.catch(() => token === entry && (token = null));
  token = entry;
  return entry.load;
}

// Parallel requests refused with the same stale token renew it once, not once each.
export function dropToken(stale) {
  if (stale === undefined || token?.value === stale) token = null;
}
