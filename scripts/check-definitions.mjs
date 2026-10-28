#!/usr/bin/env node
/**
 * check-definitions.mjs
 *
 * The assertion half of this repo. Skills carry reasoning; this file carries the
 * facts a test can pin, so nothing has to be written down twice.
 *
 * It fails on:
 *   1. A definition file that does not parse or load (JSON, or YAML frontmatter).
 *   2. The two YAML shapes that do not announce themselves:
 *        - a plain scalar containing ": ", which makes the frontmatter unparseable.
 *          The file STILL LOADS, with its name taken from the filename and every
 *          other field silently dropped, `tools` included. An agent deliberately
 *          built without Write comes back with the default tool set.
 *        - a quoted scalar with an unescaped quote inside it (an apostrophe in a
 *          single-quoted description), which `claude plugin validate` rejects and which
 *          loads the skill with EMPTY metadata.
 *        - a plain scalar containing " #", which starts a YAML comment and discards
 *          the rest of the value. Nothing reports this at all. One skill here was
 *          losing 277 characters that way, including its entire "Triggers on:" list,
 *          which is the whole of how a skill gets chosen.
 *   3. A marketplace manifest that disagrees with the directories on disk, or with
 *      the README table.
 *   4. An agent whose description disagrees with its tool list. Eleven agents here
 *      hold no Write and no Edit tool; six of them were once dispatched to author
 *      documents, which is a wasted dispatch every time. The description is how a
 *      dispatcher chooses, so the description has to say so.
 *   5. A copied mechanical value in a plugin tree: a package version, a Lambda
 *      count, a proxy-route count, a tool count, an Amplify job number. A number a
 *      command could have produced is wrong in two places at once the moment it
 *      moves, and it reads exactly the same whether it is current or two months
 *      stale. It is a defect even when it is correct today.
 *   6. A cross-reference to a skill that does not exist.
 *   7. An em dash, an en dash or any of their relatives, anywhere.
 *   8. A reference to behaviour that has been deleted from the product.
 *   9. An AWS account id, anywhere. This repository is PUBLIC, and an account id
 *      buys a reader nothing that a profile name and a region do not.
 *  11. A literal machine path (a drive-letter clone root, a user home) outside docs/. Paths
 *      go through ${VIVREAL_REPOS}.
 *  12. A plugin changed since the merge base whose plugin.json version did not go up. An
 *      unbumped plugin does not reinstall. Needs git and a base ref; without them it warns.
 *  13. A route in `<plugin>/routing/routes.json` whose agent has no agent file.
 *  10. A generated mirror inside a plugin tree: a command mirror (`skills/cmd-*`) or an agent
 *      mirror (`skills/<name>/` beside `agents/<name>.md`). Both are generated into the
 *      gitignored `.agy/`; in a plugin they list every command or agent a second time.
 *
 * Rule 6 accepts an agent as a reference target (a dispatch names one), but fails a line
 * that LOADS an agent as a skill, since an agent has no skill entry to load.
 *
 * It warns (without failing) on a description over the documented length and an
 * `mcp__<server>__` prefix no known server declares.
 *
 * Run:  node scripts/check-definitions.mjs
 * Self-test (the must-pass control):  node scripts/check-definitions.mjs --self-test
 *
 * This is NOT a substitute for `claude plugin validate`, which checks things this
 * cannot. Run both. The platform validator is what caught the colon shape here, and
 * this script is what caught the hash shape, which the platform validator does not
 * look for in a skill.
 *
 * The self-test matters. A checker that cannot fail reports a clean run on a broken
 * repo, and this whole file exists because that has happened here. --self-test writes
 * one deliberately bad fixture per check into the repo, runs the REAL rule set over
 * the REAL walk, and fails if any check stays green on its own poison. It then
 * requires the repo to come back clean once the poison is removed, because a rule set
 * that is red no matter what is as useless as one that is green no matter what.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const norm = (p) => p.split(sep).join('/');

// Dash codepoints, built from their numbers rather than pasted, so this file can be
// edited through any tool chain without the literals being mangled on the way in.
const DASHES = [0x2014, 0x2013, 0x2012, 0x2015, 0x2010, 0x2011, 0x2212].map((c) =>
  String.fromCharCode(c),
);

const failures = [];
const warnings = [];
const fail = (rule, where, msg) => failures.push({ rule, where, msg });
/**
 * A warning is something true and worth fixing that is NOT a load failure, and that
 * cannot be fixed without changing what an agent does. It is reported every run and
 * does not set the exit status, so the gate stays honest about the difference.
 */
const warn = (rule, where, msg) => warnings.push({ rule, where, msg });

/** Files under a directory, skipping .git and node_modules. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The directories that are plugin trees, i.e. everything an agent session loads. */
const PLUGIN_DIRS = readdirSync(ROOT).filter(
  (n) => n.startsWith('vivreal-') && statSync(join(ROOT, n)).isDirectory(),
);

function isPluginFile(rel) {
  return PLUGIN_DIRS.some((d) => rel.startsWith(d + '/'));
}

/**
 * Minimal frontmatter split. Deliberately not a YAML library: the only thing that
 * must be true is that the block is delimited and that the keys we depend on parse.
 * A real YAML parse happens implicitly when Claude Code loads the file; what this
 * catches is the shape that never gets that far.
 */
function frontmatter(text, rel) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) {
    fail('parse', rel, 'frontmatter opens with --- and never closes');
    return null;
  }
  const fm = text.slice(3, end);
  const keys = {};
  let currentKey = null;
  // Strip CR before matching. Without this, every anchored match fails on a CRLF
  // file and the checker reports "no name" for every definition in the repo, which
  // is a false RED that looks exactly like a real one.
  for (const raw of fm.split('\n').map((l) => l.replace(/\r$/, ''))) {
    const m = raw.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (m) {
      currentKey = m[1];
      keys[currentKey] = m[2];
    } else if (currentKey && raw.startsWith('  ')) {
      keys[currentKey] += '\n' + raw.trim();
    }
  }
  return keys;
}

