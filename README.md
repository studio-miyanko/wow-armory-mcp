# WoW Armory MCP

Lets AI agents look up World of Warcraft characters through Blizzard's official Profile API: level, spec, guild, item level, stats and gear, with a link to the official armory page and a portrait, for Retail and the Classic flavors. It is a read-only MCP server that runs on your own computer with your own free Blizzard API client.

Unofficial and not affiliated with Blizzard Entertainment.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `character` | `region`, `realm`, `name`, `flavor` | Level, race, class, spec, faction, guild, realm, last login and item level, plus the armory link and a portrait image URL. Health, power, primary and secondary stats with ratings and percentages. Every equipped item with item level, quality and enchant |
| `realm` | `region`, `flavor`, `query` | Connected realms with a realm named like the query, listing every member realm with slug, type, language and timezone, plus status and population |

- `region` is `us`, `eu`, `kr` or `tw`.
- `realm` takes a name or slug, like `Argent Dawn` or `argent-dawn`.
- `flavor` defaults to `retail`.
- When a character is not on the named realm, `character` tries the other realms of its connected realm and says where it found it.

## Flavors

| Flavor | Game | Profile namespace | Realm namespace |
|---|---|---|---|
| `retail` | Retail | `profile-{region}` | `dynamic-{region}` |
| `classic` | Classic progression, currently Mists of Pandaria Classic | `profile-classic-{region}` | `dynamic-classic-{region}` |
| `era` | Classic Era, including Hardcore | `profile-classic1x-{region}` | `dynamic-classic1x-{region}` |
| `anniversary` | Anniversary realms | `profile-classicann-{region}` | `dynamic-classicann-{region}` |

WoW Forever gets a `forever` flavor once Blizzard publishes its namespace. Until then the API has no WoW Forever characters.

## Set up credentials

The server uses your own Blizzard API client, so your lookups never share anyone's quota:

1. Sign in at https://develop.battle.net/access/clients and create a client. It is free.
2. Copy its client id and client secret.
3. Set them as `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` in the server's environment, or on macOS store them in the keychain. Each command asks for the value, so it stays out of the shell history:

```sh
security add-generic-password -s blizzard-api -a client-id -w
security add-generic-password -s blizzard-api -a client-secret -w
```

Environment variables win over the keychain. Without credentials the server still starts, and both tools answer with these steps.

## Install

Requires Node 22 or later and git.

### Claude Code

```sh
claude mcp add --scope user wow-armory -- npx -y github:studio-miyanko/wow-armory-mcp#semver:^1
```

Without the keychain, pass the credentials when adding the server. Claude Code then stores them in its config file in plain text:

```sh
claude mcp add --scope user --env BLIZZARD_CLIENT_ID=<id> --env BLIZZARD_CLIENT_SECRET=<secret> wow-armory -- npx -y github:studio-miyanko/wow-armory-mcp#semver:^1
```

### Claude desktop app

In Settings, Developer, Edit Config, add the server and restart the app. Leave out `env` when the credentials are in the macOS keychain:

```json
{
  "mcpServers": {
    "wow-armory": {
      "command": "npx",
      "args": ["-y", "github:studio-miyanko/wow-armory-mcp#semver:^1"],
      "env": { "BLIZZARD_CLIENT_ID": "<id>", "BLIZZARD_CLIENT_SECRET": "<secret>" }
    }
  }
}
```

Then ask something like "stats and gear of my mage on Draenor EU".

### Other agents

Cursor, VS Code, Codex and other MCP clients run the same command as a stdio server: `npx -y github:studio-miyanko/wow-armory-mcp#semver:^1`, with `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` in its environment unless they are in the macOS keychain.

### Your own Worker

`src/worker.js` serves the same tools at `/mcp` on Cloudflare Workers. Callers from the internet get 30 requests a minute per IP. Your other Workers can call it through a service binding, which skips that limit.

This repo's Worker is private and only serves its owner's Discord bot. For a public copy of your own, change `name` and set `workers_dev` to `true` in `wrangler.jsonc`, then deploy with your client as Worker secrets:

```sh
npm install
npx wrangler secret put BLIZZARD_CLIENT_ID
npx wrangler secret put BLIZZARD_CLIENT_SECRET
npx wrangler deploy
```

A public copy also works in claude.ai and the Claude apps: Settings, Connectors, Add custom connector, then paste its URL. Everyone who uses it then shares your Blizzard client's quota of 36,000 requests an hour, and your Cloudflare account's free daily requests.

## How it behaves

- Fetches only `oauth.battle.net` and `{region}.api.blizzard.com`, and only reads.
- Reuses one access token until a minute before it expires.
- Loads the profile summary, statistics, equipment, specializations and portrait in parallel. When one section fails, the rest still comes back with a note.
- Builds the armory link from the realm and name Blizzard returns, so it opens the character's page in the viewer's language. Neither link nor portrait is fetched.
- Caches characters for 10 minutes and the realm list for 24 hours, and parallel identical calls share one request.
- Retries a timeout, a server error, a rate limit or an expired token once, then fails with a plain message.

## Limits

- Only public profiles exist. Blizzard answers 404 for a character that is not on that realm or whose profile is not public.
- Realm slugs mostly follow Blizzard's rule of lowercase with hyphens and no apostrophes. Exceptions, like `azjolnerub` for Azjol-Nerub, are resolved through the realm list after a miss.
- Blizzard's Developer API Terms of Use apply, which you accept when creating the client.

## Develop

```sh
npm install
npm test
```

The offline tests replace `fetch` with answers shaped like Blizzard's. The live test runs only when `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` are set. Try the tools by hand with `npx @modelcontextprotocol/inspector node src/index.js`.

World of Warcraft is a trademark of Blizzard Entertainment. This project is not affiliated with or endorsed by Blizzard.
