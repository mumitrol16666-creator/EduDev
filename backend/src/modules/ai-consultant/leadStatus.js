const AI_LEAD_STATUSES = Object.freeze({
  NEW: 'new',
  QUALIFIED: 'qualified',
  WARM: 'warm',
  TRIAL_BOOKED: 'trial_booked',
  HUMAN_NEEDED: 'human_needed',
  OPT_OUT: 'opt_out',
});

const TERMINAL_STATUSES = new Set([AI_LEAD_STATUSES.OPT_OUT]);

async function updateAiLeadStatus(crmTools, lead, status, details = {}) {
  if (!lead || !status) return lead;
  if (lead.aiStatus === status) return lead;
  if (TERMINAL_STATUSES.has(lead.aiStatus) && status !== lead.aiStatus) return lead;

  const patch = {
    aiStatus: status,
    aiStatusUpdatedAt: new Date().toISOString(),
  };
  if (details.nextAction) patch.aiNextAction = details.nextAction;
  if (details.summary) patch.aiSummary = details.summary;

  return await crmTools.updateLead(lead, patch);
}

function profileAiStatus(profile = {}, nextAction = {}) {
  if (nextAction.ready) return AI_LEAD_STATUSES.QUALIFIED;
  if (profile.direction || profile.studentAge || profile.customerType || profile.goal || profile.preferredTime) {
    return AI_LEAD_STATUSES.NEW;
  }
  return AI_LEAD_STATUSES.NEW;
}

module.exports = { AI_LEAD_STATUSES, updateAiLeadStatus, profileAiStatus };
