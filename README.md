# Vivreal Skills

Claude Code agents, workflows, skills, and tooling for [Vivreal](https://vivreal.io) — a multi-tenant CMS + distribution platform — packaged as a **portable plugin marketplace** so they're available from **any repository on your machine**, and authored so Claude **dispatches them proactively** without you naming them.

This repo is a Claude Code [plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins). It contains **thirteen plugins**.

## Plugins

| Plugin | What it is | Use everywhere? |
|---|---|---|
| **`vivreal-principal`** | 7 repo-agnostic principal-level agents: `principal-coordinator`, `principal-coder`, `principal-architect`, `principal-researcher`, `principal-reviewer`, `principal-designer`, `principal-growth-auditor`. | ✅ Yes — generalist. Safe and useful in any repo. |
| **`vivreal-workflow`** | The Vivreal bug/feature workflow: `coordinator` + `researcher`/`architect`/`coder`/`tester`/`reviewer`/`documenter`/`vuln` role agents, their slash commands (`/orchestrate`, `/coordinator`, `/research`, `/design`, `/implement`, `/test`, `/reviewer`, `/vuln-fix`, …), and the `shared-standards` skill. | ✅ The repo-agnostic workflow generalists (coordinator/researcher/coder/reviewer/tester) work anywhere; the docs/bugs flow is most useful in Vivreal repos. |
| **`vivreal-experts`** | 7 read-only system-expert consultants for the Vivreal ecosystem: `portal`, `cms-api`, `secure-api`, `main-api`, `client-stack`, `event-handler`, `outreach-api`. | ⚠️ Enable when you work across the Vivreal backend/portal repos. |
| **`vivreal-knowledge`** | Auto-invoked **knowledge skills**: `vivreal-db` (safe multi-tenant Mongo query rules), `sentry-tracer` (cross-stack tracing), `vivreal-sites` (the site product/data/authoring model), `vivreal-design-system` (the portal UI/UX system — real component patterns + tokens + WCAG 2.2 + UX-psychology references), `vivreal-unit-economics` (the cost/margin/pricing model), `vivreal-brand-voice` (the Vivreal voice + marketing best-practices), and a per-repo digest for each Vivreal repo (portal, CMS/Secure/Main APIs, the public Client stack [`vivreal-client-stack-knowledge`], EventHandler, Templates, site-renderer, MCP server, and the Outreach API [`vivreal-outreach-api-knowledge`]). | ✅ Skills load passively from your intent and are cheap when idle. Enable everywhere you touch Vivreal code or data. |
| **`vivreal-infra`** | Auto-invoked **cross-cutting infrastructure skills** that span repos: `vivreal-lambda` (deploy + scaling, with references), `vivreal-auth-architecture`, `vivreal-site-deploy-pipeline`, `vivreal-iam-secrets`, `vivreal-atlas-topology`, `vivreal-media-cdn`, `vivreal-websocket-realtime`. The AWS/Mongo/Amplify plumbing you touch regardless of which repo you're in. | ✅ Skills load passively from your intent and are cheap when idle. Enable everywhere you do AWS/deploy/scaling/ops work. |
| **`vivreal-sentry`** | **Active** Sentry investigation tooling: the `sentry` agent (wired to the Sentry MCP) + the `/sentry-trace` command. Reconstructs the cross-stack timeline (browser → edge proxy → backend Lambda → MongoDB → WebSocket) for "what happened when I did X", error deep-dives, deploy validation, and tenant-scoped triage. The active companion to the passive `sentry-tracer` knowledge skill. | ✅ Enable anywhere you investigate Vivreal errors/deploys (requires the Sentry MCP connected). |
| **`vivreal-ops`** | The `vivreal-ops` agent — a **read-only** investigator of **running** infrastructure: live AWS Lambda config/concurrency, Step Functions execution history, API Gateway, IAM, Secrets Manager, and MongoDB Atlas state. Investigates the deployed reality and recommends; fixes route to `principal-coder`/`coder`. | ⚠️ Enable when you do live AWS/Atlas ops investigation (best with the AWS Lambda + AWS docs + mongodb MCPs connected). |
| **`vivreal-product`** | Three **read-only** product/business audit agents: `finance-auditor` (unit economics, gross margin, the AWS/Atlas/Anthropic cost stack, scale economics, the ~80% margin-floor guard), `marketing-auditor` (brand-voice + marketing best-practices critique of customer-facing copy), and `ux-critic` (dual-lens naive-user + UX-designer usability critique of portal/customer-site screens, with a Playwright walkthrough). All advisory — they evaluate and recommend; fixes route to `principal-coder`/`coder`, `content-creator`/`content-planner`, or `designer`/`principal-designer`. Grounded in the `vivreal-unit-economics`, `vivreal-brand-voice`, and `vivreal-design-system` skills. | ✅ Enable for product/business reviews (the `ux-critic` browser walkthrough needs the Playwright MCP). |
| **`vivreal-fullstack`** | The `fullstack-tracer` agent (static cross-repo request-path tracing), the `fullstack-context` auto-loader skill, and the `/fullstack` end-to-end feature-scaffold command. | ⚠️ Most useful with the Vivreal repos as siblings under `C:\repos\`. |
| **`vivreal-proxy-factory`** | The `/proxy-route` generator for portal edge proxy routes, plus a PreToolUse hook that nudges you toward the `createProxyHandler()` factory and away from manual-route drift. | ⚠️ Portal-specific. Enable when working in `Vivreal_Portal_Mobile`. |
| **`vivreal-db-explorer`** | The `/db-query` and `/db-schema` commands — safe MongoDB querying + schema exploration with dbKey routing, archived/tenant guards, and credential redaction. | ⚠️ Enable when you query the Vivreal databases (pairs with the `vivreal-db` knowledge skill). |
| **`vivreal-growth-analytics`** | The `growth-advisor` agent + `growth-context` skill + `/growth-report` and `/funnel-analysis` commands, unifying GA4, PostHog, and MongoDB. | ⚠️ Enable for growth/funnel analysis. |
| **`vivreal-cms`** | Skill for operating a Vivreal account via the [Vivreal MCP server](https://github.com/HillBombCreations/VR-MCP-Server) — content, channels, sites, Stripe billing. | Enable wherever you use the Vivreal MCP server. |

### Recommended setup
- Enable **`vivreal-principal`**, **`vivreal-workflow`**, **`vivreal-knowledge`**, and **`vivreal-infra`** globally — these are the "works in any repo" generalist agents plus passively-loaded knowledge (per-repo + cross-cutting infrastructure + design-system / unit-economics / brand-voice).
- Enable **`vivreal-product`** for product/business reviews — the `finance-auditor` / `marketing-auditor` / `ux-critic` audit agents (the `ux-critic` browser walkthrough needs the Playwright MCP).
- Enable **`vivreal-experts`**, **`vivreal-fullstack`**, **`vivreal-proxy-factory`**, **`vivreal-db-explorer`**, and **`vivreal-growth-analytics`** if you regularly work in the Vivreal repos (portal + backends as sibling directories under `C:\repos\`).
- Enable **`vivreal-cms`** if you drive a Vivreal account through the Vivreal MCP server.

## Proactive dispatch & auto-invoked knowledge

**Agents** — each agent's `description` is written so Claude auto-selects it from your intent; you don't name the agent. "How should we structure this API and then build it?" → `principal-coordinator`; "review this before I ship" → `principal-reviewer`; "trace this feature end-to-end across repos" → `fullstack-tracer`; "what happened when I clicked publish?" → `sentry`; "why is this Lambda throttling / is Atlas saturated?" → `vivreal-ops`.

The four investigation-flavored agents are deliberately non-overlapping so they don't steal each other's dispatches: **`principal-architect`** designs (before code); **`principal-researcher`** investigates from source code (file:line); the **`sentry`** agent reads Sentry telemetry (error timelines); the **`vivreal-ops`** agent reads running AWS/Atlas state (live config, concurrency, executions, connection saturation). Each description names and disclaims the others.

The three **`vivreal-product`** audit agents are likewise disjoint from the existing roles. **`finance-auditor`** audits the COST side (margin, infra/AI cost, scale economics) — distinct from the **`growth`/`principal-growth-auditor`/`growth-advisor`** agents, which own the REVENUE side (funnel, conversion, churn, CAC). **`marketing-auditor`** CRITIQUES copy against the brand voice + best-practices — distinct from **`content-planner`/`content-creator`** (which PRODUCE content) and the growth auditor (positioning/funnel strategy). **`ux-critic`** CRITIQUES screen usability read-only — distinct from **`designer`/`principal-designer`** (which DESIGN and BUILD) and from growth (funnel metrics). Each description names and disclaims those it could collide with, and each routes fixes out (to a coder / content / design agent) rather than implementing.

**Knowledge skills** — the skills in `vivreal-knowledge` (per-repo) and `vivreal-infra` (cross-cutting) are **auto-invoked**: their `description` fields lead with sharp triggers, and the main loop loads a skill's body **only when your task matches** (and only that skill, not the whole plugin). Examples:

*Knowledge (`vivreal-knowledge`) — "how this codebase / product works":*
- "which database holds this group's data?" or "query the collection_objects" → `vivreal-db`
- "what happened when I clicked publish?" / "trace this Sentry error" → `sentry-tracer`
- "how do Vivreal sites work?" / "why isn't my content/section showing on the live site?" / "how do I add a page format?" → `vivreal-sites`
- "design / review this portal screen" / "what are the dashboard tile + token conventions?" / "WCAG/accessibility/UX-psychology check" → `vivreal-design-system`
- "what's our gross margin / cost per customer?" / "does this dent the margin floor at scale?" → `vivreal-unit-economics`
- "is this copy on-voice?" / "audit this landing-page / cold-email copy" → `vivreal-brand-voice`
- "I'm fixing a proxy route in the portal" → `vivreal-portal-knowledge`
- "how does media signing / the API-key authorizer work in the Client stack?" → `vivreal-client-stack-knowledge`
- "why didn't my outreach sequence send?" / "how does the outreach Gmail-history admin gate work?" → `vivreal-outreach-api-knowledge`
- "I'm editing a site template" → `vivreal-templates-knowledge`

*Cross-cutting (`vivreal-infra`) — "how the AWS/Mongo/Amplify plumbing works across repos":*
- "this deploy failed — package too large / template too large" / "can we handle N concurrent users?" / "deploy rejected: unreserved below 100" → `vivreal-lambda`
- "why am I getting a 401 'Invalid active context'?" / "how does the Client API authorize?" → `vivreal-auth-architecture`
- "why isn't my Templates change showing on the live site?" / "site stuck pending" → `vivreal-site-deploy-pipeline`
- "which IAM policy does this Lambda need?" / "what reads CTX_SECRET?" → `vivreal-iam-secrets`
- "SSL alert number 80 across the backends" / "M10 upgrade" → `vivreal-atlas-topology`
- "image 403 / gallery images not signed" → `vivreal-media-cdn`
- "the live deploy-progress update isn't arriving" → `vivreal-websocket-realtime`

Idle skills cost nothing — only the matched skill's body is pulled into context. Each skill is a lean digest that points back to the authoritative source (`CLAUDE.md` + memory). The two layers are deliberately non-overlapping: **`vivreal-knowledge` is per-repo internals; `vivreal-infra` is the plumbing that crosses repos** (and `vivreal-atlas-topology` is the ops/topology companion to `vivreal-db`'s query rules).

## Installation

> These steps change global machine state, so run them yourself.

1. **Add this repo as a marketplace** (one time):
   ```bash
   claude marketplace add HillBombCreations/vivreal-skills
   ```
   This registers the `github`-sourced marketplace, so it works on any machine without depending on a local checkout path.

2. **Install the plugins you want** (user scope = available in every repo):
   ```bash
   # The everywhere-useful generalists + knowledge
   claude plugin install vivreal-principal@vivreal-skills  --scope user
   claude plugin install vivreal-workflow@vivreal-skills   --scope user
   claude plugin install vivreal-knowledge@vivreal-skills  --scope user
   claude plugin install vivreal-infra@vivreal-skills      --scope user

   # Vivreal-ecosystem tooling (enable if you work in the Vivreal repos)
   claude plugin install vivreal-experts@vivreal-skills         --scope user
   claude plugin install vivreal-sentry@vivreal-skills          --scope user
   claude plugin install vivreal-ops@vivreal-skills             --scope user
   claude plugin install vivreal-product@vivreal-skills         --scope user
   claude plugin install vivreal-fullstack@vivreal-skills       --scope user
   claude plugin install vivreal-proxy-factory@vivreal-skills   --scope user
   claude plugin install vivreal-db-explorer@vivreal-skills     --scope user
   claude plugin install vivreal-growth-analytics@vivreal-skills --scope user

   # Vivreal MCP account operation
   claude plugin install vivreal-cms@vivreal-skills --scope user
   ```

3. **Verify**: open Claude Code in any repo and run `/agents` (the principal-* and role agents should appear), `/help` (the workflow + `/proxy-route` + `/db-query` + `/fullstack` + `/growth-report` commands should appear), and trigger a knowledge skill (e.g. ask "which Vivreal database holds a pro_plus group's data?" — `vivreal-db` should load).

After install, `~/.claude/settings.json` will contain entries like:
```json
{
  "enabledPlugins": {
    "vivreal-principal@vivreal-skills": true,
    "vivreal-workflow@vivreal-skills": true,
    "vivreal-knowledge@vivreal-skills": true,
    "vivreal-infra@vivreal-skills": true,
    "vivreal-experts@vivreal-skills": true,
    "vivreal-sentry@vivreal-skills": true,
    "vivreal-ops@vivreal-skills": true,
    "vivreal-product@vivreal-skills": true,
    "vivreal-fullstack@vivreal-skills": true,
    "vivreal-proxy-factory@vivreal-skills": true,
    "vivreal-db-explorer@vivreal-skills": true,
    "vivreal-growth-analytics@vivreal-skills": true,
    "vivreal-cms@vivreal-skills": true
  }
}
```

## Prerequisites & graceful degradation

- **MCP tools**: several agents/commands list MCP tools (`mcp__mongodb__*`, `mcp__plugin_sentry_*`, `mcp__plugin_context7_*`, `mcp__plugin_playwright_*`, `mcp__awslabs_aws-documentation-mcp-server__*`, `mcp__awslabs_lambda-tool-mcp-server__*`). If a given MCP isn't connected in the current repo, that tool is simply unavailable — the agent degrades, it doesn't error. In particular: the `vivreal-sentry` `sentry` agent needs the Sentry MCP connected to query telemetry; the `vivreal-ops` agent works best with the AWS Lambda Tool MCP, the AWS docs MCP, and the mongodb MCP connected, but falls back to the read-only `aws` CLI via Bash when the Lambda Tool MCP isn't present (its per-function tool set is allow-list-dependent per machine).
- **Sibling repos**: `vivreal-experts` agents resolve sibling repos via `${VIVREAL_REPOS}` (defaults to the parent of the current repo). `vivreal-fullstack` and the per-repo knowledge skills reference the Vivreal repos at `C:\repos\<repo>` — most useful when those repos are checked out there.
- **`shared-standards` skill**: lives in `vivreal-workflow`. `vivreal-principal` agents reference it optionally and degrade gracefully if `vivreal-workflow` isn't installed.
- **Knowledge skills are reference, not action**: they load passively to inform Claude; they don't run tools. Pair `vivreal-db` (knowledge) with `vivreal-db-explorer` (the `/db-query` command) for the full loop.
- **Vivreal MCP server**: `vivreal-cms` assumes the [Vivreal MCP server](https://github.com/HillBombCreations/VR-MCP-Server) is connected and you have a Vivreal account at [vivreal.io](https://vivreal.io).

## License

MIT — see [LICENSE](LICENSE).
