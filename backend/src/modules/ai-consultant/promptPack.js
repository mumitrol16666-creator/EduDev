const fs = require('fs');
const path = require('path');

const DEFAULT_CORE_PROMPT_DIR = path.join(__dirname, 'prompts');
const DEFAULT_PROMPT_DIR = DEFAULT_CORE_PROMPT_DIR;
const REQUIRED_PROJECT_PROMPTS = Object.freeze([
  'business_profile',
  'sales_playbook',
  'faq',
  'guardrails',
]);

class PromptPack {
  constructor(options = {}) {
    this.coreDir = options.coreDir || DEFAULT_CORE_PROMPT_DIR;
    this.projectDir = options.projectDir
      || process.env.AI_CONSULTANT_PROJECT_PROMPT_DIR
      || process.env.AI_CONSULTANT_PROMPT_DIR
      || '';
  }

  listPrompts() {
    return [
      ...this.listCorePrompts(),
      ...this.listProjectPrompts(),
    ];
  }

  listCorePrompts() {
    return listMarkdownPrompts(this.coreDir, 'core');
  }

  listProjectPrompts() {
    return this.projectDir ? listMarkdownPrompts(this.projectDir, 'project') : [];
  }

  audit() {
    const core = this.listCorePrompts();
    const project = this.listProjectPrompts();
    const projectIds = new Set(project.map((prompt) => prompt.id));
    const missingProjectPrompts = REQUIRED_PROJECT_PROMPTS.filter((id) => !projectIds.has(id));
    return {
      ok: core.length > 0,
      corePrompts: core.length,
      projectPrompts: project.length,
      totalPrompts: core.length + project.length,
      projectPromptDir: this.projectDir || null,
      requiredProjectPrompts: REQUIRED_PROJECT_PROMPTS,
      missingProjectPrompts,
      projectReady: missingProjectPrompts.length === 0,
      warnings: [
        project.length ? null : 'No project prompt pack configured yet',
        missingProjectPrompts.length ? `Missing project prompts: ${missingProjectPrompts.join(', ')}` : null,
      ].filter(Boolean),
      errors: core.length ? [] : ['Core prompt pack is missing'],
    };
  }

  systemPrompt(projectConfig) {
    const core = this.listCorePrompts();
    const project = this.listProjectPrompts();
    const coreBody = core.map(formatPrompt).join('\n\n');
    const projectBody = project.map(formatPrompt).join('\n\n');
    return [
      `Ты AI-консультант проекта "${projectConfig.brandName}".`,
      'Ядро ниже универсальное. Конкретная сфера бизнеса задается только project prompt pack и базой знаний.',
      'Не придумывай нишевые правила, цены, возражения, гарантии или условия вне переданного контекста.',
      'Отвечай коротко, по-человечески, без давления. Один главный вопрос за раз.',
      'CRM-действия не выполняй сам: предложи crmActions, backend отдельно проверит и выполнит только разрешенное.',
      'Верни строго JSON по output contract: reply, note, noteType, nextAction, confidence, handoffRequired, crmActions, reminderPlan.',
      '# Core Prompt Pack',
      coreBody,
      projectBody ? '# Project Prompt Pack' : '',
      projectBody,
    ].filter(Boolean).join('\n\n');
  }
}

function listMarkdownPrompts(dir, scope) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => {
        const fullPath = path.join(dir, file);
        return {
          id: file.replace(/\.md$/, ''),
          file,
          scope,
          body: fs.readFileSync(fullPath, 'utf8').trim(),
        };
      });
}

function formatPrompt(prompt) {
  return `## ${prompt.scope}:${prompt.id}\n${prompt.body}`;
}

module.exports = {
  PromptPack,
  DEFAULT_PROMPT_DIR,
  DEFAULT_CORE_PROMPT_DIR,
  REQUIRED_PROJECT_PROMPTS,
};
