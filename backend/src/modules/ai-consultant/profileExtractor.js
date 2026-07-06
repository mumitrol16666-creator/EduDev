const { findDirection } = require('./knowledgeBase');
const { DEFAULT_PROJECT_CONFIG } = require('./projectConfig');

function extractClientProfile(text = '', projectConfig = DEFAULT_PROJECT_CONFIG) {
  const normalized = String(text || '').toLowerCase();
  const profile = {};
  const direction = findDirection(text, projectConfig);
  if (direction) profile.direction = direction;

  const ageMatch = normalized.match(/(?:сыну|дочк[еи]|ребенку|ребёнку|мне)?\s*(\d{1,2})\s*(?:год|лет|года)/);
  if (ageMatch) profile.studentAge = Number(ageMatch[1]);

  if (matches(normalized, ['для ребенка', 'для ребёнка', 'сын', 'доч', 'ребенку', 'ребёнку'])) {
    profile.customerType = 'child';
  } else if (matches(normalized, ['для себя', 'мне ', 'я хочу', 'сам хочу', 'сама хочу'])) {
    profile.customerType = 'adult';
  }

  if (matches(normalized, ['вечер', 'после школы', 'после работы'])) profile.preferredTime = 'evening';
  if (matches(normalized, ['утро', 'с утра'])) profile.preferredTime = 'morning';
  if (matches(normalized, ['выходн', 'суббот', 'воскрес'])) profile.preferredTime = 'weekend';
  if (matches(normalized, ['будни', 'будний'])) profile.preferredTime = 'weekday';

  if (matches(normalized, ['уверенн', 'стесня', 'раскрепост'])) profile.goal = 'confidence';
  if (matches(normalized, ['научиться', 'с нуля', 'начина'])) profile.goal = 'learn_from_scratch';
  if (matches(normalized, ['конкурс', 'экзамен', 'поступ'])) profile.goal = 'preparation';
  if (matches(normalized, ['хобби', 'для души'])) profile.goal = 'hobby';

  return profile;
}

function profileSummary(profile = {}) {
  const labels = {
    direction: 'направление',
    studentAge: 'возраст',
    customerType: 'клиент',
    preferredTime: 'удобное время',
    goal: 'цель',
  };
  return Object.entries(profile)
    .map(([key, value]) => `${labels[key] || key}: ${humanProfileValue(key, value)}`)
    .join('; ');
}

function parseProfileSummary(text = '') {
  const profile = {};
  const body = String(text).replace(/^.*AI-портрет из WhatsApp:\s*/i, '');
  for (const part of body.split(';')) {
    const [rawKey, ...rawValueParts] = part.split(':');
    const key = rawKey?.trim();
    const value = rawValueParts.join(':').trim();
    if (!key || !value) continue;
    if (key === 'направление') profile.direction = value;
    if (key === 'возраст') profile.studentAge = Number(value) || undefined;
    if (key === 'клиент') profile.customerType = reverseHumanValue('customerType', value);
    if (key === 'удобное время') profile.preferredTime = reverseHumanValue('preferredTime', value);
    if (key === 'цель') profile.goal = reverseHumanValue('goal', value);
  }
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
}

function humanProfileValue(key, value) {
  const maps = {
    customerType: {
      child: 'ребенок',
      adult: 'взрослый',
    },
    preferredTime: {
      evening: 'вечер',
      morning: 'утро',
      weekend: 'выходные',
      weekday: 'будни',
    },
    goal: {
      confidence: 'уверенность',
      learn_from_scratch: 'обучение с нуля',
      preparation: 'подготовка',
      hobby: 'для души',
    },
  };
  return maps[key]?.[value] || value;
}

function reverseHumanValue(key, value) {
  const maps = {
    customerType: {
      ребенок: 'child',
      взрослый: 'adult',
    },
    preferredTime: {
      вечер: 'evening',
      утро: 'morning',
      выходные: 'weekend',
      будни: 'weekday',
    },
    goal: {
      уверенность: 'confidence',
      'обучение с нуля': 'learn_from_scratch',
      подготовка: 'preparation',
      'для души': 'hobby',
    },
  };
  return maps[key]?.[value] || value;
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

module.exports = { extractClientProfile, profileSummary, parseProfileSummary, humanProfileValue };
