// Run: node --test vivreal-infra/hooks/lambda-env-guard.test.cjs
// ALLOW and REFUSE controls for lambda-env-guard.cjs, for the four false positives in the
// November release plan (T2): log reads that name /aws/lambda/, PowerShell backticks,
// $VAR inside a quoted value, and scripts that use the word lambda beside a brace. Each
// spawns the real hook with a real stdin payload, as Claude Code runs it. The last block is
// the agent profile check (release A, K-3, backlog T3): REFUSE and ALLOW with
// VIVREAL_AGENT_PROFILES set, and every REFUSE command again with it unset, where the hook
// must judge exactly as it did before the check existed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const HOOK = path.join(__dirname, 'lambda-env-guard.cjs');
// Built from their codes, so no string escaping can quietly change what a case holds.
const BS = String.fromCharCode(92);
const BT = String.fromCharCode(96);

// Scratch home directories, so the runner's own ~/.aws/cli/alias never decides a case. Node
// resolves the home from HOME on POSIX and USERPROFILE on Windows, so both are set.
const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-envguard-home-'));
const aliasHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-envguard-alias-'));
fs.mkdirSync(path.join(aliasHome, '.aws', 'cli'), { recursive: true });
fs.writeFileSync(path.join(aliasHome, '.aws', 'cli', 'alias'), [
  '[toplevel]',
  'probefc = lambda get-function-configuration',
  'fcsafe = lambda get-function-configuration --query LastModified',
  'shellfc = !f() {',
  '    aws lambda get-function --function-name "$1"',
  '  }; f',
  '',
  'leakfc = lambda get-function-configuration --profile ALIASBODYMARKER',
  'adminls = s3 ls --profile ALIASPROFILEMARKER',
  '',
  '[command lambda]',
  'fc = get-function-configuration',
  '',
  '[command cloudcontrol]',
  'cc = get-resource --type-name AWS::Lambda::Function',
  '',
].join('\n'));
const ALIAS_BODY_MARKER = 'ALIASBODYMARKER';
const ALIAS_PROFILE_MARKER = 'ALIASPROFILEMARKER';
test.after(() => {
  fs.rmSync(emptyHome, { recursive: true, force: true });
  fs.rmSync(aliasHome, { recursive: true, force: true });
});

// `profiles` is the hook's VIVREAL_AGENT_PROFILES. Undefined removes it, so the runner's own
// setting (an operator turns it on after the agent roles are proven) never decides a case.
function verdict(tool, command, home = emptyHome, profiles = undefined) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.VIVREAL_AGENT_PROFILES;
  if (profiles !== undefined) env.VIVREAL_AGENT_PROFILES = profiles;
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command } }),
    encoding: 'utf8',
    env,
  });
  if (res.status === 0) return { refused: false, why: '' };
  assert.equal(res.status, 2, 'the hook exits 0 (allow) or 2 (refuse), got ' + res.status + ': ' + res.stderr);
  return { refused: true, why: res.stderr };
}

const ALLOW = [
  // 1. Log reads that name /aws/lambda/ (a log group is one word, not the lambda service).
  ['Bash', 'aws logs tail /aws/lambda/VR-CMS-API-fn --since 1h > logs' + BS + 'cms.txt'],
  ['Bash', 'aws logs describe-log-streams --log-group-name /aws/lambda/{fn-a,fn-b}'],
  ['PowerShell', 'aws logs filter-log-events --log-group-name "/aws/lambda/$fn" --query "events[].message" --output text > logs' + BS + 'fn.txt'],
  // 2. PowerShell backticks: an escape inside a double-quoted value.
  ['PowerShell', 'aws lambda get-function-configuration --function-name "fn-' + BT + '$x" --query "keys(Environment.Variables)"'],
  // 3. $VAR inside a quoted value, and after a spelled-out subcommand that is not a read.
  ['Bash', 'aws lambda get-function-configuration --function-name "VR-CMS-API-$STAGE" --query "keys(Environment.Variables)"'],
  ['Bash', 'aws lambda get-function-configuration --function-name "${PREFIX}-fn" --query LastModified'],
  ['Bash', 'aws lambda get-alias --function-name $FN --name live'],
  ['PowerShell', 'aws lambda get-alias --function-name $fn --name live --region $env:AWS_REGION'],
  // 4. Scripts that use the word lambda beside a brace.
  ['Bash', "python - <<'EOF'\nrows = sorted(rows, key=lambda r: r['n'])\nprint({k: v for k, v in rows})\nEOF"],
  ['Bash', 'grep -rn lambda src/ --include=*.{js,ts}'],
];