// ---------------------------------------------------------------- rule 1: parse
function ruleParse(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (rel.endsWith('.json')) {
      try {
        JSON.parse(readFileSync(abs, 'utf8'));
      } catch (err) {
        fail('parse', rel, 'JSON does not parse: ' + err.message);
      }
      continue;
    }
    if (!rel.endsWith('.md')) continue;
    const isAgent = /^[^/]+\/agents\/[^/]+\.md$/.test(rel);
    const isSkill = /^[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(rel);
    const isCmd = /^[^/]+\/commands\/[^/]+\.md$/.test(rel);
    if (!isAgent && !isSkill && !isCmd) continue;
    const keys = frontmatter(readFileSync(abs, 'utf8'), rel);
    if (!keys) {
      fail('parse', rel, 'definition file has no frontmatter block');
      continue;
    }
    // What is actually required. An agent is identified by its `name`, so a missing
    // one is a load problem. For a skill every field is optional and identity falls
    // back to the directory, so a missing `name` is not a defect and several skills
    // here deliberately carry a name that differs from their directory. What
    // breaks discovery in every case is an empty or absent description, because the
    // description is the whole of how the main loop decides to load the thing.
    if (isAgent && !keys.name) fail('parse', rel, 'agent frontmatter has no name, which is how it is identified');
    if (!keys.description || !keys.description.trim()) {
      fail('parse', rel, 'frontmatter has no description. Nothing will ever choose to load this file.');
    }
    // Length is a WARNING, not a failure. The documented skill limit is 1,024
    // characters and the combined description plus when_to_use text is truncated at
    // 1,536 in the skill listing, so anything past that is silently dropped from the
    // listing, and the dropped part is the tail. The tail is where every one of these
    // files put its "distinct from X" disambiguation, which is the sentence that
    // stops two agents stealing each other's dispatches. It does not stop the file
    // loading, and shortening a description changes which tasks the agent is chosen
    // for, so this is reported rather than fixed.
    const dlen = keys.description ? keys.description.trim().length : 0;
    if (dlen > 1024 && !keys.description.startsWith('|')) {
      warn(
        'description-length',
        rel,
        `description is ${dlen} characters. The documented limit is 1024 and the listing truncates at 1536, ` +
          (dlen > 1536
            ? 'so the last ' + (dlen - 1536) + ' characters never reach the model. Move the disambiguation to the front rather than deleting it.'
            : 'so it fits the listing but exceeds the documented limit.'),
      );
    }
    if (keys.name && !/^[a-z0-9-]{1,64}$/.test(keys.name.trim().replace(/^["']|["']$/g, ''))) {
      fail('parse', rel, `name "${keys.name.trim()}" is not lowercase kebab-case within 64 characters`);
    }
    // A PLAIN (unquoted) YAML scalar cannot contain a colon followed by a space: the
    // colon terminates the key. This is the single nastiest failure shape in this
    // repo, because it does NOT stop the file loading. `claude plugin validate` says
    // it exactly: "At runtime this agent loads with its name taken from the filename
    // and every other frontmatter field silently dropped." Every other field includes
    // `tools`, so an agent deliberately built WITHOUT Write comes back with the
    // default tool set, and its description is gone so nothing dispatches it on
    // purpose either. A whole marketplace can be broken this way and still start.
    for (const [k, raw] of Object.entries(keys)) {
      if (raw === undefined || raw === null) continue;
      const v = String(raw);
      const first = v.trimStart()[0];
      const quoted = first === '"' || first === "'";
      const block = first === '|' || first === '>';
      // A QUOTED scalar fails the other way: a quote character inside it closes the
      // scalar early, the rest is a YAML parse error, and the skill loads with EMPTY
      // metadata (`claude plugin validate` reports it; this script did not until an
      // apostrophe in "surface's" inside a single-quoted description shipped in a PR).
      // Single-quoted: `''` is the only escape, so strip it and any `'` left before the
      // closing quote is a defect. Double-quoted: strip `\\` first, then `\"`, and any
      // `"` left is a defect. Either way the value must END on its closing quote.
      if (quoted) {
        const t = v.trim();
        const inner = t.length >= 2 && t.endsWith(first) ? t.slice(1, -1) : null;
        const rest =
          inner === null
            ? null
            : first === "'"
              ? inner.replace(/''/g, '')
              : inner.replace(/\\\\/g, '').replace(/\\"/g, '');
        if (rest === null || rest.includes(first)) {
          fail(
            'parse',
            rel,
            `frontmatter key "${k}" is a ${first === "'" ? 'single' : 'double'}-quoted YAML scalar with an ` +
              `unescaped ${first} inside it (or no closing quote), so the YAML does not parse and the file loads ` +
              `with empty metadata. Escape it (${first === "'" ? "write '' for an apostrophe" : 'write \\" for a quote'}) ` +
              'or reword.',
          );
        }
        continue;
      }
      if (block || v.trim() === '') continue;
      if (/:\s/.test(v)) {
        fail(
          'parse',
          rel,
          `frontmatter key "${k}" is a plain YAML scalar containing a colon followed by a space, ` +
            'so the YAML does not parse. The file still LOADS, with every field except the name ' +
            'silently dropped, including `tools`. Use a comma, or quote the whole value.',
        );
      }
      // The quieter sibling, and the worse one, because nothing complains at all:
      // a space followed by `#` starts a comment inside a plain scalar, so the rest
      // of the value is discarded. The file parses, `claude plugin validate` passes,
      // the skill loads, and the description the model receives is a fragment. One
      // skill in this repo was losing 277 characters that way, including the entire
      // "Triggers on:" list, which is the whole of how a skill gets chosen.
      if (/\s#/.test(v)) {
        fail(
          'parse',
          rel,
          `frontmatter key "${k}" is a plain YAML scalar containing a space followed by "#", which ` +
            'starts a YAML comment. Everything after it is silently discarded and nothing reports it. ' +
            'Quote the whole value.',
        );
      }
    }
  }
}

/**
 * Every `plugin:skill` reference in the repo must resolve to a skill that exists,
 * by its declared name where it has one and by its directory where it does not.
 * A reference that resolves to nothing is an instruction to invoke something that
 * is not there, and it fails silently at the point of use.
 */
function ruleCrossReferences(files) {
  const known = new Set();
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    // A command is listed and invoked as a skill too (`plugin:db-query` for
    // `<plugin>/commands/db-query.md`), so it is a valid target in its own right. Before
    // the cmd-* mirrors moved out of the plugin trees, these references resolved only
    // through a mirror's `name:` line.
    const m =
      rel.match(/^([^/]+)\/skills\/([^/]+)\/SKILL\.md$/) || rel.match(/^([^/]+)\/commands\/([^/]+)\.md$/);
    if (!m) continue;
    known.add(`${m[1]}:${m[2]}`);
    const keys = frontmatter(readFileSync(abs, 'utf8'), rel);
    if (keys && keys.name) known.add(`${m[1]}:${keys.name.trim()}`);
  }
  // An agent is a valid target for a DISPATCH (`subagent_type: plugin:agent`), so a reference
  // that names one passes. Until the agent mirrors left the plugin trees every agent also
  // resolved as a skill, so "load `plugin:agent`" worked; now it loads nothing, and these
  // shapes are what fail it. The previous line is joined in, because the verb and the name
  // are often split across a wrap.
  const agents = new Set();
  for (const abs of files) {
    const m = norm(relative(ROOT, abs)).match(/^([^/]+)\/agents\/([^/]+)\.md$/);
    if (m) agents.add(`${m[1]}:${m[2]}`);
  }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loadsAsSkill = (text, ref) => {
    const r = '`?' + escapeRe(ref) + '\\b`?';
    return [
      new RegExp('\\bload(s|ed|ing)?\\s+(the\\s+)?(skill\\s*\\(?\\s*)?' + r, 'i'),
      new RegExp(r + "\\s+skill\\b", 'i'),
      new RegExp(r + '\\s+with\\s+the\\s+`?Skill`?', 'i'),
      new RegExp('\\bSkill\\s*\\(\\s*skill:\\s*"' + escapeRe(ref) + '"'),
      new RegExp('\\bSkill name:\\s*' + r),
    ].some((re) => re.test(text));
  };
  // Two phrasings that name no plugin:skill pair and so slip past REF below: a wildcard over a
  // plugin that ships no skills ("the `<plugin>:*` skills"), and a bare agent name called
  // a skill ("the `content-planner` skill"). Both were live after the agent mirrors left.
  const pluginsWithSkills = new Set([...known].map((r) => r.split(':')[0]));
  const skillNames = new Set([...known].map((r) => r.split(':')[1]));
  const agentOnlyNames = [...new Set([...agents].map((r) => r.split(':')[1]))].filter((n) => !skillNames.has(n));
  const WILDCARD = /\b(vivreal-[a-z-]+):\*`?\s+skills?\b/g;
  const BARE = agentOnlyNames.length
    ? new RegExp('(^|[^:\\w-])`?(' + agentOnlyNames.map(escapeRe).join('|') + ')`?\\s+skills?\\b', 'i')
    : null;
  const REF = /\b(vivreal-[a-z-]+):([a-z0-9-]+)\b/g;
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!isPluginFile(rel) || !rel.endsWith('.md')) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      WILDCARD.lastIndex = 0;
      let w;
      while ((w = WILDCARD.exec(line))) {
        if (PLUGIN_DIRS.includes(w[1]) && !pluginsWithSkills.has(w[1])) {
          fail(
            'cross-reference',
            `${rel}:${i + 1}`,
            `"${w[1]}:*" calls this plugin's entries skills, and it ships none. Its agents are dispatched, not loaded.`,
          );
        }
      }
      const b = BARE && line.match(BARE);
      if (b) {
        fail(
          'cross-reference',
          `${rel}:${i + 1}`,
          `"${b[2]}" is an agent with no skill of that name anywhere, and this line calls it a skill. ` +
            'Name the knowledge skill that carries the facts, or the agent to dispatch.',
        );
      }
      REF.lastIndex = 0;
      let m;
      while ((m = REF.exec(line))) {
        const ref = `${m[1]}:${m[2]}`;
        // `plugin@marketplace` install lines and the marketplace name itself are
        // not skill references.
        if (m[2] === 'vivreal' || line.includes('claude plugin')) continue;
        if (!PLUGIN_DIRS.includes(m[1])) continue;
        if (known.has(ref)) continue;
        if (!agents.has(ref)) {
          fail('cross-reference', `${rel}:${i + 1}`, `"${ref}" names no skill that exists`);
        } else if (loadsAsSkill((i > 0 ? lines[i - 1] : '') + ' ' + line, ref)) {
          fail(
            'cross-reference',
            `${rel}:${i + 1}`,
            `"${ref}" is an agent, and this line loads it as a skill. There is no skill by that name to load. ` +
              'Dispatch the agent, read its file (`${CLAUDE_PLUGIN_ROOT}/agents/<name>.md` in the same plugin), ' +
              'or load a knowledge skill that carries the same facts.',
          );
        }
      }
    });
  }
}

