// PostToolUse nudge: after a Vivreal_Templates or Vivreal_Portal_Mobile change,
// remind to track the resulting customer-site deploy. Debounced once per session.
// Never blocks: always exits 0, emits nothing unless it matches.
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  const fp = ti.file_path || ti.path || '';
  if (!fp) process.exit(0);

  const norm = String(fp).replace(/\\/g, '/').toLowerCase();
  if (norm.includes('/node_modules/') || norm.includes('/.next/') || norm.includes('/.git/')) process.exit(0);

  const isTemplates = norm.includes('vivreal_templates');
  const isPortal = norm.includes('vivreal_portal_mobile');
  if (!isTemplates && !isPortal) process.exit(0);

  // debounce: one nudge per session
  const sid = String(data.session_id || 'nosess').replace(/[^a-z0-9_-]/gi, '');
  const marker = path.join(os.tmpdir(), `vr-deploy-nudge-${sid}`);
  if (fs.existsSync(marker)) process.exit(0);
  try { fs.writeFileSync(marker, '1'); } catch (e) {}

  const which = isTemplates ? 'Vivreal_Templates' : 'Vivreal_Portal_Mobile';
  const msg = isTemplates
    ? `You changed Vivreal_Templates. Merging \`main\` alone releases NOTHING to customer sites — all sites build the shared \`stable\` branch. To release, run the promote-stable workflow (Actions → promote-stable → Run workflow), which fast-forwards main→stable and rebuilds every site's Amplify app. Use the \`vivreal-deploy-tracker\` skill or \`/deploy-status <site>\` to confirm builds reached "live".`
    : `You changed Vivreal_Portal_Mobile. The portal deploys on merge to main (Amplify). If your change affects site deploys, use the \`vivreal-deploy-tracker\` skill or \`/deploy-status <site>\` to confirm a deploy reached "live" and isn't stuck in a Step Functions/Amplify state.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
} catch (e) { /* fail open — never disrupt the edit */ }
process.exit(0);