const REFUSE = [
  // The read the guard exists for, in both shells.
  ['Bash', 'aws lambda get-function-configuration --function-name f'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f'],
  ['Bash', 'aws lambda get-function-configuration --function-name "$FN"'],
  // Whole-word matching still sees a lambda read the shell rewrites.
  ['Bash', 'aws l' + BS + 'ambda get-function --function-name f'],
  ['Bash', 'aws lambda get-{alias,function} --function-name f'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName > out' + BS + 'x.txt ' + BS + '--query @'],
  ['Bash', 'aws cloudcontrol get-resource --type-name AWS::S3::Bucket ' + BS + '--type-name AWS::Lambda::Function --identifier f'],
  // A quoted value that runs a command, or an unquoted one that can split, is still an expansion.
  ['Bash', 'aws lambda get-function-configuration --function-name "$(cat name.txt)" --query LastModified'],
  ['Bash', 'aws lambda get-function-configuration --function-name "' + BT + 'cat name.txt' + BT + '" --query LastModified'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name "$(Get-Name)" --query LastModified'],
  ['Bash', 'aws lambda get-function-configuration --function-name VR-$STAGE --query FunctionName'],
  // "$@" and "${arr[@]}" are double-quoted but expand to SEVERAL words (a second --query among them).
  ['Bash', 'set -- us-east-1 --query @; aws lambda get-function-configuration --function-name f --query FunctionName --region "$@"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${ARGS[@]}"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${!PREFIX@}"'],
  // Review of #63, B-K2-1: quoted shapes that still make several words (proved in real bash).
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${@:1}"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${@/x/y}"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${@-}"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "${!N}"'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f --query FunctionName --region "$($r)"'],
  // B-K2-2: the spelled-subcommand exemption never covers code that runs or a chained command.
  ['Bash', 'aws lambda get-alias --function-name f --name live $(eval "$C" >&2)'],
  ['Bash', 'aws lambda get-alias --function-name f --name live ' + BT + 'eval "$C" >&2' + BT],
  ['Bash', 'aws lambda get-alias --function-name f & $C'],
  ['PowerShell', 'aws lambda get-alias --function-name f & $C'],
  ['PowerShell', 'aws lambda get-alias --function-name f --name live @extra'],
  // Review of #63 pass 2, pre-existing 1: a comment drops the --query that follows it.
  ['Bash', 'aws lambda get-function-configuration --function-name f # --query FunctionName'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f # --query FunctionName'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f <# --query FunctionName #>'],
  // Pre-existing 2: a quoted value after a boolean flag, or after --flag=value, is a whole option.
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --no-paginate "$Q"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --no-cli-pager "${Q}"'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query FunctionName --region=us-east-1 "$Q"'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f --query FunctionName --no-paginate "$Q"'],
  // Pre-existing 3: Windows PowerShell 5.1 can split a quoted variable into several arguments.
  ['PowerShell', 'aws lambda get-function-configuration --function-name "$fn" --query FunctionName'],
  // Pre-existing 4: xargs appends arguments from stdin.
  ['Bash', 'echo --query @ | xargs aws lambda get-function-configuration --function-name f --query FunctionName'],
  ['Bash', "xargs aws lambda get-function-configuration --function-name f --query FunctionName <<< '--query @'"],
  ['PowerShell', "'--query @' | xargs aws lambda get-function-configuration --function-name f --query FunctionName"],
  // Pre-existing 5: -EncodedCommand runs base64 UTF-16LE text the hook must decode and judge.
  ['Bash', 'powershell -EncodedCommand ' + Buffer.from('aws lambda get-function --function-name f', 'utf16le').toString('base64')],
  ['PowerShell', 'pwsh -enc ' + Buffer.from('aws lambda list-functions', 'utf16le').toString('base64')],
  // Pass 2 note 3: a wrapper does not hide the expansion it runs, beside a lambda command.
  ['Bash', 'aws lambda get-alias --function-name f; eval "$C"'],
  ['Bash', 'aws lambda get-alias --function-name f; nohup $C'],
  ['PowerShell', 'aws lambda get-alias --function-name f; . $C'],
  // Review of #63 pass 3, B-K3-1: PowerShell --% hides a %VAR% (a second --query) after it.
  ['PowerShell', "$env:Q='--query=@'; aws lambda get-function-configuration --function-name f --query FunctionName --% %Q%"],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f --query FunctionName --% %Q%'],
  ['PowerShell', 'aws --% lambda get-function-configuration --function-name f --query FunctionName %Q%'],
  ['PowerShell', 'aws --% %SVC% get-function-configuration --function-name f --query FunctionName'],
  // Pass 4 pre-existing: cmd /c expands %Q% the same way, and a hidden program with --%.
  ['Bash', 'cmd /c "aws lambda get-function-configuration --function-name f --query FunctionName %Q%"'],
  ['PowerShell', 'cmd /c "aws lambda get-function-configuration --function-name f --query FunctionName %Q%"'],
  ['PowerShell', '& $a --% %X%'],
  // Pass 5 pre-existing: cmd delayed expansion, and dot-sourcing a variable before --%.
  ['Bash', 'cmd /v:on /c "aws lambda get-function-configuration --function-name f --query FunctionName !Q!"'],
  ['PowerShell', 'cmd /v:on /c "aws lambda get-function-configuration --function-name f --query FunctionName !Q!"'],
  ['PowerShell', '. $a --% %X%'],
  // Pre-existing: a lone & starts a new command, so the read after it is judged on its own.
  ['Bash', 'aws lambda get-function --function-name f --query Code.Location & aws lambda list-functions'],
  ['PowerShell', 'aws lambda get-function --function-name f --query Code.Location & aws lambda list-functions'],
  ['Bash', 'aws lambda get-function-configuration --function-name f --query "$Q"'],
  ['PowerShell', 'aws lambda get-function-configuration --function-name f --query FunctionName --deb' + BT + 'ug'],
  // The subcommand itself hidden, or a read after the spelled-out one.
  ['Bash', 'aws lambda $SUB --function-name f'],
  ['Bash', '$AWS lambda get-function --function-name f'],
  ['Bash', 'aws --profile lambda lambda get-function --function-name f'],
  ['Bash', 'aws lambda get-alias --function-name $FN | xargs aws lambda get-function'],
];

for (const [tool, command] of ALLOW) {
  test('ALLOW [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused, why } = verdict(tool, command);
    assert.equal(refused, false, 'refused a command that reads no function environment:\n' + why);
  });
}

for (const [tool, command] of REFUSE) {
  test('REFUSE [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused } = verdict(tool, command);
    assert.equal(refused, true, 'permitted a command that can print a function environment');
  });
}

test('the case set holds both verdicts and really carries its backslashes and backticks', () => {
  assert.ok(ALLOW.length >= 4 && REFUSE.length >= 4);
  assert.ok(ALLOW.some(([, c]) => c.includes(BS)) && ALLOW.some(([, c]) => c.includes(BT)));
  assert.ok(REFUSE.some(([, c]) => c.includes(BS)) && REFUSE.some(([, c]) => c.includes(BT)));
});

// Review of #63 pass 3, B-K3-2: an AWS CLI alias spells a lambda read under another name.
const ALIAS_REFUSE = [
  ['Bash', 'aws probefc --function-name f'],
  ['PowerShell', 'aws probefc --function-name f'],
  ['Bash', 'aws --region us-east-1 probefc --function-name f'],
  ['Bash', 'aws lambda fc --function-name f'],
  ['PowerShell', 'aws lambda fc --function-name f'],
  ['Bash', 'aws shellfc f'],
  // Review of #63 pass 4, B-K4-2: every alias section counts, not only toplevel and lambda.
  ['Bash', 'aws cloudcontrol cc --identifier f'],
  ['PowerShell', 'aws cloudcontrol cc --identifier f'],
  // Pass 5 note 1: the CLI reached as a Python module.
  ['Bash', 'python -m awscli lambda fc --function-name f'],
];

// Review of #63 pass 5, B-K5-1: every global option before the service, in each form the CLI
// takes (`--opt value`, `--opt=value`, a boolean, an unambiguous prefix), must not hide the
// service from the alias check or the direct check.
const GLOBAL_OPTION_FORMS = [
  '--output json', '--output=text', '--out json', '--query @', '--query=@', '--profile p', '--profile=p',
  '--region us-east-1', '--region=us-east-1', '--endpoint-url https://example.invalid', '--no-paginate',
  '--cli-input-json file://in.json', '--cli-input-yaml=file://in.yaml', '--debug', '--no-verify-ssl',
  '--color off', '--no-cli-pager', '--no-sign-request', '--ca-bundle ca.pem', '--cli-read-timeout 5',
];
const DIRECT_GLOBAL = [];
for (const opt of GLOBAL_OPTION_FORMS) {
  for (const tool of ['Bash', 'PowerShell']) {
    ALIAS_REFUSE.push([tool, 'aws ' + opt + ' lambda fc --function-name f']);
    ALIAS_REFUSE.push([tool, 'aws ' + opt + ' probefc --function-name f']);
    DIRECT_GLOBAL.push([tool, 'aws ' + opt + ' lambda get-function-configuration --function-name f']);
  }
}
// Review of #63 pass 6, B-K6-1: a bare `--` is argparse's end-of-options marker, which the CLI
// drops, so it may sit before the service, after it, or after the alias without changing the read.
const END_OF_OPTIONS = [
  'aws -- probefc --function-name f',
  'aws --region us-east-1 -- probefc --function-name f',
  'aws -- lambda fc --function-name f',
  'aws lambda -- fc --function-name f',
  'aws lambda fc -- --function-name f',
  'aws -- lambda -- fc -- --function-name f',
  'aws --output json -- lambda -- fc --function-name f',
  'aws cloudcontrol -- cc --identifier f',
  'aws probefc -- --function-name f',
];
for (const command of END_OF_OPTIONS) {
  for (const tool of ['Bash', 'PowerShell']) ALIAS_REFUSE.push([tool, command]);
}
for (const command of [
  'aws -- lambda get-function-configuration --function-name f',
  'aws lambda -- get-function-configuration --function-name f',
  'aws lambda get-function-configuration -- --function-name f',
  'aws --region us-east-1 -- lambda -- get-function-configuration --function-name f',
]) {
  for (const tool of ['Bash', 'PowerShell']) DIRECT_GLOBAL.push([tool, command]);
}
for (const [tool, command] of DIRECT_GLOBAL) {
  test('REFUSE global option [' + tool + '] ' + JSON.stringify(command), () => {
    assert.equal(verdict(tool, command).refused, true, 'permitted an unprojected read behind a global option');
  });
}
const ALIAS_ALLOW = [
  ['Bash', 'aws fcsafe --function-name f'],
  ['PowerShell', 'aws fcsafe --function-name f'],
  ['Bash', 'aws sts get-caller-identity --query Arn'],
  // Global options before the service leave a projected read and a projected alias permitted.
  ['Bash', 'aws --output json fcsafe --function-name f'],
  ['PowerShell', 'aws --region us-east-1 --output text lambda get-function-configuration --function-name f --query LastModified'],
  ['Bash', 'aws --no-cli-pager --profile=p lambda get-alias --function-name f --name live'],
];
for (const [tool, command] of ALIAS_REFUSE) {
  test('REFUSE alias [' + tool + '] ' + JSON.stringify(command), () => {
    assert.equal(verdict(tool, command, aliasHome).refused, true, 'permitted a lambda read reached through a CLI alias');
  });
}
for (const [tool, command] of ALIAS_ALLOW) {
  test('ALLOW alias [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused, why } = verdict(tool, command, aliasHome);
    assert.equal(refused, false, 'refused a projected or unrelated command:\n' + why);
  });
}
// Review of #63 pass 4, B-K4-1: a refusal names the alias, never its body.
for (const tool of ['Bash', 'PowerShell']) {
  test('a refused alias never prints its body [' + tool + ']', () => {
    const { refused, why } = verdict(tool, 'aws leakfc --function-name f', aliasHome);
    assert.equal(refused, true, 'permitted a lambda read reached through a CLI alias');
    assert.ok(why.includes('leakfc'), 'the refusal should name the alias');
    assert.ok(!why.includes(ALIAS_BODY_MARKER), 'the refusal printed the alias body:\n' + why);
  });
}

test('alias control: with no alias file the same alias word is not a lambda read', () => {
  assert.equal(verdict('Bash', 'aws probefc --function-name f').refused, false);
});

// The hook's stated limit: a text guardrail for the CLI, never claimed as a boundary.
test('the header states that the hook is not a security boundary and the SDK is out of reach', () => {
  const header = fs.readFileSync(HOOK, 'utf8').split('*/')[0].replace(/\s*\*\s*/g, ' ');
  assert.match(header, /a guardrail against accidental env dumps from the CLI, not a security boundary; code that calls the AWS SDK is out of its reach/);
  assert.match(header, /IAM deny on lambda:GetFunctionConfiguration/);
  assert.match(header, /docs\/agent-permissions-boundary\.md/);
});

// Release A, K-3 (backlog T3): once the agent roles are proven live, the operator sets
// VIVREAL_AGENT_PROFILES, and an AWS CLI command may then name only those profiles.
const AGENT_PROFILES = 'vivreal-agent-ro,vivreal-agent-infra';

const PROFILE_REFUSE = [
  ['Bash', 'aws s3 ls --profile admin'],
  ['PowerShell', 'aws s3 ls --profile admin'],
  ['Bash', 'aws --profile admin sts get-caller-identity'],
  ['Bash', 'aws sts get-caller-identity --profile=admin'],
  ['PowerShell', "aws sts get-caller-identity --profile='admin'"],
  // argparse takes an unambiguous prefix of --profile (no other global option starts --p).
  ['Bash', 'aws --prof admin sts get-caller-identity'],
  ['Bash', 'aws sts get-caller-identity --p admin'],
  ['Bash', 'aws --pro=admin s3 ls'],
  // A profile name spelled wrong is another profile: mixed case, padded, empty, missing.
  ['Bash', 'aws s3 ls --profile Vivreal-Agent-RO'],
  ['Bash', "aws s3 ls --profile ' vivreal-agent-ro'"],
  ['Bash', 'aws s3 ls --profile ""'],
  ['Bash', 'aws s3 ls --profile'],
  // The CLI keeps the last --profile, so an agent profile first proves nothing.
  ['Bash', 'aws s3 ls --profile vivreal-agent-ro --profile admin'],
  // A value this hook cannot read is refused, never guessed.
  ['Bash', 'aws s3 ls --profile "$P"'],
  ['Bash', 'aws s3 ls --profile $P'],
  ['PowerShell', 'aws s3 ls --profile $env:P'],
  ['Bash', 'aws s3 ls --profile "$(cat p.txt)"'],
  // Words the shell rewrites into --profile.
  ['Bash', 'aws s3 ls --prof' + BS + 'ile admin'],
  ['Bash', 'aws s3 ls --pro{file,x} admin'],
  // However the CLI is reached.
  ['Bash', 'aws.exe s3 ls --profile admin'],
  ['Bash', 'python -m awscli s3 ls --profile admin'],
  ['Bash', 'bash -c "aws s3 ls --profile admin"'],
  ['PowerShell', 'powershell -Command "aws s3 ls --profile admin"'],
  ['Bash', 'aws sts get-caller-identity --profile vivreal-agent-ro && aws s3 ls --profile admin'],
  ['PowerShell', "& 'C:/Program Files/Amazon/AWSCLIV2/aws.exe' s3 ls --profile admin"],
];

const PROFILE_ALLOW = [
  ['Bash', 'aws s3 ls --profile vivreal-agent-ro'],
  ['PowerShell', 'aws s3 ls --profile vivreal-agent-ro'],
  ['Bash', 'aws --profile=vivreal-agent-infra cloudformation describe-stacks --stack-name x'],
  ['PowerShell', "aws sts get-caller-identity --profile 'vivreal-agent-infra'"],
  ['Bash', 'aws --prof vivreal-agent-ro sts get-caller-identity'],
  ['Bash', 'aws s3 ls --profile vivreal-agent-ro --region us-east-1'],
  ['Bash', "aws lambda get-function-configuration --function-name f --query LastModified --profile vivreal-agent-ro"],
  // The check refuses a NAMED profile outside the list; a command naming none is not judged here.
  ['Bash', 'aws sts get-caller-identity'],
  // Not the AWS CLI.
  ['Bash', 'docker compose --profile dev up'],
  // A doc append is data written to a file, whatever its text says.
  ['Bash', "cat >> notes.md <<'EOF'\naws s3 ls --profile admin\nEOF"],
];

for (const [tool, command] of PROFILE_REFUSE) {
  test('REFUSE profile [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused } = verdict(tool, command, emptyHome, AGENT_PROFILES);
    assert.equal(refused, true, 'permitted an AWS CLI --profile outside VIVREAL_AGENT_PROFILES');
  });
  // The control that makes "unset means today" a measured claim: the same command, the variable
  // removed, is judged as before the check existed (none of these is a lambda read).
  test('ALLOW profile, variable unset [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused, why } = verdict(tool, command, emptyHome, undefined);
    assert.equal(refused, false, 'with VIVREAL_AGENT_PROFILES unset the hook must behave as before:\n' + why);
  });
}

