// Shapes follow Blizzard's responses as typed and validated live by github.com/Pewtro/blizzard-api. Names and values are made up.

const LOCALES = ['en_US', 'es_MX', 'pt_BR', 'de_DE', 'en_GB', 'es_ES', 'fr_FR', 'it_IT', 'ru_RU', 'ko_KR', 'zh_TW', 'zh_CN'];

// Search results name everything in all locales at once.
function names(english, overrides = {}) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, overrides[locale] ?? english]));
}

function key(path) {
  return { href: `https://eu.api.blizzard.com${path}?namespace=static-eu` };
}

function nameIdKey(name, id, path) {
  return { key: key(`${path}/${id}`), name, id };
}

function realmRef(name, id, slug) {
  return { key: key(`/data/wow/realm/${id}`), name, id, slug };
}

function characterRef(name, id, realm) {
  return { key: key(`/profile/wow/character/${realm.slug}/${name.toLowerCase()}`), name, id, realm };
}

function rating(value, normalized = 0, bonus = 0) {
  return { rating_bonus: bonus, rating_normalized: normalized, value };
}

export const notFound = { code: 404, type: 'BLZWEBAPI00000404', detail: 'Not Found' };

function searchRealm(id, english, slug, { type = 'Normal', typeKey = 'NORMAL', category = 'English', locale = 'enGB', overrides } = {}) {
  return {
    is_tournament: false,
    timezone: 'Europe/Paris',
    name: names(english, overrides),
    id,
    region: { name: names('Europe'), id: 3 },
    category: names(category),
    locale,
    type: { name: names(type), type: typeKey },
    slug,
  };
}

function cluster(id, population, realms) {
  return {
    key: { href: `https://eu.api.blizzard.com/data/wow/connected-realm/${id}?namespace=dynamic-eu` },
    data: {
      realms,
      id,
      has_queue: false,
      status: { name: names('Up'), type: 'UP' },
      population: { name: names(population), type: population.toUpperCase() },
    },
  };
}

export const euRealms = {
  page: 1,
  pageSize: 4,
  maxPageSize: 1000,
  pageCount: 1,
  results: [
    cluster(1403, 'High', [searchRealm(1403, 'Draenor', 'draenor')]),
    cluster(1396, 'Medium', [
      searchRealm(1396, 'Azjol-Nerub', 'azjolnerub'),
      searchRealm(1424, "Quel'Thalas", 'quelthalas'),
    ]),
    cluster(1104, 'Medium', [
      searchRealm(1104, 'Die Silberne Hand', 'die-silberne-hand', { category: 'German', locale: 'deDE' }),
      searchRealm(1118, 'Die ewige Wacht', 'die-ewige-wacht', { category: 'German', locale: 'deDE' }),
    ]),
    cluster(1615, 'Full', [
      searchRealm(1615, 'Howling Fjord', 'howling-fjord', { type: 'Roleplaying', typeKey: 'RP', category: 'Russian', locale: 'ruRU', overrides: { ru_RU: 'Ревущий фьорд' } }),
    ]),
  ],
};

const draenor = realmRef('Draenor', 1403, 'draenor');
const zuljaro = characterRef('Zuljaro', 210_445_118, draenor);

export const retailSummary = {
  _links: { self: key('/profile/wow/character/draenor/zuljaro') },
  id: zuljaro.id,
  name: 'Zuljaro',
  gender: { type: 'MALE', name: 'Male' },
  faction: { type: 'HORDE', name: 'Horde' },
  race: nameIdKey('Troll', 8, '/data/wow/playable-race'),
  character_class: nameIdKey('Shaman', 7, '/data/wow/playable-class'),
  active_spec: nameIdKey('Enhancement', 263, '/data/wow/playable-specialization'),
  realm: draenor,
  guild: { ...nameIdKey('Bloodsail Vanguard', 70_112_334, '/data/wow/guild/draenor'), realm: draenor, faction: { type: 'HORDE', name: 'Horde' } },
  level: 80,
  experience: 0,
  achievement_points: 21_340,
  achievements: key('/profile/wow/character/draenor/zuljaro/achievements'),
  last_login_timestamp: 1_791_656_520_000,
  average_item_level: 642,
  equipped_item_level: 639,
  active_title: { ...nameIdKey('Hand of A\'dal', 74, '/data/wow/title'), display_string: '{name}, Hand of A\'dal' },
  covenant_progress: { chosen_covenant: nameIdKey('Kyrian', 1, '/data/wow/covenant'), renown_level: 80, soulbinds: key('/profile/wow/character/draenor/zuljaro/soulbinds') },
  is_remix: false,
  name_search: 'zuljaro',
  equipment: key('/profile/wow/character/draenor/zuljaro/equipment'),
  statistics: key('/profile/wow/character/draenor/zuljaro/statistics'),
  specializations: key('/profile/wow/character/draenor/zuljaro/specializations'),
};

