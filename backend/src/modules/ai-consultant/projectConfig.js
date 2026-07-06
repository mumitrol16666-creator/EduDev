const DEFAULT_PROJECT_CONFIG = Object.freeze({
  id: 'maestro',
  schoolName: 'школы Маэстро',
  brandName: 'Маэстро',
  city: 'Актобе',
  crm: {
    direction: 'edutech',
    niche: 'music_school',
  },
  directions: ['вокал', 'фортепиано', 'гитара', 'актерское мастерство', 'танцы'],
  directionAliases: {
    вокал: ['вокал', 'петь', 'пение'],
    фортепиано: ['фортепиано', 'пианино', 'клавиш'],
    гитара: ['гитара', 'гитаре', 'гитару', 'гитар'],
    'актерское мастерство': ['актер', 'актёр', 'сценическ'],
    танцы: ['танцы', 'танец', 'танцев'],
  },
  trialLesson: 'пробный урок',
  tone: 'Дружелюбно, коротко, без давления, один вопрос за раз.',
  guardrails: [
    'Не выдумывать цены, расписание, преподавателей, скидки и условия.',
    'Не подтверждать оплату без проверки администратором.',
    'Просьбу о человеке, жалобу, спор по оплате или перенос передавать менеджеру.',
    'Не писать клиенту после явного отказа от сообщений.',
  ],
});

function loadProjectConfig(env = process.env) {
  return {
    ...DEFAULT_PROJECT_CONFIG,
    id: env.AI_CONSULTANT_PROJECT_ID || DEFAULT_PROJECT_CONFIG.id,
    schoolName: env.AI_CONSULTANT_SCHOOL_NAME || DEFAULT_PROJECT_CONFIG.schoolName,
    brandName: env.AI_CONSULTANT_BRAND_NAME || DEFAULT_PROJECT_CONFIG.brandName,
    city: env.AI_CONSULTANT_CITY || DEFAULT_PROJECT_CONFIG.city,
    crm: {
      ...DEFAULT_PROJECT_CONFIG.crm,
      direction: env.AI_CONSULTANT_CRM_DIRECTION || DEFAULT_PROJECT_CONFIG.crm.direction,
      niche: env.AI_CONSULTANT_CRM_NICHE || DEFAULT_PROJECT_CONFIG.crm.niche,
      leadSource: env.AI_CONSULTANT_LEAD_SOURCE || 'whatsapp_green_api',
    },
    directions: env.AI_CONSULTANT_DIRECTIONS
      ? env.AI_CONSULTANT_DIRECTIONS.split(',').map((item) => item.trim()).filter(Boolean)
      : DEFAULT_PROJECT_CONFIG.directions,
  };
}

module.exports = { DEFAULT_PROJECT_CONFIG, loadProjectConfig };
