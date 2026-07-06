const fs = require('fs');
const path = require('path');
const { REQUIRED_PROJECT_PROMPTS } = require('./promptPack');

const TEMPLATE_DIR = path.join(__dirname, 'prompt-templates');
const DEFAULT_PROJECTS_DIR = path.join(__dirname, '../../../examples/ai-consultant');

function scaffoldAiConsultantProject(options = {}) {
  const id = normalizeProjectId(options.id || options.projectId || 'new-project');
  const name = String(options.name || id).trim();
  const baseDir = options.baseDir || DEFAULT_PROJECTS_DIR;
  const projectDir = path.join(baseDir, id);
  const promptsDir = path.join(projectDir, 'prompts');
  const force = Boolean(options.force);

  fs.mkdirSync(promptsDir, { recursive: true });

  const created = [];
  const skipped = [];
  for (const promptId of REQUIRED_PROJECT_PROMPTS) {
    const source = path.join(TEMPLATE_DIR, `${promptId}.md`);
    const target = path.join(promptsDir, `${promptId}.md`);
    if (fs.existsSync(target) && !force) {
      skipped.push(relativePath(target));
      continue;
    }
    fs.copyFileSync(source, target);
    created.push(relativePath(target));
  }

  const readmePath = path.join(projectDir, 'README.md');
  if (!fs.existsSync(readmePath) || force) {
    fs.writeFileSync(readmePath, projectReadme({ id, name, promptsDir }));
    created.push(relativePath(readmePath));
  } else {
    skipped.push(relativePath(readmePath));
  }

  return {
    id,
    name,
    projectDir,
    promptsDir,
    created,
    skipped,
    env: {
      AI_CONSULTANT_PROJECT_ID: id,
      AI_CONSULTANT_PROJECT_PROMPT_DIR: promptsDir,
    },
  };
}

function normalizeProjectId(value) {
  return String(value || 'new-project')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-project';
}

function projectReadme({ id, name, promptsDir }) {
  return [
    `# ${name} AI Consultant Project Pack`,
    '',
    'Заполните файлы в `prompts/` под конкретную деятельность.',
    '',
    'Подключение:',
    '',
    '```bash',
    `AI_CONSULTANT_PROJECT_ID=${id}`,
    `AI_CONSULTANT_PROJECT_PROMPT_DIR=${promptsDir}`,
    '```',
    '',
    'Обязательные файлы:',
    ...REQUIRED_PROJECT_PROMPTS.map((promptId) => `- prompts/${promptId}.md`),
    '',
  ].join('\n');
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}

module.exports = { scaffoldAiConsultantProject, DEFAULT_PROJECTS_DIR };