export const retailStatistics = {
  _links: { self: key('/profile/wow/character/draenor/zuljaro/statistics') },
  health: 8_412_340,
  power: 250_000,
  power_type: nameIdKey('Mana', 0, '/data/wow/power-type'),
  speed: { rating_bonus: 3.2, rating_normalized: 410 },
  strength: { base: 1_802, effective: 1_802 },
  agility: { base: 2_210, effective: 41_208 },
  intellect: { base: 2_401, effective: 2_401 },
  stamina: { base: 1_904, effective: 420_617 },
  melee_crit: rating(23.23, 12_760, 18.23),
  melee_haste: rating(21.4, 14_120, 21.4),
  mastery: rating(48.5, 9_870, 20.6),
  bonus_armor: 0,
  lifesteal: rating(0),
  versatility: 4_120,
  versatility_damage_done_bonus: 5.25,
  versatility_healing_done_bonus: 5.25,
  versatility_damage_taken_bonus: 2.62,
  avoidance: { rating_bonus: 0, rating_normalized: 0 },
  attack_power: 43_270,
  main_hand_damage_min: 14_002,
  main_hand_damage_max: 21_004,
  main_hand_speed: 2.6,
  main_hand_dps: 6_732.5,
  off_hand_damage_min: 7_001,
  off_hand_damage_max: 10_502,
  off_hand_speed: 2.6,
  off_hand_dps: 3_366.2,
  spell_power: 23_400,
  spell_penetration: 0,
  spell_crit: rating(23.23, 12_760, 18.23),
  mana_regen: 2_000,
  mana_regen_combat: 2_000,
  armor: { base: 31_220, effective: 31_220 },
  dodge: rating(9.1),
  parry: rating(0),
  block: rating(0),
  ranged_crit: rating(23.23, 12_760, 18.23),
  ranged_haste: rating(21.4, 14_120, 21.4),
  spell_haste: rating(21.4, 14_120, 21.4),
  character: zuljaro,
};

function equippedItem(slot, slotName, name, level, quality, extra = {}) {
  return {
    item: { key: key(`/data/wow/item/${name.length * 1000}`), id: name.length * 1000 },
    slot: { type: slot, name: slotName },
    quantity: 1,
    context: 16,
    bonus_list: [10_356, 1_540],
    quality: { type: quality.toUpperCase(), name: quality },
    name,
    media: { key: key(`/data/wow/media/item/${name.length}`), id: name.length },
    item_class: nameIdKey('Armor', 4, '/data/wow/item-class'),
    item_subclass: nameIdKey('Mail', 3, '/data/wow/item-class/4/item-subclass'),
    inventory_type: { type: slot, name: slotName },
    binding: { type: 'ON_ACQUIRE', name: 'Binds when picked up' },
    ...(level ? { level: { value: level, display_string: `Item Level ${level}` } } : {}),
    ...extra,
  };
}

function enchant(display, id = 7_364) {
  return { display_string: display, enchantment_id: id, enchantment_slot: { id: 0, type: 'PERMANENT' } };
}

export const retailEquipment = {
  _links: { self: key('/profile/wow/character/draenor/zuljaro/equipment') },
  character: zuljaro,
  equipped_items: [
    equippedItem('HEAD', 'Head', 'Living Weapon\'s Faceshield', 639, 'Epic'),
    equippedItem('CHEST', 'Chest', 'Living Weapon\'s Ramparts', 639, 'Epic', {
      enchantments: [enchant('Enchanted: Crystalline Radiance |A:Professions-ChatIcon-Quality-Tier3:20:20|a')],
    }),
    equippedItem('SHIRT', 'Shirt', 'Common Gray Shirt', 1, 'Common'),
    equippedItem('MAIN_HAND', 'Main Hand', 'Charged Slicer', 642, 'Epic', {
      enchantments: [enchant('Enchanted: Authority of Radiant Power |A:Professions-ChatIcon-Quality-Tier3:20:20|a', 7_454)],
    }),
  ],
};

export const retailSpecializations = {
  _links: { self: key('/profile/wow/character/draenor/zuljaro/specializations') },
  specializations: [{ specialization: nameIdKey('Enhancement', 263, '/data/wow/playable-specialization'), loadouts: [] }],
  active_specialization: nameIdKey('Enhancement', 263, '/data/wow/playable-specialization'),
  active_hero_talent_tree: nameIdKey('Stormbringer', 54, '/data/wow/talent-tree'),
  character: zuljaro,
};

