// PostToolUse nudge: after a package.json change, remind to propagate shared
// @hillbombcreations/* package bumps across consumers + do a clean reinstall.
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

  const msg = `You changed a package.json. If this touches a shared @hillbombcreations/* package (schemas, site-renderer, tier-quotas), use the \`vivreal-package-update\` skill or \`/bump-package <pkg> <version>\` to propagate it across ALL consumer repos and avoid version skew. Either way, do a CLEAN reinstall so the private package re-resolves: delete \`node_modules\` + \`package-lock.json\`, then \`npm install\` (auth comes from the repo's \`.npmrc\` GitHub Packages token).`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
} catch (e) { /* fail open */ }
process.exit(0);
