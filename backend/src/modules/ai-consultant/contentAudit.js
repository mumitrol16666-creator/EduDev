function auditAiConsultantContent({ knowledge, slots, projectConfig, now = new Date() }) {
  const issues = [];
  const docs = knowledge.listDocuments();
  const slotItems = slots.load();
  const directions = new Set(projectConfig.directions.map((item) => item.toLowerCase()));

  if (!docs.length) {
    issues.push(error('knowledge.empty', 'Knowledge base has no markdown documents'));
  }

  for (const doc of docs) {
    if (!doc.title || doc.title === `${doc.id}.md`) {
      issues.push(warn('knowledge.missing_title', `Knowledge document ${doc.id} has no H1 title`));
    }
    if (!doc.updatedAt) {
      issues.push(warn('knowledge.missing_updated_at', `Knowledge document ${doc.id} has no "Актуально: YYYY-MM-DD"`));
    }
    if (wordCount(doc.body) < 8) {
      issues.push(warn('knowledge.too_short', `Knowledge document ${doc.id} is too short`));
    }
  }

  if (!slotItems.length) {
    issues.push(warn('slots.empty', 'Trial slots file has no slots'));
  }

  const seenSlotIds = new Set();
  for (const slot of slotItems) {
    if (!slot.id) issues.push(error('slots.missing_id', 'A trial slot has no id'));
    if (slot.id && seenSlotIds.has(slot.id)) issues.push(error('slots.duplicate_id', `Duplicate trial slot id: ${slot.id}`));
    if (slot.id) seenSlotIds.add(slot.id);

    if (!slot.direction) {
      issues.push(error('slots.missing_direction', `Slot ${slot.id || '<no-id>'} has no direction`));
    } else if (!directions.has(String(slot.direction).toLowerCase())) {
      issues.push(warn('slots.unknown_direction', `Slot ${slot.id || '<no-id>'} direction is not in project config: ${slot.direction}`));
    }

    const startsAt = new Date(slot.startsAt);
    if (!slot.startsAt || Number.isNaN(startsAt.getTime())) {
      issues.push(error('slots.invalid_starts_at', `Slot ${slot.id || '<no-id>'} has invalid startsAt`));
    } else if (startsAt.getTime() < now.getTime()) {
      issues.push(warn('slots.past', `Slot ${slot.id || '<no-id>'} is in the past`));
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    ok: errors.length === 0,
    errors: errors.length,
    warnings: warnings.length,
    issues,
    summary: {
      knowledgeDocuments: docs.length,
      trialSlots: slotItems.length,
    },
  };
}

function wordCount(text = '') {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function warn(code, message) {
  return { severity: 'warning', code, message };
}

function error(code, message) {
  return { severity: 'error', code, message };
}

module.exports = { auditAiConsultantContent };
