import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { beforeEach, test } from 'node:test';

import { SETUP } from '../src/auth.js';
import { FLAVORS, armoryUrl, clearCaches, findCharacter, namespace, searchRealms, toSlug } from '../src/blizzard.js';
import { formatCharacter, formatClusters, stripCodes } from '../src/format.js';
import * as fixtures from './fixtures.js';

// The offline checks replace fetch with Blizzard-shaped answers, since the API needs a client that a fresh checkout lacks.
process.env.BLIZZARD_CLIENT_ID = 'test-client-id';
process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';

const ALLOWED_HOSTS = /^(oauth\.battle\.net|(us|eu|kr|tw)\.api\.blizzard\.com)$/;

beforeEach(() => clearCaches());

async function withFetch(answer, run) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.match(url.hostname, ALLOWED_HOSTS);
    calls.push({ url, init });
    const [status, body] = answer(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Answers like Blizzard: a token from the OAuth host, the fixture for a known path and a 404 for anything else.
function blizzard(paths, tokens = ['token-1']) {
  let issued = 0;
  return (url) => {
    if (url.hostname === 'oauth.battle.net') {
      const token = tokens[Math.min(issued, tokens.length - 1)];
      issued += 1;
      return [200, { access_token: token, token_type: 'bearer', expires_in: 86_399, sub: 'test-client-id' }];
    }
    const body = paths[url.pathname];
    return body ? [200, body] : [404, fixtures.notFound];
  };
}

function apiCalls(calls) {
  return calls.filter((call) => call.url.hostname !== 'oauth.battle.net');
}

function tokenCalls(calls) {
  return calls.filter((call) => call.url.hostname === 'oauth.battle.net');
}

const realmPaths = { '/data/wow/search/connected-realm': fixtures.euRealms };

test('realm slugs follow Blizzard\'s rules and namespaces follow the flavor', () => {
  assert.equal(toSlug('Kel\'Thuzad'), 'kelthuzad');
  assert.equal(toSlug('Argent Dawn'), 'argent-dawn');
  assert.equal(toSlug('argent-dawn'), 'argent-dawn');
  assert.equal(toSlug('  Draenor '), 'draenor');
  assert.equal(toSlug('Aggra (Português)'), 'aggra-português');
  assert.equal(toSlug('Pozzo dell’Eternità'), 'pozzo-delleternità');
  assert.deepEqual(Object.keys(FLAVORS).map((flavor) => namespace('profile', flavor, 'eu')),
    ['profile-eu', 'profile-classic-eu', 'profile-classic1x-eu', 'profile-classicann-eu']);
  assert.deepEqual(Object.keys(FLAVORS).map((flavor) => namespace('dynamic', flavor, 'us')),
    ['dynamic-us', 'dynamic-classic-us', 'dynamic-classic1x-us', 'dynamic-classicann-us']);
});

test('armory links name the game like the armory does and encode realm and name', () => {
  const character = { name: 'Bananía', realm: { slug: 'la-croisade-écarlate' } };
  const games = Object.fromEntries(Object.keys(FLAVORS).map((flavor) => [flavor, armoryUrl({ region: 'eu', flavor }, character)]));
  assert.deepEqual(games, {
    retail: 'https://worldofwarcraft.blizzard.com/worldsoul/eu/armory/character/la-croisade-%C3%A9carlate/banan%C3%ADa',
    classic: 'https://worldofwarcraft.blizzard.com/classic/eu/armory/character/la-croisade-%C3%A9carlate/banan%C3%ADa',
    era: 'https://worldofwarcraft.blizzard.com/classic1x/eu/armory/character/la-croisade-%C3%A9carlate/banan%C3%ADa',
    anniversary: 'https://worldofwarcraft.blizzard.com/classicann/eu/armory/character/la-croisade-%C3%A9carlate/banan%C3%ADa',
  });
  assert.equal(armoryUrl({ region: 'eu', flavor: 'retail' }, { name: 'Bananía' }), null);
});

test('one token serves parallel calls and is renewed once it expires', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  await withFetch(blizzard(realmPaths, ['token-1', 'token-2']), async (calls) => {
    await Promise.all([
      searchRealms({ region: 'eu', flavor: 'retail', query: 'draenor' }),
      searchRealms({ region: 'us', flavor: 'retail', query: 'draenor' }),
      searchRealms({ region: 'eu', flavor: 'era', query: 'draenor' }),
    ]);
    const [login, ...more] = tokenCalls(calls);
    assert.equal(more.length, 0);
    assert.equal(login.init.method, 'POST');
    assert.equal(login.init.headers.authorization, `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`);
    assert.equal(String(login.init.body), 'grant_type=client_credentials');
    assert.match(login.init.headers['user-agent'], /^wow-armory-mcp\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/studio-miyanko\/wow-armory-mcp\)$/);

    const requests = apiCalls(calls);
    assert.deepEqual(requests.map((call) => call.url.searchParams.get('namespace')).sort(), ['dynamic-classic1x-eu', 'dynamic-eu', 'dynamic-us']);
    for (const { url, init } of requests) {
      assert.equal(init.headers.authorization, 'Bearer token-1');
      assert.equal(url.searchParams.get('_pageSize'), '1000');
      assert.equal(url.searchParams.get('locale'), url.hostname.startsWith('eu') ? 'en_GB' : 'en_US');
      assert.doesNotMatch(url.href, /token|secret/);
    }

    t.mock.timers.tick(24 * 60 * 60 * 1000);
    await searchRealms({ region: 'kr', flavor: 'retail', query: 'draenor' });
    assert.equal(tokenCalls(calls).length, 2);
    assert.equal(calls.at(-1).init.headers.authorization, 'Bearer token-2');
  });
});

