const fs = require("fs");
const path = require("path");

function loadSkills(skillsDir = path.join(__dirname, "skills"), dependencies = {}) {
  const absoluteDir = path.resolve(skillsDir);

  const files = fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".js"))
    .sort();

  const skills = {};

  for (const file of files) {
    const skillFactory = require(path.join(absoluteDir, file));
    const skill = typeof skillFactory === "function" ? skillFactory(dependencies) : skillFactory;

    if (!skill || !skill.name || typeof skill.run !== "function") {
      throw new Error(`Invalid skill module: ${file}`);
    }

    skills[skill.name] = skill;
  }

  return skills;
}

module.exports = { loadSkills };
