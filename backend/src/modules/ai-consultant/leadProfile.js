const { profileSummary, humanProfileValue } = require('./profileExtractor');

function toAiProfile(profile = {}) {
  return Object.fromEntries([
    ['student_age', profile.studentAge],
    ['interest', profile.direction],
    ['customer_type', profile.customerType],
    ['goal', profile.goal],
    ['preferred_time', profile.preferredTime],
  ].filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function aiProfileSummary(profile = {}) {
  if (!Object.keys(profile).length) return '';
  return profileSummary(profile);
}

async function syncAiLeadProfile(crmTools, lead, profile = {}) {
  const aiProfile = toAiProfile(profile);
  if (!Object.keys(aiProfile).length) return lead;

  const previous = lead.aiProfile && typeof lead.aiProfile === 'object' ? lead.aiProfile : {};
  return await crmTools.updateLead(lead, {
    aiProfile: { ...previous, ...aiProfile },
    aiSummary: aiProfileSummary(profile),
  });
}

function aiProfileFieldValue(key, value) {
  const reverseKeys = {
    student_age: 'studentAge',
    interest: 'direction',
    customer_type: 'customerType',
    preferred_time: 'preferredTime',
    goal: 'goal',
  };
  return humanProfileValue(reverseKeys[key] || key, value);
}

module.exports = { toAiProfile, syncAiLeadProfile, aiProfileSummary, aiProfileFieldValue };
