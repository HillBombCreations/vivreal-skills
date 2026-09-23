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
    // here deliberately carry a name that differs from their directory (the command
    // mirrors are invoked as `plugin:db-query`, not `plugin:cmd-db-query`). What
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
      if (quoted || block || v.trim() === '') continue;
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
    const m = rel.match(/^([^/]+)\/skills\/([^/]+)\/SKILL\.md$/);
    if (!m) continue;
    known.add(`${m[1]}:${m[2]}`);
    const keys = frontmatter(readFileSync(abs, 'utf8'), rel);
    if (keys && keys.name) known.add(`${m[1]}:${keys.name.trim()}`);
  }
  const REF = /\b(vivreal-[a-z-]+):([a-z0-9-]+)\b/g;
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    if (!isPluginFile(rel) || !rel.endsWith('.md')) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      REF.lastIndex = 0;
      let m;
      while ((m = REF.exec(line))) {
        const ref = `${m[1]}:${m[2]}`;
        // `plugin@marketplace` install lines and the marketplace name itself are
        // not skill references.
        if (m[2] === 'vivreal' || line.includes('claude plugin')) continue;
        if (!PLUGIN_DIRS.includes(m[1])) continue;
        if (!known.has(ref)) {
          fail('cross-reference', `${rel}:${i + 1}`, `"${ref}" names no skill that exists`);
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
 * Most agents in this marketplace ship twice: once as `<plugin>/agents/<name>.md` and
 * once as `<plugin>/skills/<name>/SKILL.md`, with the same body. That is deliberate,
 * so the knowledge can load passively without dispatching a subagent, and it is also
 * the repo's own instance of the problem this whole restructure is about: two copies
 * of one thing drift, and the drift is silent.
 *
 * This is a WARNING rather than a failure. Reconciling a pair means choosing which
 * direction to sync, and syncing an agent appendix into a skill changes what loads
 * passively into every matching session. That is a judgement call, not a lint fix.
 */
function ruleMirrorDrift(files) {
  const body = (abs) => {
    const t = readFileSync(abs, 'utf8');
    const end = t.indexOf('\n---', 3);
    return (end < 0 ? t : t.slice(end + 4)).replace(/\r/g, '').trim();
  };
  const agents = new Map();
  const skills = new Map();
  for (const abs of files) {
    const rel = norm(relative(ROOT, abs));
    let m = rel.match(/^([^/]+)\/agents\/(.+)\.md$/);
    if (m) agents.set(`${m[1]}/${m[2]}`, abs);
    m = rel.match(/^([^/]+)\/skills\/([^/]+)\/SKILL\.md$/);
    if (m) skills.set(`${m[1]}/${m[2]}`, abs);
  }
  for (const [key, aAbs] of agents) {
    const sAbs = skills.get(key);
    if (!sAbs) continue;
    const a = body(aAbs);
    const s = body(sAbs);
    if (a === s) continue;
    warn(
      'mirror-drift',
      key,
      `agent body is ${a.length} bytes and its skill mirror is ${s.length} bytes. ` +
        'They are copies of one thing and they have diverged. Decide which is authoritative, ' +
        'then sync, rather than editing one of them again.',
    );
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
    rx: /@hillbombcreations\/(?:site-renderer|schemas|tier-quotas|tenant-placement|site-loader)[^\n`]{0,40}?\bv?\d+\.\d+\.\d+/g,
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

// ------------------------------------------------------------------ the runner
function runAll(files) {
  ruleParse(files);
  ruleManifest();
  ruleAgentTools(files);
  ruleAgentDispatch(files);
  ruleCrossReferences(files);
  ruleMirrorDrift(files);
  ruleCopiedValues(files);
  ruleDashes(files);
  ruleDeletedBehaviour(files);
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
      // The silent one. Five values in this repo were being truncated this way and
      // nothing anywhere reported it.
      rule: 'parse',
      label: 'yaml: a hash that truncates in silence',
      path: join(tmp, 'skills', 'hash-truncation', 'SKILL.md'),
      body:
        '---\nname: hash-truncation\ndescription: the #1 source of bugs, and everything after this is discarded\n---\n\nbody\n',
    },
  ];

  let allCanFail = true;
  try {
    for (const c of cases) {
      failures.length = 0;
      warnings.length = 0;
      mkdirSync(dirname(c.path), { recursive: true });
      writeFileSync(c.path, c.body, 'utf8');

      // Run the REAL rule set, over the real walk, so the self-test exercises the
      // same code path the real run does. Nothing is reimplemented here.
      runAll(walk(ROOT));

      const tripped = failures.some((f) => f.rule === c.rule);
      console.log(
        `  ${tripped ? 'RED   ' : 'GREEN '} ${(c.label || c.rule).padEnd(34)} ` +
          (tripped ? '(correct)' : '(THIS CHECK CANNOT FAIL)'),
      );
      if (!tripped) allCanFail = false;
      rmSync(c.path, { force: true });
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
