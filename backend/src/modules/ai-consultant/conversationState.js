const CONVERSATION_STATES = Object.freeze({
  COLLECTING_PROFILE: 'collecting_profile',
  OFFERING_TRIAL: 'offering_trial',
  AWAITING_SLOT_CONFIRMATION: 'awaiting_slot_confirmation',
  TRIAL_BOOKED: 'trial_booked',
  HANDOFF: 'handoff',
  CLOSED: 'closed',
});

async function syncConversationState({ crmTools, lead, profile = {}, action = {} }) {
  const state = deriveConversationState({ profile, action });
  if (!state || lead.aiConversationState === state) return { state, lead };
  const updatedLead = await crmTools.updateLead(lead, {
    aiConversationState: state,
    aiConversationStateUpdatedAt: new Date().toISOString(),
  });
  return { state, lead: updatedLead };
}

function deriveConversationState({ profile = {}, action = {} }) {
  const noteType = action.noteType || '';

  if (['opt_out', 'opt_out_suppressed'].includes(noteType)) return CONVERSATION_STATES.CLOSED;
  if (noteType === 'trial_booking_confirmed') return CONVERSATION_STATES.TRIAL_BOOKED;
  if (action.handoffRequired || noteType.includes('handoff') || [
    'payment_dispute',
    'payment_check',
    'lesson_reschedule',
    'trial_booking_missing_slot',
    'voice_message',
    'llm_fallback_handoff',
  ].includes(noteType)) {
    return CONVERSATION_STATES.HANDOFF;
  }
  if (noteType === 'trial_lesson' && String(action.note || '').includes('Предложенные слоты:')) {
    return CONVERSATION_STATES.AWAITING_SLOT_CONFIRMATION;
  }
  if (['trial_next_action_created'].includes(noteType)) return CONVERSATION_STATES.OFFERING_TRIAL;
  if (isProfileComplete(profile)) return CONVERSATION_STATES.OFFERING_TRIAL;
  if (hasProfileSignal(profile) || ['sales_qualification', 'price_question'].includes(noteType)) {
    return CONVERSATION_STATES.COLLECTING_PROFILE;
  }
  return CONVERSATION_STATES.COLLECTING_PROFILE;
}

function isProfileComplete(profile = {}) {
  return Boolean(
    profile.direction
    && (profile.studentAge || profile.customerType)
    && profile.goal
    && profile.preferredTime,
  );
}

function hasProfileSignal(profile = {}) {
  return Boolean(profile.direction || profile.studentAge || profile.customerType || profile.goal || profile.preferredTime);
}

module.exports = { CONVERSATION_STATES, deriveConversationState, syncConversationState };