for (const [tool, command] of PROFILE_ALLOW) {
  test('ALLOW profile [' + tool + '] ' + JSON.stringify(command), () => {
    const { refused, why } = verdict(tool, command, emptyHome, AGENT_PROFILES);
    assert.equal(refused, false, 'refused an agent profile or a command that names none:\n' + why);
  });
}

test('the profile list is read as trimmed, comma separated, exact names', () => {
  const padded = ' vivreal-agent-ro , vivreal-agent-infra ,';
  assert.equal(verdict('Bash', 'aws s3 ls --profile vivreal-agent-infra', emptyHome, padded).refused, false);
  assert.equal(verdict('Bash', 'aws s3 ls --profile admin', emptyHome, padded).refused, true);
});

test('a variable set to nothing allows no --profile at all (fail closed), and leaves other commands alone', () => {
  assert.equal(verdict('Bash', 'aws s3 ls --profile vivreal-agent-ro', emptyHome, '').refused, true);
  assert.equal(verdict('Bash', 'aws s3 ls', emptyHome, '').refused, false);
});

test('an agent profile does not exempt a lambda read from the env check', () => {
  const { refused } = verdict('Bash', 'aws lambda get-function --function-name f --profile vivreal-agent-ro', emptyHome, AGENT_PROFILES);
  assert.equal(refused, true, 'permitted an unprojected lambda read under an agent profile');
});