// Builds the four profile paths of one character, so a test can place it on any realm.
export function profilePaths(slug, name, { summary, statistics, equipment, specializations }) {
  const base = `/profile/wow/character/${slug}/${name}`;
  return Object.fromEntries([
    [base, summary],
    [`${base}/statistics`, statistics],
    [`${base}/equipment`, equipment],
    [`${base}/specializations`, specializations],
  ].filter(([, body]) => body));
}

export const retailProfile = { summary: retailSummary, statistics: retailStatistics, equipment: retailEquipment, specializations: retailSpecializations };

const nekrosh = realmRef('Nek\'Rosh', 5_826, 'nekrosh');
const pipwick = characterRef('Pipwick', 88_201_771, nekrosh);

export const eraSummary = {
  _links: { self: key('/profile/wow/character/nekrosh/pipwick') },
  id: pipwick.id,
  name: 'Pipwick',
  gender: { type: 'FEMALE', name: 'Female' },
  faction: { type: 'ALLIANCE', name: 'Alliance' },
  race: nameIdKey('Gnome', 7, '/data/wow/playable-race'),
  character_class: nameIdKey('Mage', 8, '/data/wow/playable-class'),
  realm: nekrosh,
  level: 60,
  experience: 0,
  titles: key('/profile/wow/character/nekrosh/pipwick/titles'),
  pvp_summary: key('/profile/wow/character/nekrosh/pipwick/pvp-summary'),
  media: key('/profile/wow/character/nekrosh/pipwick/character-media'),
  last_login_timestamp: 1_791_576_300_000,
  average_item_level: 61,
  equipped_item_level: 60,
  specializations: key('/profile/wow/character/nekrosh/pipwick/specializations'),
  statistics: key('/profile/wow/character/nekrosh/pipwick/statistics'),
  appearance: key('/profile/wow/character/nekrosh/pipwick/appearance'),
  equipment: key('/profile/wow/character/nekrosh/pipwick/equipment'),
  is_ghost: false,
  is_self_found: true,
};

export const eraStatistics = {
  _links: { self: key('/profile/wow/character/nekrosh/pipwick/statistics') },
  health: 3_845,
  power: 6_120,
  power_type: nameIdKey('Mana', 0, '/data/wow/power-type'),
  strength: { base: 24, effective: 34 },
  agility: { base: 38, effective: 48 },
  intellect: { base: 130, effective: 290 },
  stamina: { base: 54, effective: 210 },
  spirit: { base: 125, effective: 168 },
  melee_crit: rating(4.8),
  ranged_crit: rating(4.8),
  spell_crit: rating(9.15),
  attack_power: 24,
  main_hand_damage_min: 54,
  main_hand_damage_max: 102,
  main_hand_speed: 1.6,
  main_hand_dps: 48.7,
  off_hand_damage_min: 0,
  off_hand_damage_max: 0,
  off_hand_speed: 2,
  off_hand_dps: 0,
  spell_power: 512,
  spell_penetration: 0,
  mana_regen: 41,
  mana_regen_combat: 6,
  armor: { base: 1_380, effective: 1_380 },
  defense: { base: 300, effective: 300 },
  dodge: rating(3.9),
  parry: rating(0),
  block: rating(0),
  fire_resistance: { base: 0, effective: 10 },
  frost_resistance: { base: 0, effective: 10 },
  character: pipwick,
};

export const eraEquipment = {
  _links: { self: key('/profile/wow/character/nekrosh/pipwick/equipment') },
  character: pipwick,
  equipped_items: [
    equippedItem('HEAD', 'Head', 'Netherwind Crown', 76, 'Epic', {
      enchantments: [{ display_string: 'Enchanted: +8 Spell Damage and Healing', enchantment_id: 2_588, enchantment_slot: { id: 0, type: 'PERMANENT' } }],
    }),
    equippedItem('SHIRT', 'Shirt', 'White Linen Shirt', null, 'Common'),
  ],
  equipped_item_sets: [],
};

function talents(treeName, points) {
  return { specialization_name: treeName, spent_points: points, talents: [] };
}

export const eraSpecializations = {
  _links: { self: key('/profile/wow/character/nekrosh/pipwick/specializations') },
  specialization_groups: [
    { is_active: false, specializations: [talents('Arcane', 31), talents('Fire', 0), talents('Frost', 20)] },
    { is_active: true, specializations: [talents('Arcane', 0), talents('Fire', 31), talents('Frost', 20)] },
  ],
  character: pipwick,
};

export const eraProfile = { summary: eraSummary, statistics: eraStatistics, equipment: eraEquipment, specializations: eraSpecializations };
