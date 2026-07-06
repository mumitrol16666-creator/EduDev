const DEFAULT_WORKING_HOURS = '09:00-21:00';

function workingHoursState(date = new Date(), env = process.env) {
  const timezone = env.AI_CONSULTANT_TIMEZONE || 'Asia/Aqtobe';
  const range = env.AI_CONSULTANT_WORKING_HOURS || DEFAULT_WORKING_HOURS;
  const [start, end] = range.split('-');
  const minutes = localMinutes(date, timezone);
  const startMinutes = parseTime(start, 9 * 60);
  const endMinutes = parseTime(end, 21 * 60);
  const within = startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes <= endMinutes
    : minutes >= startMinutes || minutes <= endMinutes;
  return { within, timezone, range, localMinutes: minutes };
}

function nightReply() {
  return 'Здравствуйте! Сейчас нерабочее время, поэтому отвечу коротко и передам администратору на ближайшее рабочее время.';
}

function localMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((item) => item.type === 'hour')?.value || 0);
  const minute = Number(parts.find((item) => item.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function parseTime(value, fallback) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

module.exports = { workingHoursState, nightReply, DEFAULT_WORKING_HOURS };