// -------------------------------------------------- rule 2: manifest agreement
function ruleManifest() {
  let manifest;
  const relManifest = '.claude-plugin/marketplace.json';
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, relManifest), 'utf8'));
  } catch (err) {
    fail('manifest', relManifest, 'does not parse: ' + err.message);
    return;
  }
  const declared = new Set((manifest.plugins || []).map((p) => p.name));
  const onDisk = new Set(
    PLUGIN_DIRS.filter((d) => {
      try {
        statSync(join(ROOT, d, '.claude-plugin', 'plugin.json'));
        return true;
      } catch {
        return false;
      }
    }),
  );
  for (const d of onDisk) {
    if (!declared.has(d)) fail('manifest', relManifest, `plugin "${d}" exists on disk and is not in the marketplace`);
  }
  for (const d of declared) {
    if (!onDisk.has(d)) fail('manifest', relManifest, `marketplace declares "${d}" and no such plugin directory has a plugin.json`);
  }

  // Every plugin.json must parse and must name itself the same as its directory.
  for (const d of onDisk) {
    const rel = `${d}/.claude-plugin/plugin.json`;
    try {
      const j = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
      if (j.name !== d) fail('manifest', rel, `plugin.json name "${j.name}" does not match directory "${d}"`);
    } catch (err) {
      fail('manifest', rel, 'does not parse: ' + err.message);
    }
  }

  // The README lists the plugins for a human. Assert the set, not a count: a count
  // is satisfied by the wrong set of the right size, and the README has already
  // shipped saying thirteen while the marketplace declared fourteen.
  let readme = '';
  try {
    readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  } catch {
    fail('manifest', 'README.md', 'missing');
    return;
  }
  for (const d of declared) {
    if (!readme.includes('`' + d + '`')) {
      fail('manifest', 'README.md', `does not mention plugin "${d}", which the marketplace declares`);
    }
  }
  const wordCount = readme.match(/It contains \*\*([a-z]+) plugins\*\*/);
  if (wordCount) {
    fail('manifest', 'README.md', `spells the plugin count in words ("${wordCount[1]}"), which nothing can check; state the set instead`);
  }
}

// ------------------------------------------- rule 3: description matches tools
function ruleAgentTools(files) {
  const MARK = 'NO WRITE AND NO EDIT TOOL';
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!/^[^/]+\/agents\/[^/]+\.md$/.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    const end = text.indexOf('\n---', 3);
    if (end < 0) continue;
    const fm = text.slice(0, end);
    const tools = (fm.match(/^tools:\s*(.*)$/m) || [, ''])[1];
    const canWrite = /\bWrite\b/.test(tools) || /\bEdit\b/.test(tools);
    const declaresNoWrite = fm.includes(MARK);
    if (!canWrite && !declaresNoWrite) {
      fail(
        'agent-tools',
        rel,
        'has no Write and no Edit tool, and its description does not say so. A dispatcher reads the description, ' +
          'so it will be sent to author a document it cannot write.',
      );
    }
    if (canWrite && declaresNoWrite) {
      fail('agent-tools', rel, 'declares it cannot write, and its tool list includes Write or Edit');
    }
  }
}

/**
 * An agent whose body tells it to dispatch a subagent, while its frontmatter grants no
 * `Agent` tool.
 *
 * This is the cause of a failure this fleet knew only by its symptom. Five role agents
 * carried "dispatch the relevant expert" instructions and none of them held `Agent`. The
 * only tool left that can reach an expert is `Skill`, which loads that expert's body
 * INLINE into the caller's own context rather than spawning a bounded subagent. The
 * expert's report then becomes the deliverable and the actual task goes undone.
 *
 * The signal has to be narrow. Matching the bare word "dispatch" fires on every correct
 * agent too, because the corrected wording says "the orchestrating thread dispatches
 * between turns". A rule that always fires is as useless as one that never does. So this
 * matches only two shapes that mean "YOU dispatch, now": the literal `subagent_type:`
 * parameter, and an imperative dispatch naming an agent handle.
 */
