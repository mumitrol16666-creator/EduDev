const HANDOFF_MARKER = 'AI handoff: active';

function isHumanHandoffActive(lead = {}) {
  return String(lead.pain || '').includes(HANDOFF_MARKER);
}

async function activateHumanHandoff(crmTools, lead, reason) {
  await crmTools.appendLeadPain(lead, HANDOFF_MARKER);
  await crmTools.addLeadNote(lead, 'human_handoff', `Диалог передан человеку. Причина: ${reason || 'не указано'}`);
  return { handoff: 'active' };
}

async function releaseHumanHandoff(crmTools, lead, reason) {
  const previousPain = String(lead.pain || '');
  const nextPain = previousPain
    .split('\n')
    .filter((line) => line.trim() !== HANDOFF_MARKER)
    .join('\n');
  await crmTools.updateLead(lead, { pain: nextPain });
  await crmTools.addLeadNote(lead, 'human_handoff_released', `AI handoff снят. Причина: ${reason || 'не указано'}`);
  return { handoff: 'released' };
}

module.exports = { HANDOFF_MARKER, isHumanHandoffActive, activateHumanHandoff, releaseHumanHandoff };
