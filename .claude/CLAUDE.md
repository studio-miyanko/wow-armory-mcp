# wow-armory-mcp

## Rules

- A read-only MCP server for Blizzard's official World of Warcraft Profile API with two tools, `character` and `realm`. Extend `character` with a section before adding a third tool.
- Fetch only `oauth.battle.net` and `{region}.api.blizzard.com`. The region is a fixed enum and path segments are encoded, so no input can change the host.
- Credentials come from `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`, else on macOS from the keychain service `blizzard-api` with the accounts `client-id` and `client-secret`, read through `execFile` without a shell. Never log or return a secret or token, and never put one in a URL or error message. The token goes in the `Authorization` header.
- Without credentials the server still starts and lists its tools, and the tools answer with `SETUP` from `src/auth.js`.
- Namespaces per flavor live in `FLAVORS` in `src/blizzard.js`, taken from FuzzyStatic/blizzard `blizzard.go`. Response shapes follow the strict zod schemas in Pewtro/blizzard-api `generated/schemas`, which its integration tests validate against the live API. The developer portal docs are a JavaScript app that WebFetch cannot read, so read those repos with `gh api`.
- WoW Forever gets a `forever` flavor once Blizzard publishes its namespace, with `realm` as the ruleset and `name` as the two-part name. Never guess the namespace before that.
- Tool output stays plain text and leaves out nulls, empty values and zero stats.
- MCP users run `github:studio-miyanko/wow-armory-mcp#semver:^1`, which follows the newest 1.x tag. A breaking tool change needs a major version and the README updated to the new range.

## Checks

- `npm test` after every change to `src/`. The offline tests mock `fetch` with the shapes in `test/fixtures.js`. `test/live.test.js` runs only when `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` are set.
- When Blizzard changes a response, update the fixture to the new shape first, then the parser.
- Try the tools by hand with `npx @modelcontextprotocol/inspector node src/index.js`.

## Release

1. Bump `version` in `package.json` and `package-lock.json` to the same value.
2. Run `npm test` with credentials set, so the live test runs too.
3. Push to `main`.
4. Tag `vX.Y.Z` and create a GitHub release. `#semver:^1` resolves tags, so untagged commits never reach users.
