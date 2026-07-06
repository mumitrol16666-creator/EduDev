const { profileSummary } = require('./profileExtractor');

function isProfileReadyForTrial(profile = {}) {
  return Boolean(
    profile.direction
    && (profile.studentAge || profile.customerType)
    && profile.goal
    && profile.preferredTime,
  );
}

function trialNextActionMarker(profile = {}) {
  return [
    'trial_next_action',
    profile.direction || 'unknown_direction',
    profile.studentAge || profile.customerType || 'unknown_customer',
    profile.goal || 'unknown_goal',
    profile.preferredTime || 'unknown_time',
  ].join(':');
}

async function ensureTrialNextAction({ crmTools, lead, profile, slots = [], lastMessage = '' }) {
  if (!isProfileReadyForTrial(profile)) return { ready: false, created: false };

  const marker = trialNextActionMarker(profile);
  const notes = await crmTools.leadNotes(lead);
  const existing = notes.find((note) => {
    return note.type === 'trial_next_action' && String(note.text || '').includes(marker);
  });
  if (existing) return { ready: true, created: false, marker, note: existing };

  const task = await crmTools.createHumanTask(
    lead,
    `Подобрать пробный урок: ${lead.name || lead.phone} (${profile.direction})`,
    'high',
    trialNextActionDescription({ lead, profile, slots, lastMessage }),
  );
  const summary = profileSummary(profile);
  const note = await crmTools.addLeadNote(
    lead,
    'trial_next_action',
    `${marker}\nПрофиль готов к подбору пробного урока: ${summary}`,
  );

  return { ready: true, created: true, marker, note, task };
}

function trialNextActionDescription({ lead, profile, slots = [], lastMessage = '' }) {
  const lines = [
    `Клиент: ${lead.name || 'без имени'}`,
    `Телефон/WhatsApp: ${lead.whatsapp || lead.phone || 'не указан'}`,
    `Профиль: ${profileSummary(profile)}`,
    lastMessage ? `Последнее сообщение: ${lastMessage}` : null,
    slots.length
      ? `Ближайшие слоты: ${slots.map((slot) => `${slot.label} (${slot.id})`).join('; ')}`
      : 'Ближайшие слоты: не найдены, проверить расписание вручную',
    'Действие: связаться с клиентом, подтвердить актуальное время и зафиксировать запись.',
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = {
  isProfileReadyForTrial,
  ensureTrialNextAction,
  trialNextActionMarker,
  trialNextActionDescription,
};
