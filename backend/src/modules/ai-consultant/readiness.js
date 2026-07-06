async function aiConsultantReadiness({ crm, service, greenApiClient, env = process.env }) {
  const checks = [];
  const add = (name, ok, details = {}) => checks.push({ name, ok: Boolean(ok), ...details });

  const knowledgeDocuments = service.searchKnowledge('оплата урок пробный направление').length;
  const trialSlots = service.availableTrialSlots(null).length;
  const promptAudit = service.promptPack?.audit?.() || {
    ok: false,
    corePrompts: 0,
    projectPrompts: 0,
    totalPrompts: 0,
    warnings: [],
    errors: ['Prompt pack is unavailable'],
  };
  const contentAudit = service.contentAudit ? service.contentAudit() : { ok: true, errors: 0, warnings: 0 };
  const users = await crm.store.all('users');
  const hasManager = users.some((user) => ['manager', 'sales_lead', 'supervisor', 'owner'].includes(user.role) && user.status !== 'inactive');

  add('module_enabled', String(env.AI_CONSULTANT_ENABLED || 'true') !== 'false');
  add('webhook_token', Boolean(env.AI_CONSULTANT_WEBHOOK_TOKEN), {
    severity: env.NODE_ENV === 'production' ? 'error' : 'warning',
    message: env.AI_CONSULTANT_WEBHOOK_TOKEN ? 'Webhook token configured' : 'Set AI_CONSULTANT_WEBHOOK_TOKEN before exposing webhook publicly',
  });
  add('green_api_credentials', Boolean(greenApiClient?.enabled), {
    severity: 'warning',
    message: greenApiClient?.enabled ? 'Green API sending enabled' : 'Dry-run mode: messages are not sent to WhatsApp',
  });
  add('runtime_mode', service.runtime?.mode === 'rules' || Boolean(service.runtime?.llmEnabled), {
    mode: service.runtime?.mode || 'rules',
    llmEnabled: Boolean(service.runtime?.llmEnabled),
    rulesOnly: Boolean(service.runtime?.rulesOnly ?? true),
    paidAiRequired: Boolean(service.runtime?.paidAiRequired),
    severity: 'error',
    message: service.runtime?.rulesOnly
      ? 'Rules-only mode: no external paid AI API is required'
      : 'LLM mode requires an external AI adapter and API credentials',
  });
  add('project_adapter', Boolean(service.projectAdapter?.id), {
    projectId: service.projectAdapter?.id,
    crmMapping: service.projectAdapter?.crmMapping,
    paths: service.projectAdapter?.paths,
    message: service.projectAdapter?.id
      ? 'Project adapter is configured'
      : 'Project adapter is missing',
  });
  add('channel_policy', Boolean(service.channelPolicy?.mode), {
    mode: service.channelPolicy?.mode,
    transport: service.channelPolicy?.transport,
    outboundPolicy: service.channelPolicy?.outboundPolicy,
    riskLevel: service.channelPolicy?.riskLevel,
    maxParts: service.channelPolicy?.maxParts,
    maxLength: service.channelPolicy?.maxLength,
    severity: service.channelPolicy?.riskLevel === 'medium_high' ? 'warning' : 'warning',
    message: `Channel mode: ${service.channelPolicy?.mode || 'unknown'}`,
  });
  add('prompt_pack', promptAudit.ok, {
    corePrompts: promptAudit.corePrompts,
    projectPrompts: promptAudit.projectPrompts,
    totalPrompts: promptAudit.totalPrompts,
    projectPromptDir: promptAudit.projectPromptDir,
    requiredProjectPrompts: promptAudit.requiredProjectPrompts,
    missingProjectPrompts: promptAudit.missingProjectPrompts,
    projectReady: promptAudit.projectReady,
    warnings: promptAudit.warnings,
    errors: promptAudit.errors,
    message: promptAudit.ok ? 'AI-core prompt pack is available' : 'Core prompt pack is missing',
  });
  add('project_prompt_pack', promptAudit.projectReady || !service.runtime?.llmEnabled, {
    severity: service.runtime?.llmEnabled ? 'error' : 'warning',
    projectPrompts: promptAudit.projectPrompts,
    requiredProjectPrompts: promptAudit.requiredProjectPrompts,
    missingProjectPrompts: promptAudit.missingProjectPrompts,
    projectReady: promptAudit.projectReady,
    message: promptAudit.projectReady
      ? 'Project prompt pack is complete'
      : 'Project prompt pack is incomplete; add required prompts before production LLM use',
  });
  add('llm_adapter', !service.runtime?.llmEnabled || Boolean(service.aiCore?.available?.()), {
    severity: service.runtime?.llmEnabled ? 'error' : 'warning',
    message: service.runtime?.llmEnabled
      ? 'LLM is enabled and adapter is configured'
      : 'LLM is disabled; deterministic fallback routes are active',
  });
  add('cron_token', Boolean(env.AI_CONSULTANT_CRON_TOKEN), {
    severity: env.NODE_ENV === 'production' ? 'error' : 'warning',
    message: env.AI_CONSULTANT_CRON_TOKEN ? 'Cron token configured' : 'Set AI_CONSULTANT_CRON_TOKEN before enabling reminder dispatch endpoint',
  });
  add('admin_token', Boolean(env.AI_CONSULTANT_ADMIN_TOKEN || env.AI_CONSULTANT_CRON_TOKEN), {
    severity: env.NODE_ENV === 'production' ? 'error' : 'warning',
    message: env.AI_CONSULTANT_ADMIN_TOKEN || env.AI_CONSULTANT_CRON_TOKEN
      ? 'Admin diagnostics token configured'
      : 'Set AI_CONSULTANT_ADMIN_TOKEN before exposing readiness, analytics and content audit',
  });
  add('knowledge_base', knowledgeDocuments > 0, {
    count: knowledgeDocuments,
    message: knowledgeDocuments > 0 ? 'Knowledge search returns documents' : 'Knowledge base is empty or not searchable',
  });
  add('trial_slots', trialSlots > 0, {
    count: trialSlots,
    message: trialSlots > 0 ? 'Trial slots are available' : 'No trial slots configured',
  });
  add('content_audit', contentAudit.ok, {
    errors: contentAudit.errors,
    warnings: contentAudit.warnings,
    message: contentAudit.ok ? 'Knowledge and slot content passed audit' : 'Knowledge or slot content has blocking audit errors',
  });
  add('manager_available', hasManager, {
    message: hasManager ? 'Manager/supervisor user exists' : 'Create at least one active manager/supervisor/owner user',
  });
  add('test_endpoints_disabled_in_production', env.NODE_ENV !== 'production' || String(env.AI_CONSULTANT_TEST_ENDPOINTS || 'false') !== 'true', {
    severity: 'warning',
    message: env.NODE_ENV === 'production' && String(env.AI_CONSULTANT_TEST_ENDPOINTS || 'false') === 'true'
      ? 'Disable AI_CONSULTANT_TEST_ENDPOINTS in production'
      : 'Test endpoint exposure is acceptable for this environment',
  });

  const failed = checks.filter((check) => !check.ok && check.severity !== 'warning');
  const warnings = checks.filter((check) => !check.ok && check.severity === 'warning');
  return {
    ready: failed.length === 0,
    failed: failed.length,
    warnings: warnings.length,
    checks,
  };
}

module.exports = { aiConsultantReadiness };
