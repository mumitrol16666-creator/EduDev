const OPT_OUT_MARKER = 'AI opt-out: true';

function hasOptedOut(lead = {}) {
  return String(lead.pain || '').includes(OPT_OUT_MARKER);
}

async function markOptOut(crmTools, lead, reason) {
  await crmTools.appendLeadPain(lead, OPT_OUT_MARKER);
  await crmTools.addLeadNote(lead, 'opt_out', `Клиент отказался от сообщений. Причина/сообщение: ${reason || 'не указано'}`);
  return { optedOut: true };
}

module.exports = { OPT_OUT_MARKER, hasOptedOut, markOptOut };
