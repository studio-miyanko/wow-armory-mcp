import { armoryUrl } from './blizzard.js';

// Answers are plain text to keep the model's context small, and empty or zero values are left out.

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const PRIMARY = { strength: 'Strength', agility: 'Agility', intellect: 'Intellect', stamina: 'Stamina', spirit: 'Spirit' };

const REALM_LIMIT = 25;

function count(value) {
  return integer.format(value);
}

function percent(value) {
  return `${Number(value.toFixed(2))}%`;
}

function block(...rows) {
  return rows.flat().filter(Boolean).join('\n');
}

// Game markup like |cffa335ee colors|r and |A:atlas|a icons only renders in the client.
export function stripCodes(text) {
  return text.replace(/\|c[0-9a-f]{8}|\|r|\|A:[^|]*\|a|\|T[^|]*\|t/gi, '').replace(/\s+/g, ' ').trim();
}

function loginTime(timestamp) {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function specLine(summary, specs) {
  const spec = specs?.active_specialization?.name ?? summary.active_spec?.name;
  const hero = specs?.active_hero_talent_tree?.name;
  return spec ? `Spec: ${spec}${hero ? `, hero talents ${hero}` : ''}` : null;
}

// Classic Era spreads talent points over three trees per talent group instead of naming an active spec.
function talentLine(specs) {
  const groups = specs?.specialization_groups ?? [];
  const group = groups.find((entry) => entry.is_active) ?? groups[0];
  const trees = (group?.specializations ?? []).filter((tree) => Number.isFinite(tree.spent_points));
  if (!trees.some((tree) => tree.spent_points > 0)) return null;
  return `Talents: ${trees.map((tree) => `${tree.specialization_name} ${tree.spent_points}`).join(', ')}`;
}

function itemLevelLine(summary) {
  const levels = [
    summary.average_item_level > 0 && `${summary.average_item_level} average`,
    summary.equipped_item_level > 0 && `${summary.equipped_item_level} equipped`,
  ].filter(Boolean);
  return levels.length ? `Item level: ${levels.join(', ')}` : null;
}

function headerLines(summary, specs, { region, flavor }) {
  const title = [summary.level > 0 && `level ${summary.level}`, summary.race?.name, summary.character_class?.name].filter(Boolean).join(' ');
  return [
    [summary.name, title].filter(Boolean).join(', '),
    specLine(summary, specs),
    talentLine(specs),
    summary.faction?.name && `Faction: ${summary.faction.name}`,
    summary.guild?.name && `Guild: ${summary.guild.name}`,
    `Realm: ${summary.realm?.name ?? summary.realm?.slug} (${region}, ${flavor})`,

    // Only Hardcore realms set these two flags.
    summary.is_ghost && 'Hardcore: dead',
    summary.is_self_found && 'Self-found: yes',
    summary.last_login_timestamp > 0 && `Last login: ${loginTime(summary.last_login_timestamp)}`,
    itemLevelLine(summary),
  ];
}

// Both are printed, never fetched. The avatar is the only portrait the API lists for every flavor.
function linkLines(summary, media, context) {
  const armory = armoryUrl(context, summary);
  const portrait = media?.assets?.find((asset) => asset.key === 'avatar')?.value;
  return [armory && `Armory: ${armory}`, portrait && `Portrait: ${portrait}`];
}

// Blizzard renamed rating to rating_normalized, so both are read.
function ratingOf(stat) {
  return stat?.rating_normalized ?? stat?.rating ?? 0;
}

// Avoidance and speed carry their percentage only as rating_bonus.
function valueOf(stat) {
  return stat?.value ?? stat?.rating_bonus ?? 0;
}

function withRating(text, rating) {
  return rating > 0 ? `${text} (rating ${count(rating)})` : text;
}

function rated(label, stat) {
  const value = valueOf(stat);
  return value > 0 ? withRating(`${label}: ${percent(value)}`, ratingOf(stat)) : null;
}

// Melee, ranged and spell values are usually equal, so they share one line unless they differ.
function combined(label, kinds) {
  const present = Object.entries(kinds).filter(([, stat]) => valueOf(stat) > 0);
  if (!present.length) return null;
  const values = new Set(present.map(([, stat]) => percent(valueOf(stat))));
  const text = values.size === 1 ? [...values][0] : present.map(([kind, stat]) => `${kind} ${percent(valueOf(stat))}`).join(', ');
  return withRating(`${label}: ${text}`, Math.max(...present.map(([, stat]) => ratingOf(stat))));
}

function versatilityLine(stats) {
  const done = stats.versatility_damage_done_bonus;
  if (!(done > 0)) return null;
  const taken = stats.versatility_damage_taken_bonus > 0 ? `, ${percent(stats.versatility_damage_taken_bonus)} less damage taken` : '';
  return withRating(`Versatility: ${percent(done)} damage and healing done${taken}`, stats.versatility);
}

function statLines(stats) {
  if (!stats) return [];
  return [
    stats.health > 0 && `Health: ${count(stats.health)}`,
    stats.power_type?.name && stats.power > 0 && `${stats.power_type.name}: ${count(stats.power)}`,
    ...Object.entries(PRIMARY).map(([key, label]) => stats[key]?.effective > 0 && `${label}: ${count(stats[key].effective)}`),
    stats.armor?.effective > 0 && `Armor: ${count(stats.armor.effective)}`,
    stats.defense?.effective > 0 && `Defense: ${count(stats.defense.effective)}`,
    stats.attack_power > 0 && `Attack power: ${count(stats.attack_power)}`,
    stats.spell_power > 0 && `Spell power: ${count(stats.spell_power)}`,
    combined('Crit', { melee: stats.melee_crit, ranged: stats.ranged_crit, spell: stats.spell_crit }),
    combined('Haste', { melee: stats.melee_haste, ranged: stats.ranged_haste, spell: stats.spell_haste }),
    rated('Mastery', stats.mastery),
    versatilityLine(stats),
    rated('Dodge', stats.dodge),
    rated('Parry', stats.parry),
    rated('Block', stats.block),
    rated('Leech', stats.lifesteal),
    rated('Avoidance', stats.avoidance),
    rated('Speed', stats.speed),
  ].filter(Boolean);
}

// Blizzard starts permanent enchants with "Enchanted: ", which the line already says.
function enchantText(enchant) {
  const text = enchant.display_string ?? enchant.source_item?.name ?? enchant.spell?.spell?.name;
  return text ? stripCodes(text).replace(/^Enchanted:\s*/i, '') || null : null;
}

function itemLine(item) {
  const enchants = (item.enchantments ?? []).map(enchantText).filter(Boolean);
  const details = [
    item.level?.value > 0 && `item level ${item.level.value}`,
    item.quality?.name,
    enchants.length && `enchant ${enchants.join('; ')}`,
  ].filter(Boolean);
  return `- ${item.slot?.name ?? item.slot?.type}: ${item.name}${details.length ? `, ${details.join(', ')}` : ''}`;
}

export function formatCharacter({ summary, statistics, equipment, specializations, 'character-media': media, warnings = [], notes = [] }, context) {
  const stats = statLines(statistics);
  const items = (equipment?.equipped_items ?? []).filter((item) => item.name).map(itemLine);
  return [
    block(
      headerLines(summary, specializations, context),
      linkLines(summary, media, context),
      notes.map((note) => `Note: ${note}`),
      warnings.map((warning) => `Note: ${warning}`),
    ),
    stats.length && block('Stats', stats),
    items.length && block('Equipment', items),
  ].filter(Boolean).join('\n\n');
}

function realmLine(realm) {
  const details = [realm.type, realm.category, realm.timezone].filter(Boolean).join(', ');
  return `- ${realm.name} (${realm.slug})${details ? `: ${details}` : ''}`;
}

function clusterBlock(cluster) {
  const state = [cluster.status, cluster.population && `population ${cluster.population}`, cluster.hasQueue && 'login queue'].filter(Boolean);
  return block(`Connected realm ${cluster.id}${state.length ? `: ${state.join(', ')}` : ''}`, cluster.realms.map(realmLine));
}

export function formatClusters(clusters, { region, flavor, query }) {
  if (!clusters.length) return `No ${region} ${flavor} realm is named like "${query}". Check the spelling, the region and the flavor.`;
  const more = clusters.length > REALM_LIMIT ? `\n\n${clusters.length - REALM_LIMIT} more connected realms match. Narrow the query.` : '';
  const heading = `${clusters.length} ${region} ${flavor} connected realm${clusters.length === 1 ? '' : 's'} with a realm named like "${query}". `
    + 'Pass the realm name or slug to the character tool.';
  return `${heading}\n\n${clusters.slice(0, REALM_LIMIT).map(clusterBlock).join('\n\n')}${more}`;
}