test('a retail profile becomes compact text with stats and items', async () => {
  const paths = fixtures.profilePaths('draenor', 'zuljaro', fixtures.retailProfile);
  await withFetch(blizzard(paths), async (calls) => {
    const input = { region: 'eu', realm: 'Draenor', name: 'Zuljaro', flavor: 'retail' };
    const text = formatCharacter(await findCharacter(input), input);

    const requests = apiCalls(calls);
    assert.deepEqual(requests.map((call) => call.url.pathname).sort(), Object.keys(paths).sort());
    for (const { url } of requests) {
      assert.equal(url.searchParams.get('namespace'), 'profile-eu');
      assert.equal(url.searchParams.get('locale'), 'en_GB');
    }

    assert.equal(text.split('\n\n')[0], [
      'Zuljaro, level 80 Troll Shaman',
      'Spec: Enhancement, hero talents Stormbringer',
      'Faction: Horde',
      'Guild: Bloodsail Vanguard',
      'Realm: Draenor (eu, retail)',
      'Last login: 2026-10-10 18:22 UTC',
      'Item level: 642 average, 639 equipped',
      'Armory: https://worldofwarcraft.blizzard.com/worldsoul/eu/armory/character/draenor/zuljaro',
      'Portrait: https://render.worldofwarcraft.com/eu/character/draenor/14/70112334-avatar.jpg',
    ].join('\n'));
    assert.match(text, /\n\nStats\nHealth: 8,412,340\nMana: 250,000\nStrength: 1,802\nAgility: 41,208\nIntellect: 2,401\nStamina: 420,617\nArmor: 31,220\n/);
    assert.match(text, /\nAttack power: 43,270\nSpell power: 23,400\n/);
    assert.match(text, /\nCrit: 23\.23% \(rating 12,760\)\nHaste: 21\.4% \(rating 14,120\)\nMastery: 48\.5% \(rating 9,870\)\n/);
    assert.match(text, /\nVersatility: 5\.25% damage and healing done, 2\.62% less damage taken \(rating 4,120\)\nDodge: 9\.1%\nSpeed: 3\.2% \(rating 410\)\n/);
    assert.match(text, /\n\nEquipment\n- Head: Living Weapon's Faceshield, item level 639, Epic\n- Chest: Living Weapon's Ramparts, item level 639, Epic, enchant Crystalline Radiance\n/);
    assert.match(text, /\n- Shirt: Common Gray Shirt, item level 1, Common\n- Main Hand: Charged Slicer, item level 642, Epic, enchant Authority of Radiant Power$/);
    assert.doesNotMatch(text, /Parry|Block|Leech|Avoidance|Note:|undefined|null|NaN|\|A:/);
  });
});

test('a Classic Era Hardcore profile shows talent points, spirit and defense', async () => {
  const paths = fixtures.profilePaths('nekrosh', 'pipwick', fixtures.eraProfile);
  await withFetch(blizzard(paths), async (calls) => {
    const input = { region: 'eu', realm: 'Nek\'Rosh', name: 'PIPWICK', flavor: 'era' };
    const text = formatCharacter(await findCharacter(input), input);
    for (const { url } of apiCalls(calls)) assert.equal(url.searchParams.get('namespace'), 'profile-classic1x-eu');

    assert.equal(text.split('\n\n')[0], [
      'Pipwick, level 60 Gnome Mage',
      'Talents: Arcane 0, Fire 31, Frost 20',
      'Faction: Alliance',
      'Realm: Nek\'Rosh (eu, era)',
      'Self-found: yes',
      'Last login: 2026-10-09 20:05 UTC',
      'Item level: 61 average, 60 equipped',

      // Built from the API's slug and name, not from the input "Nek'Rosh" and "PIPWICK".
      'Armory: https://worldofwarcraft.blizzard.com/classic1x/eu/armory/character/nekrosh/pipwick',
      'Portrait: https://render.worldofwarcraft.com/classic1x-eu/character/nekrosh/43/88201771-avatar.jpg',
    ].join('\n'));
    assert.match(text, /\nIntellect: 290\nStamina: 210\nSpirit: 168\nArmor: 1,380\nDefense: 300\nAttack power: 24\nSpell power: 512\n/);
    assert.match(text, /\nCrit: melee 4\.8%, ranged 4\.8%, spell 9\.15%\nDodge: 3\.9%\n/);
    assert.match(text, /\n- Head: Netherwind Crown, item level 76, Epic, enchant \+8 Spell Damage and Healing\n- Shirt: White Linen Shirt, Common$/);
    assert.doesNotMatch(text, /Spec:|Guild:|Hardcore: dead|Haste|Mastery|Versatility|undefined|null|NaN/);
  });
});

