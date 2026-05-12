# Vivreal Skills

Claude skills for working with [Vivreal](https://vivreal.io) — a multi-tenant CMS + distribution platform — via the [Vivreal MCP server](https://github.com/HillBombCreations/VR-MCP-Server).

## Skills

### `vivreal-cms`

Comprehensive skill for managing content, channels, sites, and Stripe billing through the Vivreal MCP server. Teaches Claude:

- The Group → Content Type → Content Item → Channel → Site mental model
- The canonical workflow rule (always `set-active-group` first)
- Field type cheat sheet for schema-valid `objectValue` construction
- Tier-gated tools and how to surface upgrade paths
- The signed-URL media pipeline (never construct CDN URLs directly)
- Common gotchas (`dbKey` vs `group.key`, async channel posts, site deployment polling)

See [`vivreal-cms/SKILL.md`](vivreal-cms/SKILL.md).

## Prerequisites

These skills assume the [Vivreal MCP server](https://github.com/HillBombCreations/VR-MCP-Server) is connected and the user has a Vivreal account at [vivreal.io](https://vivreal.io). Most tools require OAuth-authenticated access to a Vivreal group.

## Installation

Skills are installed by their consuming client (Claude Code, Claude.ai, etc.). For Claude Code, copy the skill directory into your `~/.claude/skills/` folder or reference it from your plugin config.

## License

MIT — see [LICENSE](LICENSE).
