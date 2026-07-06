const AI_CONSULTANT_MODES = Object.freeze({
  RULES: 'rules',
  HYBRID: 'hybrid',
  LLM: 'llm',
});

function loadRuntimeMode(env = process.env) {
  const rawMode = String(env.AI_CONSULTANT_MODE || AI_CONSULTANT_MODES.RULES).toLowerCase();
  const mode = Object.values(AI_CONSULTANT_MODES).includes(rawMode) ? rawMode : AI_CONSULTANT_MODES.RULES;
  const llmEnabled = String(env.AI_CONSULTANT_LLM_ENABLED || 'false') === 'true';

  return {
    mode,
    llmEnabled,
    rulesOnly: mode === AI_CONSULTANT_MODES.RULES || !llmEnabled,
    externalAiRequired: mode === AI_CONSULTANT_MODES.LLM || (mode === AI_CONSULTANT_MODES.HYBRID && llmEnabled),
    paidAiRequired: mode === AI_CONSULTANT_MODES.LLM || (mode === AI_CONSULTANT_MODES.HYBRID && llmEnabled),
  };
}

module.exports = { AI_CONSULTANT_MODES, loadRuntimeMode };
