const { extractClientProfile, parseProfileSummary } = require('./profileExtractor');

async function buildConversationMemory({ crmTools, lead, projectConfig }) {
  const [notes, communications] = await Promise.all([
    crmTools.leadNotes(lead),
    crmTools.leadCommunications(lead),
  ]);
  const profile = {};

  for (const note of notes) {
    if (note.type === 'client_profile') {
      Object.assign(profile, parseProfileSummary(note.text));
    }
  }

  for (const communication of communications) {
    if (communication.channel === 'whatsapp') {
      Object.assign(profile, extractClientProfile(communication.text, projectConfig));
    }
  }

  return {
    profile,
    notesCount: notes.length,
    communicationsCount: communications.length,
  };
}

function mergeProfiles(...profiles) {
  return profiles.reduce((acc, profile) => {
    if (!profile) return acc;
    for (const [key, value] of Object.entries(profile)) {
      if (value !== undefined && value !== null && value !== '') acc[key] = value;
    }
    return acc;
  }, {});
}

module.exports = { buildConversationMemory, mergeProfiles };
