import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import pkg from '../package.json' with { type: 'json' };
import { FLAVORS, REGIONS, findCharacter, searchRealms } from './blizzard.js';
import { formatCharacter, formatClusters } from './format.js';

const hints = { readOnlyHint: true, openWorldHint: true };

function text(value) {
  return { content: [{ type: 'text', text: value }] };
}

const region = z.enum(REGIONS).describe('Battle.net region: us (Americas and Oceania), eu, kr or tw');

const flavor = z.enum(Object.keys(FLAVORS)).default('retail')
  .describe('Game version: retail, classic (Mists of Pandaria Classic), era (Classic Era and Hardcore) or anniversary');

// Letters, digits, spaces, apostrophes, hyphens and parentheses cover every realm name, and keep paths and dots out of the URL.
const realm = z.string().trim().min(2).max(40).regex(/^[\p{L}\p{M}\p{N}\s'’()-]+$/u);

// Other hosts, such as a Cloudflare Worker, can connect the same tools without stdio.
export function createServer() {
  const server = new McpServer({ name: 'wow-armory-mcp', version: pkg.version });

  server.registerTool('character', {
    title: 'WoW character',
    description: 'Look up a World of Warcraft character on Blizzard\'s official armory: level, race, class, spec, faction, guild, '
      + 'last login, item level, health, power, primary and secondary stats with ratings and percentages, and every equipped item '
      + 'with item level, quality and enchant. Works for Retail and the Classic flavors. Any realm of a connected realm finds the character. '
      + 'Only public profiles exist. WoW Forever is not supported yet.',
    inputSchema: z.object({
      region,
      realm: realm.describe('Realm name or slug, like Draenor, Argent Dawn or argent-dawn'),
      name: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{M}]+$/u).describe('Character name'),
      flavor,
    }),
    annotations: hints,
  }, async (input) => text(formatCharacter(await findCharacter(input), input)));

  server.registerTool('realm', {
    title: 'WoW realms',
    description: 'Find World of Warcraft realms by name or part of it, to get the exact realm before a character lookup. '
      + 'Returns the matching connected realms with all member realms, their slug, type, language and timezone, status and population.',
    inputSchema: z.object({
      region,
      flavor,
      query: realm.describe('Realm name or part of it, like Silvermoon or moon'),
    }),
    annotations: hints,
  }, async (input) => text(formatClusters(await searchRealms(input), input)));

  return server;
}
