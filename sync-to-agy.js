const fs = require('fs');
const path = require('path');

// Target paths
const vivrealSkillsDir = __dirname;
const portalDir = path.resolve(vivrealSkillsDir, '../Vivreal_Portal_Mobile');
const marketplacePath = path.join(vivrealSkillsDir, '.claude-plugin', 'marketplace.json');

if (!fs.existsSync(marketplacePath)) {
  console.error('Error: marketplace.json not found. Please run this script from the root of vivreal-skills.');
  process.exit(1);
}

const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
const skillsPaths = [];

console.log('🔄 Syncing Vivreal Claude Code plugins to Antigravity CLI skills...');

marketplace.plugins.forEach(plugin => {
  const pluginDir = path.resolve(vivrealSkillsDir, plugin.source);
  if (!fs.existsSync(pluginDir)) {
    console.warn(`⚠️ Warning: Plugin source directory not found: ${plugin.source}`);
    return;
  }

  const agentsDir = path.join(pluginDir, 'agents');
  const commandsDir = path.join(pluginDir, 'commands');
  const skillsDir = path.join(pluginDir, 'skills');

  // Only REAL skills count: a skill directory holding a SKILL.md. The old check was
  // fs.existsSync(skillsDir), which a generated mirror alone satisfied, so a plugin with
  // agents and no skills of its own was registered as a skills root.
  const hasCustomSkills = fs.existsSync(skillsDir) && fs.readdirSync(skillsDir, { withFileTypes: true })
    .some(d => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')));

  // Every generated mirror (agents AND commands) is written OUTSIDE the plugin tree, under
  // the gitignored .agy/<plugin>/skills/. Inside the plugin, an agent mirror listed each agent
  // a second time as a skill, ran without the agent's tool limits when invoked that way, and
  // spent description tokens on every turn; a cmd-* mirror listed each command twice
  // (vivreal-workflow:reviewer AND vivreal-workflow:cmd-reviewer), because Claude Code already
  // lists every command as a skill. scripts/check-definitions.mjs fails on either in-tree.
  if (!/^[a-z0-9-]+$/.test(plugin.name)) {
    // plugin.name builds a path that is deleted below; refuse anything that could climb out of .agy/.
    throw new Error(`Refusing to sync plugin with unexpected name: ${JSON.stringify(plugin.name)}`);
  }
  const agyPluginDir = path.join(vivrealSkillsDir, '.agy', plugin.name);
  const agyMirrorSkillsDir = path.join(agyPluginDir, 'skills');
  // Start from empty, so a mirror whose agent or command was deleted or renamed does not
  // linger in the Antigravity registry.
  fs.rmSync(agyPluginDir, { recursive: true, force: true });
  let hasMirrors = false;

  // Antigravity does not substitute ${CLAUDE_PLUGIN_ROOT}. A sibling-agent read
  // (`${CLAUDE_PLUGIN_ROOT}/agents/<name>.md`) points at that agent's mirror; any other
  // plugin-root path points at the plugin's own directory.
  const toForward = p => p.replace(/\\/g, '/');
  const forAgy = content => content
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/agents\/([\w-]+)\.md/g,
      (_, agent) => toForward(path.join(agyMirrorSkillsDir, agent, 'SKILL.md')))
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, toForward(pluginDir));

  // Process agents -> skills
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    agents.forEach(file => {
      const name = path.basename(file, '.md');
      const targetSkillDir = path.join(agyMirrorSkillsDir, name);
      
      if (!fs.existsSync(targetSkillDir)) {
        fs.mkdirSync(targetSkillDir, { recursive: true });
      }
      
      const sourceContent = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      fs.writeFileSync(path.join(targetSkillDir, 'SKILL.md'), forAgy(sourceContent), 'utf8');
      hasMirrors = true;
    });
  }

  // Process commands -> skills (prefixed with cmd- so a command never collides with an
  // agent mirror of the same name). Commands that must NOT get a cmd-* skill mirror
  // (promptify ships as a command only, see commit 9168979)
  const EXCLUDED_COMMANDS = new Set(['promptify']);
  if (fs.existsSync(commandsDir)) {
    const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'))
      .filter(f => !EXCLUDED_COMMANDS.has(path.basename(f, '.md')));
    commands.forEach(file => {
      const name = 'cmd-' + path.basename(file, '.md');
      const targetSkillDir = path.join(agyMirrorSkillsDir, name);
      
      if (!fs.existsSync(targetSkillDir)) {
        fs.mkdirSync(targetSkillDir, { recursive: true });
      }
      
      const sourceContent = fs.readFileSync(path.join(commandsDir, file), 'utf8');
      fs.writeFileSync(path.join(targetSkillDir, 'SKILL.md'), forAgy(sourceContent), 'utf8');
      hasMirrors = true;
    });
  }

  if (hasCustomSkills) {
    // Add this skills folder to the list for skills.json (use forward slashes for cross-platform compatibility)
    skillsPaths.push(skillsDir.replace(/\\/g, '/'));
    console.log(`✅ Synced ${plugin.name} native skills`);
  }
  if (hasMirrors) {
    skillsPaths.push(agyMirrorSkillsDir.replace(/\\/g, '/'));
    console.log(`✅ Synced ${plugin.name} agent and command mirrors to .agy/${plugin.name}/skills`);
  }
});

// Update or write skills.json in Vivreal_Portal_Mobile
const portalAgentsDir = path.join(portalDir, '.agents');
if (fs.existsSync(portalAgentsDir)) {
  const skillsJsonPath = path.join(portalAgentsDir, 'skills.json');
  const skillsJsonContent = {
    entries: skillsPaths.map(p => ({ path: p }))
  };

  fs.writeFileSync(skillsJsonPath, JSON.stringify(skillsJsonContent, null, 2), 'utf8');
  console.log(`\n🎉 Successfully updated Antigravity workspace skills registry:`);
  console.log(`   👉 ${skillsJsonPath}`);
} else {
  console.log('\n💡 Active portal workspace .agents directory not found.');
  console.log('   To register these skills in your active workspace, create a `.agents/skills.json` and add:');
  console.log(JSON.stringify({ entries: skillsPaths.map(p => ({ path: p })) }, null, 2));
}
