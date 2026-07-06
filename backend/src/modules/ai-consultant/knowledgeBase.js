const { DEFAULT_PROJECT_CONFIG } = require('./projectConfig');

const MAESTRO_KNOWLEDGE = DEFAULT_PROJECT_CONFIG;

function findDirection(text = '', projectConfig = DEFAULT_PROJECT_CONFIG) {
  const normalized = text.toLowerCase();
  return projectConfig.directions.find((direction) => {
    return (projectConfig.directionAliases?.[direction] || [direction]).some((alias) => normalized.includes(alias));
  }) || null;
}

module.exports = { MAESTRO_KNOWLEDGE, findDirection };
