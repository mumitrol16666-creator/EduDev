const INTENTS = Object.freeze({
  VOICE: 'voice',
  OPT_OUT: 'opt_out',
  HUMAN_HANDOFF: 'human_handoff',
  PAYMENT_CHECK: 'payment_check',
  PAYMENT_DISPUTE: 'payment_dispute',
  LESSON_RESCHEDULE: 'lesson_reschedule',
  SLOT_CONFIRMATION: 'slot_confirmation',
  PRICE_QUESTION: 'price_question',
  TRIAL_LESSON: 'trial_lesson',
  SALES_QUALIFICATION: 'sales_qualification',
});

const ESCALATION_INTENTS = new Set([
  INTENTS.VOICE,
  INTENTS.OPT_OUT,
  INTENTS.HUMAN_HANDOFF,
  INTENTS.PAYMENT_CHECK,
  INTENTS.PAYMENT_DISPUTE,
  INTENTS.LESSON_RESCHEDULE,
]);

function classifyIntent(text = '', options = {}) {
  if (options.isAudio) return intent(INTENTS.VOICE, 0.95, 'audio message');
  const lower = String(text || '').toLowerCase();

  if (matches(lower, ['не пишите', 'отпис', 'стоп', 'stop'])) {
    return intent(INTENTS.OPT_OUT, 0.98, 'explicit opt-out');
  }
  if (matches(lower, ['жалоб', 'руг', 'ужас', 'верните деньги', 'возврат', 'перерасчет', 'перерасчёт', 'спор', 'не соглас'])) {
    return intent(INTENTS.PAYMENT_DISPUTE, 0.92, 'complaint or payment dispute');
  }
  if (matches(lower, ['человек', 'админ', 'менеджер', 'оператор', 'позвоните'])) {
    return intent(INTENTS.HUMAN_HANDOFF, 0.9, 'human requested');
  }
  if (matches(lower, ['оплатил', 'оплатили', 'перевел', 'перевели', 'чек'])) {
    return intent(INTENTS.PAYMENT_CHECK, 0.9, 'payment check required');
  }
  if (matches(lower, ['перенести', 'перенос', 'не сможем', 'не придем', 'не придём', 'отменить урок'])) {
    return intent(INTENTS.LESSON_RESCHEDULE, 0.88, 'lesson reschedule');
  }
  if (matches(lower, ['да', 'подходит', 'подойдет', 'подойдёт', 'запишите', 'записывайте', 'берем', 'берём'])) {
    return intent(INTENTS.SLOT_CONFIRMATION, 0.78, 'slot confirmation');
  }
  if (matches(lower, ['цена', 'стоимость', 'сколько', 'прайс'])) {
    return intent(INTENTS.PRICE_QUESTION, 0.82, 'price question');
  }
  if (matches(lower, ['пробн', 'запис', 'урок', 'занят'])) {
    return intent(INTENTS.TRIAL_LESSON, 0.82, 'trial lesson');
  }
  return intent(INTENTS.SALES_QUALIFICATION, 0.6, 'default sales qualification');
}

function shouldEscalate(classification) {
  return ESCALATION_INTENTS.has(classification.intent);
}

function intent(name, confidence, reason) {
  return {
    intent: name,
    confidence,
    reason,
    escalate: ESCALATION_INTENTS.has(name),
  };
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

module.exports = { INTENTS, classifyIntent, shouldEscalate };