function ruleAgentDispatch(files) {
  const IMPERATIVE = /\bdispatch(?:es|ing)?\s+(?:the\s+)?`?@/i;
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!/^[^/]+\/agents\/[^/]+\.md$/.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    const end = text.indexOf('\n---', 3);
    if (end < 0) continue;
    const fm = text.slice(0, end);
    const body = text.slice(end + 4);
    const tools = (fm.match(/^tools:\s*(.*)$/m) || [, null])[1];
    // No `tools` key at all means the default set, which includes Agent.
    if (tools === null) continue;
    if (/\bAgent\b/.test(tools)) continue;
    const hit = body.includes('subagent_type:') || IMPERATIVE.test(body);
    if (hit) {
      fail(
        'agent-dispatch',
        rel,
        'is instructed to dispatch a subagent, and its tool list grants no `Agent`. It will reach ' +
          'for `Skill` instead, which loads the target INLINE into its own context, and the loaded ' +
          "report becomes its deliverable. Either grant `Agent`, or reword the instruction to say " +
          'the orchestrating thread dispatches between turns.',
      );
    }
  }
}

/**
 * Every `mcp__<server>__` prefix an agent is granted, or told to call, must name a server
 * something actually declares. A grant that resolves to nothing is dropped in silence; an
 * agent whose ONLY entries for a capability are unresolvable has no way to reach it, and the
 * prose telling it to "use the X MCP" sends it after a tool that is not there.
 *
 * A server comes from one of three places, and each is listed so a new prefix is a decision:
 *   1. a `.mcp.json` in a plugin tree here, which registers as `plugin_<plugin>_<server>`;
 *   2. an official plugin the fleet enables (context7, playwright, sentry);
 *   3. a project `.mcp.json` in a fleet repository, which only exists in sessions started in
 *      that repository: Vivreal_Portal_Mobile declares `mongodb`, `mongodb-write`, `github` and
 *      five `awslabs.*` servers; VR-MCP-Server declares six `awslabs.*` servers and NO `mongodb`;
 *      VR_CMS_API declares `aws-documentation` and its `aws-*` siblings;
 *   4. a server the user registers by hand, named by the repo that documents it: `vivreal`, the
 *      Vivreal MCP itself (VR-MCP-Server docs/DEPLOYMENT_RUNBOOK.md, `claude mcp add --transport
 *      http vivreal https://mcp.vivreal.io/mcp`); or a claude.ai connector (`claude_ai_*`).
 *
 * A WARNING, not a failure: a project-scoped server is legitimate where it is declared, and
 * the fix for an unknown one is a judgement (drop the grant, or name where it comes from).
 */
const EXTERNAL_MCP_SERVERS = new Set([
  'plugin_context7_context7',
  'plugin_playwright_playwright',
  'plugin_sentry_sentry',
]);
const PROJECT_SCOPED_MCP_SERVERS = new Set([
  'vivreal',
  'mongodb',
  'mongodb-write',
  'github',
  'awslabs_aws-documentation-mcp-server',
  'awslabs_aws-api-mcp-server',
  'awslabs_cfn-mcp-server',
  'awslabs_cloudwatch-mcp-server',
  'awslabs_lambda-tool-mcp-server',
  'awslabs_ccapi-mcp-server',
  'aws-documentation',
]);
const MCP_PREFIX = /mcp__([A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*)__/g;

function ruleMcpPrefixes(files) {
  const known = new Set([...EXTERNAL_MCP_SERVERS, ...PROJECT_SCOPED_MCP_SERVERS]);
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    const m = rel.match(/^([^/]+)\/\.mcp\.json$/);
    if (!m) continue;
    try {
      const j = JSON.parse(readFileSync(abs, 'utf8'));
      for (const name of Object.keys(j.mcpServers || j)) known.add(`plugin_${m[1]}_${name}`);
    } catch {
      // ruleParse reports an unparseable JSON file; nothing to add here.
    }
  }
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!isPluginFile(rel) || !rel.endsWith('.md')) continue;
    const seen = new Set();
    readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      MCP_PREFIX.lastIndex = 0;
      let m;
      while ((m = MCP_PREFIX.exec(line))) {
        const server = m[1];
        if (known.has(server) || server.startsWith('claude_ai_') || seen.has(server)) continue;
        seen.add(server);
        warn(
          'mcp-prefix',
          `${rel}:${i + 1}`,
          `"mcp__${server}__" names no MCP server a plugin here, an enabled official plugin, or a fleet project ` +
            'declares. The grant resolves to nothing and the tool is silently absent. Drop it, or add the server ' +
            'to the list in check-definitions.mjs with where it is declared.',
        );
      }
    });
  }
}

/**
 * Generated mirrors belong in the gitignored `.agy/` tree, never inside a plugin. Two shapes:
 *
 *  - A command mirror (`skills/cmd-<name>/`). Claude Code already lists every command as a
 *    skill, so an in-tree mirror listed each command twice (`vivreal-workflow:reviewer` and
 *    `vivreal-workflow:cmd-reviewer`), and two of the old mirrors had no command behind them
 *    at all, so they were the only copy of `/deliver` and `/write-docs`.
 *  - An agent mirror (`skills/<name>/` beside `agents/<name>.md`). Sixty of them once sat
 *    here: each listed its agent a second time as a skill, spent description tokens on every
 *    turn, ran WITHOUT the agent's tool limits when invoked as a skill, and ten had drifted
 *    from their agent.
 *
 * An older `sync-to-agy.js` run puts either back; this is what notices.
 */
function ruleNoInTreeMirrors(files) {
  const agents = new Set();
  for (const abs of files) {
    const m = norm(relative(ROOT, abs)).match(/^([^/]+)\/agents\/([^/]+)\.md$/);
    if (m) agents.add(`${m[1]}/${m[2]}`);
  }
  const flagged = new Set();
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    const m = rel.match(/^([^/]+)\/skills\/([^/]+)\//);
    if (!m || flagged.has(`${m[1]}/${m[2]}`)) continue;
    if (m[2].startsWith('cmd-')) {
      flagged.add(`${m[1]}/${m[2]}`);
      fail(
        'mirror-in-tree',
        `${m[1]}/skills/${m[2]}`,
        'a command mirror inside a plugin tree lists the command twice. sync-to-agy.js writes these to .agy/. ' +
          'Delete it, after checking ' + m[1] + '/commands/' + m[2].slice(4) + '.md exists (a mirror with no source is the only copy).',
      );
    } else if (agents.has(`${m[1]}/${m[2]}`)) {
      flagged.add(`${m[1]}/${m[2]}`);
      fail(
        'mirror-in-tree',
        `${m[1]}/skills/${m[2]}`,
        `an agent mirror inside a plugin tree lists ${m[1]}/agents/${m[2]}.md a second time, as a skill that ` +
          'runs without the agent tool limits. sync-to-agy.js writes these to .agy/. Delete it, after checking ' +
          'its body against the agent (a mirror that drifted can hold the only copy of a change).',
      );
    }
  }
}

