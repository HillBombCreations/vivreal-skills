// Run: node --test vivreal-infra/hooks/lambda-env-guard.test.cjs
// ALLOW and REFUSE controls for lambda-env-guard.cjs, for the four false positives in the
// November release plan (T2): log reads that name /aws/lambda/, PowerShell backticks,
// $VAR inside a quoted value, and scripts that use the word lambda beside a brace. Each
// spawns the real hook with a real stdin payload, as Claude Code runs it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, 'lambda-env-guard.cjs');
// Built from their codes, so no string escaping can quietly change what a case holds.
const BS = String.fromCharCode(92);
const BT = String.fromCharCode(96);

function verdict(tool, command) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command } }),
    encoding: 'utf8',
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
