const { loadProjectConfig } = require('./projectConfig');

function createProjectAdapter(env = process.env, overrides = {}) {
  const config = overrides.projectConfig || loadProjectConfig(env);
  const paths = {
    knowledgeDir: overrides.knowledgeDir || env.AI_CONSULTANT_KNOWLEDGE_DIR || '',
    projectPromptDir: overrides.projectPromptDir || env.AI_CONSULTANT_PROJECT_PROMPT_DIR || env.AI_CONSULTANT_PROMPT_DIR || '',
    trialSlotsFile: overrides.trialSlotsFile || env.AI_CONSULTANT_TRIAL_SLOTS_FILE || '',
  };

  return {
    id: config.id,
    config,
    paths,
    crmMapping: {
      direction: config.crm.direction,
      niche: config.crm.niche,
      leadSource: env.AI_CONSULTANT_LEAD_SOURCE || 'whatsapp_green_api',
    },
    summary() {
      return {
        id: config.id,
        brandName: config.brandName,
        schoolName: config.schoolName,
        city: config.city,
        crm: config.crm,
        directions: config.directions,
        paths,
      };
    },
  };
}

module.exports = { createProjectAdapter };
