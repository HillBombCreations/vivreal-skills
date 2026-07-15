// PreToolUse guard: proxy routes under src/app/api/proxy/**/route.ts must use
// the createProxyHandler() factory unless they're on the known-manual allowlist.
// Deterministic replacement for the old prompt-based hook, which mis-fired on
// non-proxy files (memory, scratchpad, .claude) whenever the model answered
// instead of staying silent. Never blocks anything outside the proxy tree.
const fs = require('fs');

// Known manual routes (28 as of 2026-07-13) — path segment after src/app/api/proxy/,
// without the trailing /route.ts. Prefix entries end with '/'.
const MANUAL = [
  'billing/upgrade',
  'calendar/bulk-update-publish-date',
  'calendar/events',
  'calendar/scheduled-objects',
  'calendar/update-publish-date',
  'collections/create',
  'collections/update',
  'get-media',
  'group/billing',
  'group/create',
  'group/join',
  'integrations/oauth/init',
  'integrations/tiktok-oembed',
  'marketing/sandbox-lead',
  'outreach/book/', // [slug] + /create + /slots — public, no active_ctx
  'outreach/studio-demo/visit',
  'sites/create',
  'sites/update',
  'uploadFiles',
  'user/login',
  'user/refresh',
  'user/ssoLogin',
  'user/switch-profile',
  'user/update-default-profile',
  'user/update-email',
  'user/verify-password',
];

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  const fp = String(ti.file_path || '');
  const norm = fp.replace(/\\/g, '/');

  const m = norm.match(/src\/app\/api\/proxy\/(.+)\/route\.ts$/);
  if (!m) process.exit(0); // not a proxy route — never interfere

  const route = m[1];
  const allowed = MANUAL.some((entry) =>
    entry.endsWith('/') ? route.startsWith(entry) : route === entry
  );
  if (allowed) process.exit(0);

  // Gather the content this call would leave behind (best-effort).
  let content = '';
  if (typeof ti.content === 'string') content = ti.content; // Write
  else {
    try { content = fs.readFileSync(fp, 'utf8'); } catch (e) {}
    if (typeof ti.new_string === 'string') content += '\n' + ti.new_string; // Edit
  }
  if (content.includes('createProxyHandler')) process.exit(0);

  process.stderr.write(
    '⚠️ This proxy route should use `createProxyHandler()` factory. Manual proxy routes outside the known exceptions cause maintenance drift. Use `/proxy-route` to generate a factory-based route, or add the route to the allowlist in vivreal-proxy-factory/hooks/proxy-route-guard.cjs if it genuinely cannot use the factory.'
  );
  process.exit(2); // block with feedback
} catch (e) {
  process.exit(0); // fail open — never disrupt unrelated edits
}
