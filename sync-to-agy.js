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

  let hasCustomSkills = fs.existsSync(skillsDir);
  let hasCopiedAgentsOrCommands = false;

  // Process agents -> skills
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    agents.forEach(file => {
      const name = path.basename(file, '.md');
      const targetSkillDir = path.join(skillsDir, name);
      
      if (!fs.existsSync(targetSkillDir)) {
        fs.mkdirSync(targetSkillDir, { recursive: true });
      }
      
      const sourceContent = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      fs.writeFileSync(path.join(targetSkillDir, 'SKILL.md'), sourceContent, 'utf8');
      hasCopiedAgentsOrCommands = true;
    });
  }

  // Process commands -> skills (prefixed with cmd- to avoid naming clashes)
  if (fs.existsSync(commandsDir)) {
    const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    commands.forEach(file => {
      const name = 'cmd-' + path.basename(file, '.md');
      const targetSkillDir = path.join(skillsDir, name);
      
      if (!fs.existsSync(targetSkillDir)) {
        fs.mkdirSync(targetSkillDir, { recursive: true });
      }
      
      const sourceContent = fs.readFileSync(path.join(commandsDir, file), 'utf8');
      fs.writeFileSync(path.join(targetSkillDir, 'SKILL.md'), sourceContent, 'utf8');
      hasCopiedAgentsOrCommands = true;
    });
  }

  if (hasCustomSkills || hasCopiedAgentsOrCommands) {
    // Add this skills folder to the list for skills.json (use forward slashes for cross-platform compatibility)
    const relativeSkillsPath = path.relative(vivrealSkillsDir, skillsDir).replace(/\\/g, '/');
    const absoluteSkillsPath = path.join(vivrealSkillsDir, relativeSkillsPath).replace(/\\/g, '/');
    skillsPaths.push(absoluteSkillsPath);
    console.log(`✅ Synced ${plugin.name} skills (${hasCopiedAgentsOrCommands ? 'compiled agents/commands' : 'native skills'})`);
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
