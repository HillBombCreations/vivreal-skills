// PreToolUse guard: proxy routes under src/app/api/proxy/**/route.ts must use
// the createProxyHandler() factory unless they're on the known-manual allowlist.
// Deterministic replacement for the old prompt-based hook, which mis-fired on
// non-proxy files (memory, scratchpad, .claude) whenever the model answered
// instead of staying silent. Never blocks anything outside the proxy tree.
const fs = require('fs');

// Known manual routes, path segment after src/app/api/proxy/, without the trailing
// /route.ts. Prefix entries end with '/'.
//
// RE-MEASURED 2026-09-24 against Vivreal_Portal_Mobile origin/main (80f46c2d): 223 proxy
// routes, 185 factory, 38 manual. Four manual routes were missing from this list and THREE
// OF THEM WERE BEING BLOCKED OUTRIGHT (outreach/studio-draft, outreach/studio-draft/[id],
// outreach/studio-funnel): all public no-active_ctx Studio routes that createProxyHandler
// cannot serve because it 401s without the cookies a logged-out visitor does not have. The
// fourth, ws/ticket, escaped only because it happens to import extractUpstreamError from the
// factory's module path and so trips the fail-open check below. That is luck, not coverage,
// so it is listed explicitly now.
//
// Do NOT re-derive this list from CLAUDE.md's proxy route table: that table is a "core
// snapshot, not exhaustive" by its own wording. Do NOT re-derive it with a bare grep for
// createProxyHandler either, which reads 190 factory routes instead of 185 because five
// manual routes name the factory in a doc comment explaining why they cannot use it. Strip
// comments first. The portal pins this exact classification in
// tests/unit/app/api/proxy/_helpers/manualRoutesForwardQuotaDetail.test.ts; run that spec
// rather than writing a new classifier.
const MANUAL = [
  'billing/upgrade',
  'calendar/bulk-update-publish-date',
  'calendar/events',
  'calendar/scheduled-objects',
  'calendar/update-publish-date',
  'claim/complete',
  'claim/verify',
  'collections/create',
  'collections/update',
  'get-media',
  'group/billing',
  'group/create',
  'group/join',
  'integrations/oauth/init',
  'integrations/tiktok-oembed',
  'marketing/sandbox-lead',
  'media/share-image', // streams raw tenant media bytes, factory always ends in apiSuccess()
  'outreach/book/', // [slug] + /create + /slots, public, no active_ctx
  'outreach/demo-link/[code]', // public studio-demo resolver, visitor is logged out, no active_ctx/token to verify, GET-only so no CSRF
  'outreach/studio-demo/visit',
  'outreach/studio-draft', // public no-tenant Studio save; visitor is logged out, so the factory's active_ctx/token check 401s. Upserts on (vid, kitId)
  'outreach/studio-draft/', // the [id] GET/PUT/DELETE sibling, same public exception class
  'outreach/studio-funnel', // public beacon, 204-on-every-path so a non-null body would throw; no session to CSRF against
  'sites/create',
  'sites/instantiateTemplate',
  'sites/update',
  'uploadFiles',
  'user/delete-account', // 409 body carries the blocker list the UI renders; the factory collapses any non-2xx into apiError(message, status) and drops the body, same reason user/update-email is manual
  'user/login',
  'user/refresh',
  'user/ssoLogin',
  'user/switch-profile',
  'user/update-default-profile',
  'user/update-email',
  'user/verify-password',
  'ws/ticket', // listed explicitly: it only passed before because it imports extractUpstreamError from the factory module path
];

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  const fp = String(ti.file_path || '');
  const norm = fp.replace(/\\/g, '/');

  const m = norm.match(/src\/app\/api\/proxy\/(.+)\/route\.ts$/);
  if (!m) process.exit(0); // not a proxy route, never interfere

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
  // Match the real factory import path, not the bare name, manual routes
  // (e.g. sites/instantiateTemplate, media/share-image) mention the factory in
  // prose comments explaining why they are NOT factory routes.
  if (content.includes('_helpers/createProxyHandler')) process.exit(0);

  process.stderr.write(
    '⚠️ This proxy route should use `createProxyHandler()` factory. Manual proxy routes outside the known exceptions cause maintenance drift. Use `/proxy-route` to generate a factory-based route, or add the route to the allowlist in vivreal-proxy-factory/hooks/proxy-route-guard.cjs if it genuinely cannot use the factory.'
  );
  process.exit(2); // block with feedback
} catch (e) {
  process.exit(0); // fail open, never disrupt unrelated edits
}