test('the refusal names the profile and the allowed list, with the profile guidance only', () => {
  const { refused, why } = verdict('Bash', 'aws s3 ls --profile admin', emptyHome, AGENT_PROFILES);
  assert.equal(refused, true);
  assert.match(why, /"admin"/);
  assert.match(why, /VIVREAL_AGENT_PROFILES/);
  assert.match(why, /vivreal-agent-ro, vivreal-agent-infra/);
  assert.match(why, /never retry under another profile/);
  assert.ok(!why.includes('Permitted (an allowlist'), 'a profile refusal printed the lambda query guidance:\n' + why);
});

test('unset, a lambda refusal reads exactly as before: no profile guidance', () => {
  const read = 'aws lambda get-function --function-name f';
  const off = verdict('Bash', read, emptyHome, undefined);
  assert.equal(off.refused, true);
  assert.ok(off.why.includes('Permitted (an allowlist'));
  assert.ok(!off.why.includes('Agent profiles'), 'the profile guidance printed with the check off:\n' + off.why);
  const on = verdict('Bash', read, emptyHome, AGENT_PROFILES);
  assert.ok(on.why.includes('Permitted (an allowlist') && on.why.includes('Agent profiles'));
});

for (const tool of ['Bash', 'PowerShell']) {
  test('a CLI alias that names another profile is refused, and its body is never printed [' + tool + ']', () => {
    const { refused, why } = verdict(tool, 'aws adminls', aliasHome, AGENT_PROFILES);
    assert.equal(refused, true, 'permitted an alias that runs under a profile outside the list');
    assert.ok(why.includes('adminls'), 'the refusal should name the alias');
    assert.ok(!why.includes(ALIAS_PROFILE_MARKER), 'the refusal printed the alias body:\n' + why);
    assert.equal(verdict(tool, 'aws adminls', aliasHome, undefined).refused, false, 'unset, the alias is judged as before');
  });
}
