# Changelog

## 1.2.0 (2026-10-16)

- `character` adds a link to the character's official armory page and a portrait image URL. The link opens in the viewer's language, and both come from what Blizzard's API returned.
- The hosted endpoint is closed, so nobody shares one Blizzard client or free quota. Run the server from GitHub with your own free Blizzard client, or deploy a Worker of your own.
- Calls from your own Workers through a service binding skip the per-IP limit.

## 1.1.0 (2026-10-11)

- Hosted endpoint at `https://wow-armory-mcp.marco-vrinssen.workers.dev/mcp`, so agents and bots connect over Streamable HTTP without a Blizzard client of their own. 30 requests a minute per IP.
- `src/worker.js` serves the same tools on Cloudflare Workers, for anyone who wants their own copy.

## 1.0.0 (2026-10-11)

- First release. `character` reads a character's profile, stats, gear and spec from Blizzard's official Profile API, and finds it on any realm of its connected realm. `realm` finds realms and their clusters.
- Retail, Classic progression, Classic Era and Anniversary. WoW Forever follows once Blizzard publishes its namespace.
- Credentials come from `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`, or on macOS from the keychain.
