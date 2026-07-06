function findLastOfferedSlot(notes = []) {
  const ordered = [...notes].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  for (const note of ordered) {
    const match = String(note.text || '').match(/Предложенные слоты:\s*([a-zA-Z0-9_,\s-]+)/);
    if (match) {
      const slotId = match[1].split(',').map((item) => item.trim()).filter(Boolean)[0];
      if (slotId) return slotId;
    }
  }
  return null;
}

async function createTrialBookingRequest({ crmTools, lead, slot }) {
  const task = await crmTools.createHumanTask(
    lead,
    `Подтвердить запись на пробный урок: ${lead.name} (${slot.label})`,
    'high',
  );
  await crmTools.addLeadNote(
    lead,
    'trial_booking_request',
    `Клиент подтвердил пробный слот ${slot.id}: ${slot.label}. Нужно проверить расписание и финально подтвердить запись.`,
  );
  return { slot, task };
}

module.exports = { findLastOfferedSlot, createTrialBookingRequest };
