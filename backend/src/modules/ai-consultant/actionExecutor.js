const { ALLOWED_AI_ACTIONS } = require('./actionContract');
const { syncAiLeadProfile } = require('./leadProfile');
const { activateHumanHandoff } = require('./handoffManager');
const { createReminderTask } = require('./reminderPlanner');

async function executeAiActions({ crmTools, lead, profile = {}, crmActions = [], reminderPlan = null, handoffRequired = false, sourceText = '' }) {
  const actions = [...crmActions];
  if (reminderPlan) {
    actions.push({
      type: ALLOWED_AI_ACTIONS.PLAN_REMINDER,
      reason: 'AI proposed reminderPlan',
      priority: 'medium',
      payload: reminderPlan,
    });
  }
  if (handoffRequired && !actions.some((action) => action.type === ALLOWED_AI_ACTIONS.SET_HANDOFF)) {
    actions.push({
      type: ALLOWED_AI_ACTIONS.SET_HANDOFF,
      reason: 'AI requested human handoff',
      priority: 'high',
      payload: {},
    });
  }

  const results = [];
  for (const action of actions.slice(0, 5)) {
    results.push(await executeOne({ crmTools, lead, profile, action, sourceText }));
  }
  return results;
}

async function executeOne({ crmTools, lead, profile, action, sourceText }) {
  try {
    if (action.type === ALLOWED_AI_ACTIONS.ADD_NOTE) {
      const text = action.payload.text || action.reason || 'AI предложил заметку без текста';
      const note = await crmTools.addLeadNote(lead, action.payload.noteType || 'ai_action_note', String(text));
      return ok(action, { noteId: note.id });
    }

    if (action.type === ALLOWED_AI_ACTIONS.CREATE_TASK) {
      const title = String(action.payload.title || action.reason || 'Проверить AI-рекомендацию').slice(0, 160);
      const description = [
        action.reason ? `Причина: ${action.reason}` : null,
        action.payload.description ? `Описание: ${action.payload.description}` : null,
        sourceText ? `Сообщение клиента: ${sourceText}` : null,
      ].filter(Boolean).join('\n');
      const task = await crmTools.createHumanTask(lead, title, action.priority, description);
      return ok(action, { taskId: task?.id || null });
    }

    if (action.type === ALLOWED_AI_ACTIONS.UPDATE_PROFILE) {
      const nextProfile = {
        ...profile,
        ...fromAiProfilePayload(action.payload.profile || action.payload),
      };
      const updated = await syncAiLeadProfile(crmTools, lead, nextProfile);
      return ok(action, { leadId: updated?.id || lead.id });
    }

    if (action.type === ALLOWED_AI_ACTIONS.SET_HANDOFF) {
      await activateHumanHandoff(crmTools, lead, action.reason || sourceText || 'AI requested handoff');
      const task = await crmTools.createHumanTask(
        lead,
        action.payload.title || 'Взять AI-диалог на себя',
        action.priority || 'high',
        action.reason || 'AI requested handoff',
      );
      return ok(action, { taskId: task?.id || null });
    }

    if (action.type === ALLOWED_AI_ACTIONS.PLAN_REMINDER) {
      const result = await createReminderTask(crmTools, lead, {
        ...action.payload,
        priority: action.priority,
      });
      return ok(action, { taskId: result.task?.id || null, dedupeKey: result.plan?.dedupeKey || null });
    }

    return skipped(action, 'Unsupported action type');
  } catch (error) {
    return {
      type: action.type,
      ok: false,
      error: error.message,
    };
  }
}

function fromAiProfilePayload(payload = {}) {
  return {
    direction: payload.direction || payload.interest,
    studentAge: payload.studentAge || payload.student_age,
    customerType: payload.customerType || payload.customer_type,
    goal: payload.goal,
    preferredTime: payload.preferredTime || payload.preferred_time,
  };
}

function ok(action, details = {}) {
  return {
    type: action.type,
    ok: true,
    reason: action.reason || '',
    ...details,
  };
}

function skipped(action, reason) {
  return {
    type: action.type,
    ok: false,
    skipped: true,
    reason,
  };
}

module.exports = { executeAiActions };
