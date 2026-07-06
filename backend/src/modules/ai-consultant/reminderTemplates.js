function lessonReminderMessage(input = {}) {
  const student = input.studentName || 'ученика';
  const when = formatDateTime(input.startsAt) || input.time || 'завтра';
  const teacher = input.teacherName ? ` Преподаватель: ${input.teacherName}.` : '';
  const address = input.address ? ` Адрес: ${input.address}.` : '';
  return `Здравствуйте! Напоминаю: занятие для ${student} запланировано ${when}.${teacher}${address} Если не получается прийти, пожалуйста, напишите заранее.`;
}

function paymentReminderMessage(input = {}) {
  const student = input.studentName ? ` по ученику ${input.studentName}` : '';
  const due = formatDate(input.dueAt || input.scheduledAt) || input.dueText || 'в ближайшее время';
  const amount = input.amount ? ` Сумма к оплате: ${input.amount}.` : '';
  return `Здравствуйте! Мягко напоминаю об оплате${student}: срок ${due}.${amount} Если уже оплатили, напишите, пожалуйста, и администратор проверит платеж.`;
}

function paymentCheckMessage() {
  return 'Спасибо, передам администратору на проверку оплаты. Сама оплату не подтверждаю, чтобы не ошибиться.';
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

module.exports = { lessonReminderMessage, paymentReminderMessage, paymentCheckMessage };