// ------------------------------------------------- rule 4: no copied values
// Each entry is a shape this repo has already shipped wrong. The point is not to
// list every possible mechanical value; it is that a value of one of these shapes
// in a plugin tree is a liability with a delay fuse, whether or not it is correct
// today.
const COPIED_VALUE_RULES = [
  {
    id: 'package-version',
    rx: /@hillbombcreations\/(?:site-renderer|schemas|tier-quotas|tenant-placement|tenant-db|site-loader)[^\n`]{0,40}?\bv?\d+\.\d+\.\d+/g,
    why: 'names a package version. Point at package.json on the deployed line instead.',
  },
  {
    id: 'tier-quotas-version',
    rx: /\btier-quotas\s+v?\d+\.\d+\.\d+/gi,
    why: 'names a tier-quotas version. The ladder inside it has changed shape, not just numbers.',
  },
  {
    id: 'lambda-count',
    rx: /\b\d+\s+(?:prod\s+)?Lambdas\b/g,
    why: 'names a Lambda count. Count AWS::Serverless::Function on the deployed line instead.',
  },
  {
    id: 'route-count',
    rx: /\b\d+\s+(?:edge-runtime\s+)?proxy routes\b/gi,
    why: 'names a proxy-route count. The filesystem is the count.',
  },
  {
    // The rule above only ever matched the literal phrase "N proxy routes", so the
    // commonest way of writing the same claim walked straight past it: "57 of 76 routes
    // use this", "223 routes, 185 factory, 38 manual". Same defect, different words.
    id: 'route-count-split',
    rx: /\b\d+\s+of\s+\d+\s+routes\b|\b\d+\s+factory\b|\b\d+\s+manual\s+routes?\b/gi,
    why: 'names a factory-vs-manual proxy-route split. Strip comments, look for a createProxyHandler( CALL, and let the filesystem be the count.',
  },
  {
    id: 'mcp-tool-count',
    rx: /\b\d+\s+(?:CMS|outreach)\s+tools\b/gi,
    why: 'names an MCP tool count. Read src/tools/catalog.ts instead.',
  },
  {
    id: 'amplify-job',
    rx: /\bjob\s+\d{1,4}\b/gi,
    why: 'names an Amplify job number, which is stale the next deploy.',
  },
  {
    id: 'retired-tier',
    rx: /\b(?:proplus|pro_plus|proPlus|Pro Plus)\b/g,
    why: 'names the retired Pro Plus TIER. pro_plus survives only as a DATABASE name, so say database.',
    // The database name is legitimate. Allow a line that says so explicitly.
    allowLine: /database|placement|dbKey|DATABASE/,
  },
];

function ruleCopiedValues(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!isPluginFile(rel)) continue;
    if (!/\.(md|json)$/.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    for (const rule of COPIED_VALUE_RULES) {
      lines.forEach((line, i) => {
        if (rule.allowLine && rule.allowLine.test(line)) return;
        rule.rx.lastIndex = 0;
        const m = rule.rx.exec(line);
        if (m) fail('copied-value', `${rel}:${i + 1}`, `${rule.id}: "${m[0].trim()}" ${rule.why}`);
      });
    }
  }
}

// ------------------------------------------------------------- rule 5: dashes
function ruleDashes(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!/\.(md|json|js|cjs|mjs)$/.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const d of DASHES) {
        if (line.includes(d)) {
          fail('dash', `${rel}:${i + 1}`, `codepoint U+${d.charCodeAt(0).toString(16).toUpperCase()} is banned; use a comma, a period or parentheses`);
          return;
        }
      }
    });
  }
}

// --------------------------------------------- rule 6: deleted product behaviour
// The first version of these rules matched `deriveDbKey(` and `databaseDict[`, and
// fourteen surviving references wrote `deriveDbKey.js`, `deriveDbKey ` or just "the
// tier mapping", so the rules never saw them. One of those was the worst shape in the
// repo: a removed bug class taught as the correct pattern, with an explicit
// instruction not to fix it. Match the NAME and the CONCEPT, not one call syntax.
const REMOVAL_VOCABULARY =
  /deleted|removed|is the bug|do not restore|do not treat|never computed|no longer|gone|throws|comment record|moved into|there are no tier/i;

const DELETED_BEHAVIOUR = [
  {
    id: 'derive-dbkey',
    rx: /\bderiveDbKey\b/,
    why: 'deriveDbKey is deleted from every repository. A tenant database is a stored placement, read back by resolvePlacement(group), which throws rather than guessing.',
    allowLine: REMOVAL_VOCABULARY,
  },
  {
    id: 'tier-to-database',
    rx: /\bdatabaseDict\b/,
    why: 'the databaseDict[tier] ladder is deleted. It silently re-pointed a live group at a different database whenever its tier changed.',
    allowLine: REMOVAL_VOCABULARY,
  },
  {
    id: 'tier-mapping',
    rx: /tier[- ]mapp(ing|ed)|tier branches (are|is) fallback/i,
    why: 'a tier does not map to a database and has not for some time. Say that the placement is STORED on the group and read back.',
    allowLine: REMOVAL_VOCABULARY,
  },
  // H306. A DELETED ROUTE, ADVERTISED BY A SKILL AN AGENT LOADS.
  //
  // A route named in a skill is, to the agent reading it, a fact. The only
  // feedback an agent gets from calling one of these is a 403 from API
  // Gateway, which reads like an auth problem rather than like a route that
  // was removed, so it will try again with different credentials.
  //
  // Each entry below is a route this fleet actually deleted, and each stays
  // matchable AS A REFUSAL through REMOVAL_VOCABULARY, deliberately: erasing
  // the claim leaves the next reader free to invent it again, which is how
  // `sendContactUsEmail` came back once already. Say it is gone, out loud.
  {
    id: 'route-sendcontactusemail',
    rx: /sendContactUsEmail/,
    why: 'POST /api/sendContactUsEmail was deleted from VR_Main_API on 2026-09-23 (route, mailer and validator, each replaced by a removal comment). A site contact form posts to VR_Client_API. Say it is gone rather than deleting the sentence.',
    allowLine: REMOVAL_VOCABULARY,
  },
  {
    id: 'route-template-sync',
    rx: /\/api\/(registerDomain|createBranch|deployTemplateSubDomain|deployTemplateCustomDomain|templateSyncWebhook)\b/,
    why: 'this route went with the template-sync flow in VR_Secure_API and is in no CloudFormation fragment. GEMINI.md there now DERIVES its route map from the Api event Path entries, which is the deployed contract.',
    allowLine: REMOVAL_VOCABULARY,
  },
];

function ruleDeletedBehaviour(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!isPluginFile(rel) || !rel.endsWith('.md')) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    for (const rule of DELETED_BEHAVIOUR) {
      lines.forEach((line, i) => {
        if (rule.allowLine && rule.allowLine.test(line)) return;
        if (rule.rx.test(line)) fail('deleted-behaviour', `${rel}:${i + 1}`, `${rule.id}: ${rule.why}`);
      });
    }
  }
}

// --------------------------------------------- rule 7: no AWS account id
// THIS REPOSITORY IS PUBLIC. An AWS account id is not a password, but publishing one
// enables account enumeration and cross-account role-name guessing, and it buys a
// reader nothing: the thing an operator actually needs is the PROFILE and the REGION,
// which resolve the account for them. Seven instances shipped here before anyone
// looked, and six of them were a CUSTOMER's account rather than ours.
//
// Match on the VALUE's shape, never on a variable name. In one sweep across this
// estate, 8 of 18 leaks sat in fields innocently named `to`, `subject`, `admin` and
// `route`, so a name-based search found under half of them. The line is percent-decoded
// before matching, because a value inside a URL is still a published value.
//
// No allowlist, deliberately. There is no legitimate 12-digit run anywhere in this
// repository today, so an exemption list would only be a place for the next one to
// hide. Write the profile and the region, or write <account-id>.
//
// Shape, not exemption: the run must not touch a hex letter on either side, because a
// 40-hex git SHA (every `synced` in scripts/skill-sources.json, R14) routinely holds a
// 12-digit run, and an account id never sits inside a hex token. An ARN, a bucket name
// or a bare id is still bounded by `:`, `-`, `/` or a space, and still fails.
const ACCOUNT_ID = /(?<![0-9a-fA-F])[0-9]{12}(?![0-9a-fA-F])/;

/** first three and last three digits only, so a report can name a hit without republishing it */
const maskAccount = (v) => `${v.slice(0, 3)}...${v.slice(-3)}`;

function decodePercent(line) {
  try {
    return decodeURIComponent(line);
  } catch {
    // A stray % that is not an escape throws. The raw line is still checked above,
    // so failing to decode loses nothing; swallowing it silently would.
    return line;
  }
}

function ruleAwsAccountId(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!/\.(md|json|js|cjs|mjs|ps1|ya?ml)$/.test(rel)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = ACCOUNT_ID.exec(line) || ACCOUNT_ID.exec(decodePercent(line));
      if (!m) return;
      fail(
        'aws-account-id',
        `${rel}:${i + 1}`,
        `a 12-digit run (${maskAccount(m[0])}) reads as an AWS account id, and this repository is PUBLIC. ` +
          'Name the AWS profile and the region instead, or write <account-id>.',
      );
    });
  }
}

// ------------------------------------------------- rule 11: machine paths (R11)
// A literal clone path works on one machine and silently reads a stale or absent tree on every
// other. Paths go through ${VIVREAL_REPOS}. The patterns are built from character codes so this
// file never holds the strings it refuses. docs/ is history and is not scanned.
const BSL = String.fromCharCode(92);
const MACHINE_PATH = new RegExp(
  [
    '[Cc]:[' + BSL + BSL + '/]repos\\b',
    '/c' + '/repos\\b',
    '[Cc]:[' + BSL + BSL + '/]Users[' + BSL + BSL + '/]',
    '(^|[^A-Za-z0-9_.$}-])/Users/[A-Za-z0-9._-]+/',
    '(^|[^A-Za-z0-9_.$}-])/home/[A-Za-z0-9._-]+/',
  ].join('|'),
);
// The one sanctioned example of the variable's VALUE, in the shared-standards preamble the plan
// quotes verbatim. Exact line text, so any other use of the same path still fails.
const MACHINE_PATH_EXAMPLE = 'with forward slashes (for example `' + 'C:' + '/repos`)';

function ruleMachinePaths(files) {
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (rel.startsWith('docs/') || rel.startsWith('.agy/')) continue;
    if (!/\.(md|json|js|cjs|mjs|ps1|sh|ya?ml|txt)$/.test(rel)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes(MACHINE_PATH_EXAMPLE)) return;
      const m = MACHINE_PATH.exec(line);
      if (!m) return;
      fail(
        'machine-path',
        `${rel}:${i + 1}`,
        `a literal machine path ("${m[0].trim()}") only exists on one machine. ` +
          'Write `${VIVREAL_REPOS}/<repo>/...` in prose, or `"$VIVREAL_REPOS/<repo>/..."` in shell.',
      );
    });
  }
}

// --------------------------------------------------- rule 12: version bump (R12)
// An unbumped plugin does not reinstall, so a merged change never reaches a machine. Every
// plugin directory changed since the merge base must carry a plugin.json version above the
// base's. A directory absent at HEAD (deleted) or at the base (new) is skipped.
function semverGreater(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Pure decision, so the self-test can drive it without a git history. */
function versionBumpFindings(changedDirs, baseVersionOf, headVersionOf) {
  const out = [];
  for (const dir of [...changedDirs].sort()) {
    const base = baseVersionOf(dir);
    const head = headVersionOf(dir);
    if (base === null || head === null) continue; // new or deleted plugin
    if (!semverGreater(head, base)) {
      out.push({ dir, base, head });
    }
  }
  return out;
}

let gitContextCache;
function gitContext() {
  if (gitContextCache !== undefined) return gitContextCache;
  gitContextCache = null;
  const run = (args) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  try {
    const mb = run(['merge-base', 'HEAD', baseRef]);
    const changed = run(['diff', '--name-only', mb])
      .split('\n')
      .filter(Boolean)
      .map((p) => p.split('/')[0]);
    const baseVersionOf = (dir) => {
      try {
        return JSON.parse(run(['show', `${mb}:${dir}/.claude-plugin/plugin.json`])).version ?? null;
      } catch {
        return null;
      }
    };
    gitContextCache = { baseRef, mb, changed: new Set(changed), baseVersionOf };
  } catch {
    gitContextCache = null;
  }
  return gitContextCache;
}

function headVersionOf(dir) {
  try {
    return JSON.parse(readFileSync(join(ROOT, dir, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function ruleVersionBump() {
  const ctx = gitContext();
  if (!ctx) {
    warn(
      'version-bump',
      '(git)',
      'no git history or no base ref (origin/main, or origin/$GITHUB_BASE_REF), so the version-bump rule DID NOT RUN.',
    );
    return;
  }
  for (const f of versionBumpFindings(ctx.changed, ctx.baseVersionOf, headVersionOf)) {
    fail(
      'version-bump',
      `${f.dir}/.claude-plugin/plugin.json`,
      `${f.dir} changed since ${ctx.baseRef} (merge base ${ctx.mb.slice(0, 7)}) but its version ${f.head} ` +
        `is not above the base's ${f.base}. An unbumped plugin does not reinstall.`,
    );
  }
}

// ------------------------------------------------- rule 13: routes resolve (R13)
// A route to an agent that does not exist sends every matching dispatch nowhere. Every
// `agent` in a `<plugin>/routing/routes.json` must be an existing `<plugin>/agents/<name>.md`.
function ruleRoutesResolve(files) {
  const rels = files.map((abs) => norm(relative(ROOT, abs)));
  const agents = new Set(
    rels.map((r) => r.match(/^([^/]+)\/agents\/([^/]+)\.md$/)).filter(Boolean).map((m) => `${m[1]}:${m[2]}`),
  );
  for (const rel of rels.filter((r) => /^[^/]+\/routing\/routes\.json$/.test(r))) {
    let routes;
    try {
      routes = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')).routes;
    } catch (e) {
      fail('routes-resolve', rel, `does not parse: ${e.message}`);
      continue;
    }
    if (!Array.isArray(routes) || routes.length === 0) {
      fail('routes-resolve', rel, 'holds no routes array, so nothing here was checked');
      continue;
    }
    routes.forEach((r, i) => {
      if (!agents.has(r.agent)) {
        fail('routes-resolve', `${rel} route ${i + 1}`, `"${r.agent}" (${r.task}) is not an agent file in this repo`);
      }
    });
  }
}

// ------------------------------------------------------------------ the runner
function runAll(files) {
  ruleParse(files);
  ruleManifest();
  ruleAgentTools(files);
  ruleAgentDispatch(files);
  ruleCrossReferences(files);
  ruleMcpPrefixes(files);
  ruleNoInTreeMirrors(files);
  ruleCopiedValues(files);
  ruleDashes(files);
  ruleDeletedBehaviour(files);
  ruleAwsAccountId(files);
  ruleMachinePaths(files);
  ruleVersionBump();
  ruleRoutesResolve(files);
}

/**
 * The must-pass control. Every rule gets one fixture that MUST trip it. A rule that
 * stays green on its own poison is a rule that cannot fail, and this whole file
 * exists because a gate that cannot fail reports a clean run forever.
 */
const FIXTURE_PLUGIN = 'vivreal-selftest-fixture';

function selfTest() {
  // The fixture is a real plugin directory at the repo root, because the rules key
  // off the path shape `<plugin>/agents/<name>.md`. A fixture nested one level
  // deeper matches nothing, and two rules then stay green on their own poison,
  // which is the failure this control exists to catch. It caught it.
  const tmp = join(ROOT, FIXTURE_PLUGIN);
  PLUGIN_DIRS.push(FIXTURE_PLUGIN);

  const cases = [
    {
      rule: 'dash',
      label: 'dash: an em dash anywhere',
      path: join(tmp, 'skills', 'poison', 'SKILL.md'),
      body:
        '---\nname: poison\ndescription: fixture\n---\n\ncontrol ' +
        String.fromCharCode(0x2014) +
        ' line\n',
    },
    {
      rule: 'copied-value',
      label: 'copied-value: a Lambda count',
      path: join(tmp, 'skills', 'copied', 'SKILL.md'),
      body: '---\nname: copied\ndescription: fixture\n---\n\nRuns 15 Lambdas today.\n',
    },
    {
      rule: 'copied-value',
      label: 'copied-value: a factory-vs-manual route split',
      path: join(tmp, 'skills', 'split', 'SKILL.md'),
      body: '---\nname: split\ndescription: fixture\n---\n\nUse the factory (57 of 76 routes use this).\n',
    },
    {
      rule: 'agent-tools',
      label: 'agent-tools: no Write, and silent about it',
      path: join(tmp, 'agents', 'mute.md'),
      body: '---\nname: mute\ndescription: a consultant that reports findings\ntools: Read, Grep\n---\n\nbody\n',
    },
    {
      rule: 'agent-dispatch',
      label: 'agent-dispatch: told to dispatch, holds no Agent tool',
      // NO WRITE AND NO EDIT TOOL keeps this fixture from also tripping agent-tools,
      // so the two rules stay independently observable.
      path: join(tmp, 'agents', 'handless.md'),
      body:
        '---\nname: handless\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\n' +
        'tools: Read, Grep, Skill\n---\n\nDispatch `@cms-api` when the design touches media.\n',
    },
    {
      rule: 'parse',
      label: 'parse: no frontmatter at all',
      path: join(tmp, 'agents', 'broken.md'),
      body: 'no frontmatter at all\n',
    },
    {
      // H306. A route that no longer exists, advertised as if it does. The
      // fixture says it plainly and carries none of the removal vocabulary,
      // because a rule that only fires on a sentence nobody writes is a rule
      // that never fires.
      rule: 'deleted-behaviour',
      label: 'deleted-behaviour: a deleted route advertised as live',
      path: join(tmp, 'skills', 'ghost-route', 'SKILL.md'),
      body: '---\nname: ghost-route\ndescription: fixture\n---\n\nEmail: `POST /api/sendContactUsEmail` for the contact form.\n',
    },
    {
      rule: 'deleted-behaviour',
      label: 'deleted-behaviour: deriveDbKey',
      path: join(tmp, 'skills', 'ladder', 'SKILL.md'),
      body: '---\nname: ladder\ndescription: fixture\n---\n\nResolve it with deriveDbKey(group).\n',
    },
    {
      rule: 'manifest',
      label: 'manifest: a plugin the marketplace omits',
      path: join(tmp, '.claude-plugin', 'plugin.json'),
      body: JSON.stringify({ name: FIXTURE_PLUGIN, description: 'fixture' }, null, 2) + '\n',
    },
    {
      rule: 'cross-reference',
      label: 'cross-reference: a skill that does not exist',
      path: join(tmp, 'skills', 'refs', 'SKILL.md'),
      body:
        '---\nname: refs\ndescription: fixture\n---\n\nInvoke `vivreal-workflow:no-such-skill` first.\n',
    },
    {
      // The shape that broke eleven agents during the work this file came out of, and
      // that the in-house parser happily accepted until `claude plugin validate` said
      // otherwise. It must never pass again.
      rule: 'parse',
      label: 'yaml: a colon that drops every field',
      path: join(tmp, 'agents', 'plain-scalar-colon.md'),
      body:
        '---\nname: plain-scalar-colon\ndescription: READ ONLY: it cannot write a file\ntools: Read, Grep\n---\n\nbody\n',
    },
    {
      // The shape fourteen surviving references actually used. The first version of
      // the rule matched only `deriveDbKey(` and saw none of them.
      rule: 'deleted-behaviour',
      label: 'deleted-behaviour: the tier mapping',
      path: join(tmp, 'skills', 'tier-mapping', 'SKILL.md'),
      body: [
        '---',
        'name: tier-mapping',
        'description: fixture',
        '---',
        '',
        'The persisted dbKey wins and the tier mapping is the fallback.',
        '',
      ].join('\n'),
    },
    {
      // The account id is ASSEMBLED rather than pasted, for the same reason the dash
      // codepoints are: a 12-digit literal sitting in this file would trip the very rule
      // it is poisoning, and the no-poison control at the end would then be red forever.
      rule: 'aws-account-id',
      label: 'aws-account-id: an account id in a public repo',
      path: join(tmp, 'skills', 'acct', 'SKILL.md'),
      body: [
        '---',
        'name: acct',
        'description: fixture',
        '---',
        '',
        'Assume `arn:aws:iam::' + '123456' + '789012' + ':role/Example`.',
        '',
      ].join('\n'),
    },
    {
      rule: 'mirror-in-tree',
      label: 'mirror-in-tree: a command mirror inside a plugin',
      path: join(tmp, 'skills', 'cmd-poison', 'SKILL.md'),
      body: '---' + String.fromCharCode(10) + 'description: fixture' + String.fromCharCode(10) + '---' + String.fromCharCode(10),
    },
    {
      // The shape sync-to-agy.js wrote sixty times: a skill directory named for an agent in
      // the same plugin. `with` writes the agent the mirror sits beside.
      rule: 'mirror-in-tree',
      match: 'an agent mirror',
      label: 'mirror-in-tree: an agent mirror inside a plugin',
      path: join(tmp, 'skills', 'mirrored', 'SKILL.md'),
      body: '---\nname: mirrored\ndescription: fixture\n---\n\nbody\n',
      with: [
        {
          path: join(tmp, 'agents', 'mirrored.md'),
          body: '---\nname: mirrored\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nbody\n',
        },
      ],
    },
    {
      // An agent named where a skill is loaded. `match` keeps this from passing on the
      // "names no skill" branch, which would fire if the agent were not recognised at all.
      rule: 'cross-reference',
      match: 'is an agent',
      label: 'cross-reference: an agent loaded as a skill',
      path: join(tmp, 'skills', 'loader', 'SKILL.md'),
      body:
        '---\nname: loader\ndescription: fixture\n---\n\nFor a gotcha, load\n`' + FIXTURE_PLUGIN + ':expert` with the `Skill` tool.\n',
      with: [
        {
          path: join(tmp, 'agents', 'expert.md'),
          body: '---\nname: expert\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nbody\n',
        },
      ],
    },
    {
      // The help-page-producer shape the #48 review caught: a wildcard over a plugin that now
      // ships agents only. The fixture plugin holds no skill in this case, only the agent.
      rule: 'cross-reference',
      match: 'ships none',
      label: 'cross-reference: a plugin:* wildcard over agents only',
      path: join(tmp, 'agents', 'wild.md'),
      body:
        '---\nname: wild\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\n' +
        'The `' + FIXTURE_PLUGIN + ':*` skills are read-only experts. Load one for a gotcha.\n',
    },
    {
      // A bare agent name called a skill, with no plugin prefix for REF to see.
      rule: 'cross-reference',
      match: 'calls it a skill',
      label: 'cross-reference: a bare agent name called a skill',
      path: join(tmp, 'agents', 'bare.md'),
      body:
        '---\nname: bare\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\n' +
        'For the full list, read the `oracle-fixture` skill first.\n',
      with: [
        {
          path: join(tmp, 'agents', 'oracle-fixture.md'),
          body: '---\nname: oracle-fixture\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nbody\n',
        },
      ],
    },
    {
      // The ALLOW half of the case above: a DISPATCH of the same agent is a valid reference.
      // `kind: 'clean'` inverts the control, so this one must stay green.
      rule: 'cross-reference',
      kind: 'clean',
      label: 'cross-reference: an agent dispatched by name',
      path: join(tmp, 'skills', 'dispatcher', 'SKILL.md'),
      body:
        '---\nname: dispatcher\ndescription: fixture\n---\n\nDispatch `' + FIXTURE_PLUGIN + ':expert` with the Agent tool.\n',
      with: [
        {
          path: join(tmp, 'agents', 'expert.md'),
          body: '---\nname: expert\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nbody\n',
        },
      ],
    },
    {
      // A warning rule still has to be able to fire. A grant naming a server nothing
      // declares; `kind: 'warn'` makes the control look in the warnings, not failures.
      rule: 'mcp-prefix',
      kind: 'warn',
      label: 'mcp-prefix: a grant naming no declared server',
      path: join(tmp, 'agents', 'ghost-mcp.md'),
      body:
        '---\nname: ghost-mcp\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\n' +
        'tools: Read, mcp__nosuchserver__find\n---\n\nbody\n',
    },
    {
      // The silent one. Five values in this repo were being truncated this way and
      // nothing anywhere reported it.
      rule: 'parse',
      label: 'yaml: a hash that truncates in silence',
      path: join(tmp, 'skills', 'hash-truncation', 'SKILL.md'),
      body:
        '---\nname: hash-truncation\ndescription: the #1 source of bugs, and everything after this is discarded\n---\n\nbody\n',
    },
    {
      // The shape that shipped in PR #38: an apostrophe inside a single-quoted
      // description. claude plugin validate caught it; this script passed it.
      rule: 'parse',
      label: "yaml: an apostrophe that closes a single-quoted scalar",
      path: join(tmp, 'skills', 'quote-break', 'SKILL.md'),
      body: "---\nname: quote-break\ndescription: 'it's broken'\n---\n\nbody\n",
    },
    {
      rule: 'parse',
      label: 'yaml: a bare quote inside a double-quoted scalar',
      path: join(tmp, 'skills', 'dquote-break', 'SKILL.md'),
      body: '---\nname: dquote-break\ndescription: "say "hi" here"\n---\n\nbody\n',
    },
    {
      rule: 'machine-path',
      label: 'machine-path: a literal clone root',
      path: join(tmp, 'agents', 'pathy.md'),
      body:
        '---\nname: pathy\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nRead ' +
        'C:' + '/repos/x/CLAUDE.md first.\n',
    },
    {
      rule: 'machine-path',
      kind: 'clean',
      label: 'machine-path: the variable form',
      path: join(tmp, 'agents', 'pathless.md'),
      body:
        '---\nname: pathless\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\n' +
        'Read `${VIVREAL_REPOS}/x/CLAUDE.md` first.\n',
    },
    {
      rule: 'routes-resolve',
      label: 'routes-resolve: a route to no agent',
      path: join(tmp, 'routing', 'routes.json'),
      body: JSON.stringify({ routes: [{ task: 't', agent: FIXTURE_PLUGIN + ':ghost', keywords: ['x'], repo: '*' }] }),
    },
    {
      rule: 'routes-resolve',
      kind: 'clean',
      label: 'routes-resolve: a route to a real agent',
      path: join(tmp, 'routing', 'routes.json'),
      body: JSON.stringify({ routes: [{ task: 't', agent: FIXTURE_PLUGIN + ':router-target', keywords: ['x'], repo: '*' }] }),
      with: [{ path: join(tmp, 'agents', 'router-target.md'), body: '---\nname: router-target\ndescription: NO WRITE AND NO EDIT TOOL, it answers in its reply\ntools: Read\n---\n\nbody\n' }],
    },
  ];

  let allCanFail = true;
  try {
    for (const c of cases) {
      failures.length = 0;
      warnings.length = 0;
      const written = [{ path: c.path, body: c.body }, ...(c.with || [])];
      for (const f of written) {
        mkdirSync(dirname(f.path), { recursive: true });
        writeFileSync(f.path, f.body, 'utf8');
      }

      // Run the REAL rule set, over the real walk, so the self-test exercises the
      // same code path the real run does. Nothing is reimplemented here.
      runAll(walk(ROOT));

      // A warning rule may already be firing on real files, so its control must find the
      // hit IN THE FIXTURE, or it would read red with the poison absent. `match` narrows a
      // failure rule to one branch, so a sibling branch of the same rule cannot stand in.
      const tripped =
        c.kind === 'warn'
          ? warnings.some((w) => w.rule === c.rule && w.where.startsWith(FIXTURE_PLUGIN + '/'))
          : failures.some(
              (f) =>
                f.rule === c.rule &&
                (c.kind !== 'clean' || f.where.startsWith(FIXTURE_PLUGIN + '/')) &&
                (!c.match || f.msg.includes(c.match)),
            );
      // A `clean` case is an ALLOW control: correct means its rule stayed green on the fixture.
      const correct = c.kind === 'clean' ? !tripped : tripped;
      console.log(
        `  ${tripped ? 'RED   ' : 'GREEN '} ${(c.label || c.rule).padEnd(34)} ` +
          (correct ? '(correct)' : c.kind === 'clean' ? '(THIS CHECK REFUSES A VALID FILE)' : '(THIS CHECK CANNOT FAIL)'),
      );
      if (!correct) allCanFail = false;
      for (const f of written) rmSync(f.path, { force: true });
    }

    // R12 needs a git history to see a change, so its control drives the pure decision directly.
    const bumpCases = [
      { label: 'version-bump: changed, not bumped', want: 1, dirs: ['p'], base: { p: '1.2.0' }, head: { p: '1.2.0' } },
      { label: 'version-bump: changed, version lowered', want: 1, dirs: ['p'], base: { p: '1.2.0' }, head: { p: '1.1.9' } },
      { label: 'version-bump: changed and bumped', want: 0, dirs: ['p'], base: { p: '1.2.0' }, head: { p: '1.3.0' } },
      { label: 'version-bump: plugin deleted at HEAD', want: 0, dirs: ['gone'], base: { gone: '1.0.0' }, head: {} },
      { label: 'version-bump: plugin new since base', want: 0, dirs: ['fresh'], base: {}, head: { fresh: '0.1.0' } },
    ];
    for (const b of bumpCases) {
      const got = versionBumpFindings(
        new Set(b.dirs),
        (d) => b.base[d] ?? null,
        (d) => b.head[d] ?? null,
      ).length;
      const correct = got === b.want;
      console.log(
        `  ${got ? 'RED   ' : 'GREEN '} ${b.label.padEnd(34)} ` +
          (correct ? '(correct)' : b.want ? '(THIS CHECK CANNOT FAIL)' : '(THIS CHECK REFUSES A VALID CHANGE)'),
      );
      if (!correct) allCanFail = false;
    }

    // The other half of the control: with the poison gone, the repo must come back
    // clean. A rule set that is red no matter what is as useless as one that is
    // green no matter what.
    failures.length = 0;
    rmSync(tmp, { recursive: true, force: true });
    const i = PLUGIN_DIRS.indexOf(FIXTURE_PLUGIN);
    if (i >= 0) PLUGIN_DIRS.splice(i, 1);
    runAll(walk(ROOT));
    const clean = failures.length === 0;
    console.log(
      `  ${clean ? 'GREEN ' : 'RED   '} the repo with no poison at all ` +
        (clean ? '(correct)' : `(${failures.length} real failures, fix them first)`),
    );
    if (!clean) {
      allCanFail = false;
      for (const f of failures.slice(0, 15)) console.log(`      ${f.where}  ${f.msg}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    failures.length = 0;
    warnings.length = 0;
  }
  return allCanFail;
}

// -------------------------------------------------------------------- main
const selfTestMode = process.argv.includes('--self-test');

if (selfTestMode) {
  console.log('Self-test: every rule must go RED on its own poison.');
  const ok = selfTest();
  console.log(ok ? '\nSelf-test PASSED: every rule can fail.' : '\nSelf-test FAILED: at least one rule cannot fail.');
  process.exit(ok ? 0 : 1);
}

const files = walk(ROOT);
runAll(files);

const byRule = new Map();
for (const f of failures) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

console.log(`Scanned ${files.length} files across ${PLUGIN_DIRS.length} plugin trees.`);

if (warnings.length) {
  const byWarn = new Map();
  for (const w of warnings) {
    if (!byWarn.has(w.rule)) byWarn.set(w.rule, []);
    byWarn.get(w.rule).push(w);
  }
  for (const [rule, list] of [...byWarn].sort()) {
    console.log(`\nWARNING ${rule}: ${list.length} (does not fail the run)`);
    for (const w of list) console.log(`  ${w.where}\n      ${w.msg}`);
  }
}

if (failures.length === 0) {
  console.log('\nAll rules pass.');
  console.log('Run with --self-test to prove the rules can fail. A green run here means nothing without it.');
  process.exit(0);
}

const LIMIT = Number(process.env.CHECK_LIMIT || 40);
for (const [rule, list] of [...byRule].sort()) {
  console.log(`\n${rule}: ${list.length}`);
  for (const f of list.slice(0, LIMIT)) console.log(`  ${f.where}\n      ${f.msg}`);
  if (list.length > LIMIT) console.log(`  ... and ${list.length - LIMIT} more (CHECK_LIMIT=0 for all)`);
}
console.log(`\n${failures.length} failures.`);
process.exit(1);
