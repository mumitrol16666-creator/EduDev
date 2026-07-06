const { AI_CONSULTANT_MODES } = require('./runtimeMode');

function llmFallbackDecision({ runtime = {}, classification = {}, result = {} }) {
  const reason = result.reason || result.error || 'unknown error';
  const strictLlmMode = runtime.mode === AI_CONSULTANT_MODES.LLM;
  const risky = Boolean(classification.escalate);
  const shouldHandoff = strictLlmMode || risky;

  return {
    reason,
    shouldHandoff,
    noteType: shouldHandoff ? 'llm_fallback_handoff' : 'llm_fallback',
    taskPriority: shouldHandoff ? 'high' : 'medium',
    taskTitle: strictLlmMode
      ? 'AI API недоступен: ответить клиенту вручную'
      : 'Проверить AI fallback по WhatsApp',
    suppressAutoReply: strictLlmMode,
    reply: strictLlmMode
      ? 'Спасибо, я передам сообщение администратору, чтобы он ответил точно.'
      : null,
  };
}

module.exports = { llmFallbackDecision };