test('a missing section keeps the rest of the profile and says so', async () => {
  const { statistics, media, ...rest } = fixtures.eraProfile;
  const paths = fixtures.profilePaths('nekrosh', 'pipwick', rest);
  await withFetch(blizzard(paths), async (calls) => {
    const input = { region: 'eu', realm: 'nekrosh', name: 'Pipwick', flavor: 'anniversary' };
    const text = formatCharacter(await findCharacter(input), input);
    for (const { url } of apiCalls(calls)) assert.equal(url.searchParams.get('namespace'), 'profile-classicann-eu');
    assert.match(text, /\nNote: Statistics could not be loaded: Blizzard has nothing at \/profile\/wow\/character\/nekrosh\/pipwick\/statistics in profile-classicann-eu\./);
    assert.match(text, /\nArmory: https:\/\/worldofwarcraft\.blizzard\.com\/classicann\/eu\/armory\/character\/nekrosh\/pipwick\n/);
    assert.match(text, /\nNote: Portrait could not be loaded: /);
    assert.doesNotMatch(text, /\nPortrait: /);
    assert.doesNotMatch(text, /\n\nStats\n/);
    assert.match(text, /\n\nEquipment\n- Head: Netherwind Crown/);
  });
});

test('a character on another realm of the connected realm is found there', async () => {
  const paths = { ...realmPaths, ...fixtures.profilePaths('quelthalas', 'zuljaro', fixtures.retailProfile) };
  await withFetch(blizzard(paths), async (calls) => {
    const input = { region: 'eu', realm: 'Azjol-Nerub', name: 'Zuljaro', flavor: 'retail' };
    const text = formatCharacter(await findCharacter(input), input);
    const summaries = apiCalls(calls).map((call) => call.url.pathname).filter((path) => /^\/profile\/wow\/character\/[^/]+\/zuljaro$/.test(path));
    assert.deepEqual(summaries.sort(), ['azjol-nerub', 'azjolnerub', 'quelthalas'].map((slug) => `/profile/wow/character/${slug}/zuljaro`));
    assert.match(text, /\nNote: Not on Azjol-Nerub\. Found on Quel'Thalas, its home realm in the same connected realm\./);
    assert.match(text, /\n\nEquipment\n- Head: /);
  });

  // A slug that breaks the naming rule is corrected without a note.
  clearCaches();
  const exception = { ...realmPaths, ...fixtures.profilePaths('azjolnerub', 'zuljaro', fixtures.retailProfile) };
  await withFetch(blizzard(exception), async () => {
    const input = { region: 'eu', realm: 'Azjol-Nerub', name: 'Zuljaro', flavor: 'retail' };
    const profile = await findCharacter(input);
    assert.deepEqual(profile.notes, []);
    assert.deepEqual(profile.warnings, []);
  });
});

test('404s explain whether the character or the realm is missing', async () => {
  await withFetch(blizzard(realmPaths), async () => {
    await assert.rejects(findCharacter({ region: 'eu', realm: 'Draenor', name: 'Nobody', flavor: 'retail' }),
      /^Error: No public character "Nobody" on Draenor \(eu retail\)\. Check the name, realm, region and flavor\./);
    await assert.rejects(findCharacter({ region: 'eu', realm: 'quelthalas', name: 'Nobody', flavor: 'retail' }),
      /No public character "Nobody" on Quel'Thalas or its connected realms Azjol-Nerub \(eu retail\)/);
    await assert.rejects(findCharacter({ region: 'eu', realm: 'Nowhere', name: 'Nobody', flavor: 'retail' }),
      /Blizzard lists no realm "Nowhere" in eu retail\. Find the right one with the realm tool/);
  });
});

test('missing credentials answer with setup steps before any request', async () => {
  const saved = { id: process.env.BLIZZARD_CLIENT_ID, secret: process.env.BLIZZARD_CLIENT_SECRET };
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  delete process.env.BLIZZARD_CLIENT_ID;
  delete process.env.BLIZZARD_CLIENT_SECRET;

  // Off macOS there is no keychain, so the real one on this machine stays out of the test.
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  try {
    await withFetch(() => assert.fail('no request without credentials'), async (calls) => {
      await assert.rejects(findCharacter({ region: 'eu', realm: 'Draenor', name: 'Zuljaro', flavor: 'retail' }), { message: SETUP });
      await assert.rejects(searchRealms({ region: 'eu', flavor: 'retail', query: 'draenor' }), { message: SETUP });
      assert.equal(calls.length, 0);
    });
  } finally {
    Object.defineProperty(process, 'platform', platform);
    process.env.BLIZZARD_CLIENT_ID = saved.id;
    process.env.BLIZZARD_CLIENT_SECRET = saved.secret;
  }
  assert.match(SETUP, /https:\/\/develop\.battle\.net\/access\/clients/);
  assert.match(SETUP, /BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET/);
  assert.match(SETUP, /security add-generic-password -s blizzard-api -a client-id -w\n.*security add-generic-password -s blizzard-api -a client-secret -w/);
});

test('refused credentials name the fix and never the secret', async () => {
  await withFetch((url) => [401, { error: 'invalid_client', error_description: 'Bad client credentials' }], async (calls) => {
    const error = await findCharacter({ region: 'us', realm: 'Area 52', name: 'Nobody', flavor: 'retail' }).catch((failure) => failure);
    assert.match(error.message, /Battle\.net rejected the client id or secret/);
    assert.doesNotMatch(error.message, /test-client-secret/);
    assert.ok(calls.every((call) => call.url.hostname === 'oauth.battle.net'));
  });

  // A refused API request gets one fresh token, then fails with the fix.
  clearCaches();
  const refuse = blizzard({}, ['token-1', 'token-2']);
  await withFetch((url, init) => (url.hostname === 'oauth.battle.net' ? refuse(url, init) : [401, {}]), async (calls) => {
    await assert.rejects(searchRealms({ region: 'us', flavor: 'retail', query: 'area' }), /Blizzard refused the request \(401\)\. Check the client id and secret/);
    assert.equal(tokenCalls(calls).length, 2);
    assert.deepEqual(apiCalls(calls).map((call) => call.init.headers.authorization), ['Bearer token-1', 'Bearer token-2']);
  });
});

test('realm search matches any locale, slug or part of a name', async () => {
  await withFetch(blizzard(realmPaths), async (calls) => {
    const german = await searchRealms({ region: 'eu', flavor: 'retail', query: 'silberne' });
    assert.equal(formatClusters(german, { region: 'eu', flavor: 'retail', query: 'silberne' }), [
      '1 eu retail connected realm with a realm named like "silberne". Pass the realm name or slug to the character tool.',
      '',
      'Connected realm 1104: Up, population Medium',
      '- Die Silberne Hand (die-silberne-hand): Normal, German, Europe/Paris',
      '- Die ewige Wacht (die-ewige-wacht): Normal, German, Europe/Paris',
    ].join('\n'));
    const [russian] = await searchRealms({ region: 'eu', flavor: 'retail', query: 'Ревущий' });
    assert.equal(russian.realms[0].slug, 'howling-fjord');
    const [quel] = await searchRealms({ region: 'eu', flavor: 'retail', query: 'quel thalas' });
    assert.equal(quel.id, 1396);
    assert.equal(apiCalls(calls).length, 1);
  });
  assert.match(formatClusters([], { region: 'us', flavor: 'era', query: 'nowhere' }), /^No us era realm is named like "nowhere"/);
  assert.equal(stripCodes('|cffa335eeEpic|r |A:Professions-ChatIcon-Quality-Tier3:20:20|a ring'), 'Epic ring');
});

test('the stdio server lists two read-only tools and explains a missing setup', async () => {
  // An empty PATH hides the keychain tool, so the server always runs without credentials here.
  const env = { ...process.env, PATH: '' };
  delete env.BLIZZARD_CLIENT_ID;
  delete env.BLIZZARD_CLIENT_SECRET;
  const child = spawn(process.execPath, ['src/index.js'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      replies.get(message.id)?.(message);
    }
  });
  const call = (id, method, params) => new Promise((done) => {
    replies.set(id, done);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  try {
    await call(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const { result: list } = await call(2, 'tools/list', {});
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(), ['character', 'realm']);
    for (const tool of list.tools) assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: true });
    const { result } = await call(3, 'tools/call', { name: 'character', arguments: { region: 'eu', realm: 'Draenor', name: 'Zuljaro' } });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, SETUP);
  } finally {
    child.kill();
  }
});
