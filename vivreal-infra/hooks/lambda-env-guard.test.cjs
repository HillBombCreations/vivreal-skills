// Run: node --test vivreal-infra/hooks/lambda-env-guard.test.cjs
// ALLOW and REFUSE controls for lambda-env-guard.cjs, for the four false positives in the
// November release plan (T2): log reads that name /aws/lambda/, PowerShell backticks,
// $VAR inside a quoted value, and scripts that use the word lambda beside a brace. Each
// spawns the real hook with a real stdin payload, as Claude Code runs it.
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
  '',
  '[command lambda]',
  'fc = get-function-configuration',
  '',
  '[command cloudcontrol]',
  'cc = get-resource --type-name AWS::Lambda::Function',
  '',
].join('\n'));
const ALIAS_BODY_MARKER = 'ALIASBODYMARKER';
test.after(() => {
  fs.rmSync(emptyHome, { recursive: true, force: true });
  fs.rmSync(aliasHome, { recursive: true, force: true });
});

function verdict(tool, command, home = emptyHome) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
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
