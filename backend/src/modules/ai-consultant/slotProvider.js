const fs = require('fs');
const path = require('path');

const DEFAULT_SLOTS_FILE = path.join(__dirname, 'trialSlots.json');

class TrialSlotProvider {
  constructor(options = {}) {
    this.file = options.file || process.env.AI_CONSULTANT_TRIAL_SLOTS_FILE || DEFAULT_SLOTS_FILE;
  }

  listAvailable(direction = null, limit = 3) {
    const normalizedDirection = direction ? String(direction).toLowerCase() : null;
    return this.load()
      .filter((slot) => slot.status === 'available')
      .filter((slot) => !normalizedDirection || String(slot.direction).toLowerCase() === normalizedDirection)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, limit)
      .map((slot) => ({
        ...slot,
        label: formatSlotLabel(slot),
      }));
  }

  findById(id) {
    const slot = this.load().find((item) => item.id === id) || null;
    return slot ? { ...slot, label: formatSlotLabel(slot) } : null;
  }

  load() {
    if (!fs.existsSync(this.file)) return [];
    const raw = fs.readFileSync(this.file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }
}

function formatSlotLabel(slot) {
  const date = new Date(slot.startsAt);
  const formatted = Number.isNaN(date.getTime())
    ? slot.startsAt
    : new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Aqtobe',
    }).format(date);
  return `${formatted} - ${slot.direction}`;
}

module.exports = { TrialSlotProvider, DEFAULT_SLOTS_FILE };
