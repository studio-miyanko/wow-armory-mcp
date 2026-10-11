import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FLAVORS, findCharacter, searchRealms } from '../src/blizzard.js';

// The live checks call Blizzard with a real client, so they catch API changes but run only when BLIZZARD_CLIENT_ID is set.
const skip = !process.env.BLIZZARD_CLIENT_ID && 'needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET';

test('live: every flavor lists its realms, and an unknown character is a clear 404', { skip }, async () => {
  for (const flavor of Object.keys(FLAVORS)) {
    const clusters = await searchRealms({ region: 'eu', flavor, query: 'a' });
    assert.ok(clusters.length > 0, `${flavor} has no realms`);
    assert.ok(clusters.every((cluster) => cluster.realms.every((realm) => realm.slug && realm.name)), `${flavor} realms lack a name or slug`);
  }
  const [draenor] = await searchRealms({ region: 'eu', flavor: 'retail', query: 'draenor' });
  assert.ok(draenor.realms.some((realm) => realm.slug === 'draenor'));
  await assert.rejects(findCharacter({ region: 'eu', realm: 'Draenor', name: 'Qxzqxzqxzq', flavor: 'retail' }), /No public character "Qxzqxzqxzq" on Draenor/);
});
