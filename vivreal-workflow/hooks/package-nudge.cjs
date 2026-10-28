// PostToolUse nudge: after a package.json change, remind to propagate shared
// @hillbombcreations/* package bumps across consumers and patch the lockfile
// surgically. It must never advise deleting the lockfile or `npm install`: on
// Windows that prunes Linux-only optional deps (package-nudge.test.cjs pins this).
// Debounced once per session. Never blocks: always exits 0.
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  const fp = ti.file_path || ti.path || '';
  if (!fp) process.exit(0);

  const norm = String(fp).replace(/\\/g, '/').toLowerCase();
  if (norm.includes('/node_modules/')) process.exit(0);
  if (!/\/package\.json$/.test(norm)) process.exit(0);

  // debounce: one nudge per session
  const sid = String(data.session_id || 'nosess').replace(/[^a-z0-9_-]/gi, '');
  const marker = path.join(os.tmpdir(), `vr-pkg-nudge-${sid}`);
  if (fs.existsSync(marker)) process.exit(0);
  try { fs.writeFileSync(marker, '1'); } catch (e) {}

  const msg = `You changed a package.json. If this is a shared @hillbombcreations/* bump (schemas, site-renderer, tier-quotas, tenant-db, email-brand), dispatch the \`package-publisher\` agent (or run \`/bump-package\`) to move the pin across ALL consumer repos. Patch the lockfile entry surgically (only that package's \`version\`, \`resolved\` and \`integrity\`, taken from \`npm view <pkg>@<version> dist.tarball\` and \`dist.integrity\`), then verify with \`npm ci\` (or \`npx -y npm@10 ci --dry-run\`). Never delete \`package-lock.json\` and never run \`npm install\` on Windows: it prunes Linux-only optional dependencies and has broken this fleet's lockfiles before.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
} catch (e) { /* fail open */ }
process.exit(0);
