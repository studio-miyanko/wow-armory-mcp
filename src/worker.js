import { createMcpHandler } from '@modelcontextprotocol/server';

import { createServer } from './server.js';

const handler = createMcpHandler(() => createServer());

const INFO = 'wow-armory-mcp: connect an MCP client to /mcp. Setup and source: https://github.com/studio-miyanko/wow-armory-mcp';

// Browser-based MCP clients, like the MCP Inspector, need CORS to reach the endpoint.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// The hosted endpoint lets agents and bots connect without a Blizzard client of their own. Credentials come from
// Worker secrets through process.env, which nodejs_compat fills.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname !== '/mcp') return new Response(INFO, { status: pathname === '/' ? 200 : 404 });

    // Internet callers share the account's free Worker requests and the Blizzard client, so each IP gets a fair share.
    // Calls through a service binding come from the owner's own Workers and carry no client IP, so they skip the limit.
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return withCors(new Response('Too many requests. Try again in a minute.', { status: 429, headers: { 'retry-after': '60' } }));
    }
    return withCors(await handler.fetch(request));
  },
};
