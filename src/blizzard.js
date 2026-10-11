import { USER_AGENT, accessToken, dropToken, requireCredentials } from './auth.js';

export const REGIONS = ['us', 'eu', 'kr', 'tw'];

// Classic flavors share the hosts of Retail and differ only by namespace, like profile-classic1x-eu.
export const FLAVORS = { retail: null, classic: 'classic', era: 'classic1x', anniversary: 'classicann' };

// English answers suit the model, and kr and tw serve en_US too.
const LOCALES = { us: 'en_US', eu: 'en_GB', kr: 'en_US', tw: 'en_US' };

const CHARACTER_MS = 10 * 60 * 1000;
const REALMS_MS = 24 * 60 * 60 * 1000;
const CACHE_SIZE = 300;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const SECTIONS = { statistics: 'Statistics', equipment: 'Equipment', specializations: 'Specializations' };

const cache = new Map();

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function namespace(kind, flavor, region) {
  return [kind, FLAVORS[flavor], region].filter(Boolean).join('-');
}

// Blizzard's rule: lowercase, apostrophes and parentheses dropped, spaces to hyphens, so slugs pass through unchanged.
// A few realms break it, like azjolnerub for Azjol-Nerub, so a miss is resolved through the realm list.
export function toSlug(realm) {
  return realm.normalize('NFC').trim().toLowerCase().replace(/['’()]/g, '').replace(/\s+/g, '-');
}

// Names and slugs compare by letters and digits only, so "Azjol-Nerub", "azjolnerub" and "Kel'Thuzad" all match.
function realmKey(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// The promise is stored, so parallel identical calls share one request, and a failed one is dropped for a retry.
function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.value;
  const value = load();
  cache.delete(key);
  cache.set(key, { time: Date.now(), value });
  value.catch(() => cache.get(key)?.value === value && cache.delete(key));
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return value;
}

// Tests start each case without cached data or token.
export function clearCaches() {
  cache.clear();
  dropToken();
}

function wait(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

// One retry rides out a timeout, a 5xx, a rate limit spike or a token that expired early.
async function apiGet(credentials, region, path, params, retries = 1) {
  const url = new URL(path, `https://${region}.api.blizzard.com`);
  for (const [key, value] of Object.entries({ ...params, locale: LOCALES[region] })) url.searchParams.set(key, String(value));
  const token = await accessToken(credentials);
  let response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (retries > 0) return apiGet(credentials, region, path, params, retries - 1);
    throw new ApiError(0, `Blizzard's API did not answer (${error.name === 'TimeoutError' ? 'timeout' : error.message}). Try again.`);
  }
  const { status } = response;
  const where = decodeURI(url.pathname);
  if ((status === 401 || RETRY_STATUS.has(status)) && retries > 0) {
    await response.body?.cancel();
    if (status === 401) dropToken(token);
    else await wait(Math.min(Number(response.headers.get('retry-after')) || 1, 5) * 1000);
    return apiGet(credentials, region, path, params, retries - 1);
  }
  if (status === 404) throw new ApiError(404, `Blizzard has nothing at ${where} in ${params.namespace}.`);
  if (status === 401 || status === 403) {
    throw new ApiError(status, `Blizzard refused the request (${status}). Check the client id and secret, `
      + 'or create a new client at https://develop.battle.net/access/clients.');
  }
  if (status === 429) throw new ApiError(429, 'Blizzard is rate limiting requests. Wait a minute, then try again.');
  if (!response.ok) throw new ApiError(status, `Blizzard answered ${status} for ${where}. Try again later.`);
  try {
    return await response.json();
  } catch {
    throw new ApiError(status, `Blizzard sent no JSON for ${where}, so its API may have changed.`);
  }
}

// Search results carry every locale at once, while other endpoints answer in the requested one.
function localized(value, region) {
  if (value == null || typeof value === 'string') return value ?? null;
  return value[LOCALES[region]] ?? value.en_US ?? Object.values(value).find(Boolean) ?? null;
}

function clusterOf(data, region) {
  return {
    id: data.id,
    status: localized(data.status?.name, region),
    population: localized(data.population?.name, region),
    hasQueue: data.has_queue === true,
    realms: (data.realms ?? []).map((realm) => ({
      name: localized(realm.name, region) ?? realm.slug,
      slug: realm.slug,
      type: localized(realm.type?.name, region),
      category: localized(realm.category, region),
      timezone: realm.timezone ?? null,
      keys: [realm.slug, ...(typeof realm.name === 'string' ? [realm.name] : Object.values(realm.name ?? {}))].filter(Boolean).map(realmKey),
    })),
  };
}

// One search call lists every connected realm with its member realms, the cheapest way to map a realm to its cluster.
async function loadClusters(credentials, region, flavor) {
  const clusters = [];
  for (let page = 1, pages = 1; page <= pages; page += 1) {
    const body = await apiGet(credentials, region, '/data/wow/search/connected-realm', {
      namespace: namespace('dynamic', flavor, region), orderby: 'id', _page: page, _pageSize: 1000,
    });
    if (!Array.isArray(body?.results)) throw new Error('Blizzard changed its connected realm search response, so this server needs an update.');
    clusters.push(...body.results.map((result) => clusterOf(result.data ?? {}, region)));
    pages = Math.min(body.pageCount ?? 1, 10);
  }
  return clusters;
}

function realmIndex(credentials, region, flavor) {
  return cached(`realms:${region}:${flavor}`, REALMS_MS, () => loadClusters(credentials, region, flavor));
}

function findRealm(clusters, realm) {
  const key = realmKey(realm);
  for (const cluster of clusters) {
    const match = cluster.realms.find((member) => member.keys.includes(key));
    if (match) return { cluster, realm: match };
  }
  return null;
}

export async function searchRealms({ region, flavor, query }) {
  const credentials = await requireCredentials();
  const clusters = await realmIndex(credentials, region, flavor);
  const key = realmKey(query);
  return clusters.filter((cluster) => cluster.realms.some((realm) => realm.keys.some((name) => name.includes(key))));
}

function characterPath(slug, name, section) {
  return `/profile/wow/character/${encodeURIComponent(slug)}/${encodeURIComponent(name)}${section ? `/${section}` : ''}`;
}

function missing(error) {
  if (error.status === 404) return null;
  throw error;
}

async function lookupCharacter({ region, realm, name, flavor }) {
  const credentials = await requireCredentials();
  const params = { namespace: namespace('profile', flavor, region) };
  const character = name.normalize('NFC').trim().toLowerCase();
  const summaryOf = (slug) => apiGet(credentials, region, characterPath(slug, character), params).catch(missing);

  // A section may fail alone without losing the profile, and the answer says which one is missing.
  async function sectionsOf(slug) {
    const entries = Object.entries(SECTIONS);
    const results = await Promise.allSettled(entries.map(([section]) => apiGet(credentials, region, characterPath(slug, character, section), params)));
    const sections = { warnings: [] };
    results.forEach((result, index) => {
      const [section, label] = entries[index];
      if (result.status === 'fulfilled') sections[section] = result.value;
      else sections.warnings.push(`${label} could not be loaded: ${result.reason.message}`);
    });
    return sections;
  }

  // All sections load together, since the realm the user names is nearly always the right one.
  const guess = toSlug(realm);
  const [summary, sections] = await Promise.all([summaryOf(guess), sectionsOf(guess)]);
  if (summary) return { summary, ...sections, notes: [] };

  // Characters live on their home realm only, so a miss is retried on the other realms of its connected cluster.
  const where = `${region} ${flavor}`;
  let clusters;
  try {
    clusters = await realmIndex(credentials, region, flavor);
  } catch (error) {
    throw new Error(`No public character "${name}" on ${realm} (${where}). It may not exist there, or its profile is not public. `
      + `The realm list could not be loaded to try its connected realms: ${error.message}`);
  }
  const home = findRealm(clusters, realm);
  if (!home) throw new Error(`Blizzard lists no realm "${realm}" in ${where}. Find the right one with the realm tool, or check the region and flavor.`);
  const candidates = [home.realm, ...home.cluster.realms.filter((member) => member !== home.realm)].filter((member) => member.slug !== guess);
  const found = await Promise.all(candidates.map((member) => summaryOf(member.slug)));
  const index = found.findIndex(Boolean);
  if (index < 0) {
    const others = home.cluster.realms.filter((member) => member !== home.realm).map((member) => member.name);
    const scope = others.length ? `${home.realm.name} or its connected realms ${others.join(', ')}` : home.realm.name;
    throw new Error(`No public character "${name}" on ${scope} (${where}). Check the name, realm, region and flavor. `
      + 'A character that does not exist there, or whose profile is not public, has no armory profile.');
  }
  const match = candidates[index];
  const notes = match === home.realm ? [] : [`Not on ${home.realm.name}. Found on ${match.name}, its home realm in the same connected realm.`];
  return { summary: found[index], ...(await sectionsOf(match.slug)), notes };
}

export function findCharacter(input) {
  const key = `character:${input.region}:${input.flavor}:${toSlug(input.realm)}:${input.name.trim().toLowerCase()}`;
  return cached(key, CHARACTER_MS, () => lookupCharacter(input));
}
