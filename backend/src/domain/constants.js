const ROLES = Object.freeze({
  OWNER: 'owner',
  SUPERVISOR: 'supervisor',
  SALES_LEAD: 'sales_lead',
  MANAGER: 'manager',
  IMPLEMENTATION: 'implementation',
  SUPPORT: 'support',
  DEVELOPER: 'developer',
});

const DIRECTIONS = Object.freeze({
  AUTOTECH: 'autotech',
  EDUTECH: 'edutech',
});

const AUTOTECH_NICHES = Object.freeze([
  'oil_change',
  'tire_service',
  'repair_shop',
  'car_wash',
  'mixed_service',
]);

const EDUTECH_NICHES = Object.freeze([
  'music_school',
  'language_school',
  'tutoring_center',
  'kids_center',
  'mixed_education',
]);

const LEAD_STATUSES = Object.freeze({
  NEW: 'new',
  CONTACT_CHECK: 'contact_check',
  FIRST_TOUCH: 'first_touch',
  DIAGNOSTICS: 'diagnostics',
  MEETING: 'meeting',
  PROPOSAL: 'proposal',
  WON: 'won',
  LOST: 'lost',
});

const DEAL_STAGES = Object.freeze({
  DIAGNOSTICS: 'diagnostics',
  PRESENTATION: 'presentation',
  PROPOSAL: 'proposal',
  FOLLOW_UP: 'follow_up',
  PREPAYMENT: 'prepayment',
  PAYMENT: 'payment',
  IMPLEMENTATION: 'implementation',
  WON: 'won',
  LOST: 'lost',
});

const TASK_TYPES = Object.freeze({
  CHECK_CONTACT: 'check_contact',
  FIRST_MESSAGE: 'first_message',
  CALL: 'call',
  DIAGNOSTICS: 'diagnostics',
  MEETING: 'meeting',
  PREPARE_PROPOSAL: 'prepare_proposal',
  FOLLOW_UP: 'follow_up',
  PAYMENT: 'payment',
  HANDOFF_IMPLEMENTATION: 'handoff_implementation',
  DATA_COLLECTION: 'data_collection',
  SUPPORT: 'support',
});

const COMMUNICATION_RESULTS = Object.freeze({
  NO_ANSWER: 'no_answer',
  INTERESTED: 'interested',
  EXPENSIVE: 'expensive',
  MEETING_SET: 'meeting_set',
  PROPOSAL_SENT: 'proposal_sent',
  REJECTED: 'rejected',
  RETURN_LATER: 'return_later',
});

const PACKAGES = Object.freeze({
  START: 'start',
  BUSINESS: 'business',
  PRO: 'pro',
  NETWORK: 'network',
});

const IMPLEMENTATION_STATUSES = Object.freeze({
  WAITING_START: 'waiting_start',
  DATA_COLLECTION: 'data_collection',
  CONFIGURATION: 'configuration',
  CONTENT: 'content',
  TESTING: 'testing',
  TRAINING: 'training',
  LAUNCH: 'launch',
  SUPPORT: 'support',
  PAUSED: 'paused',
  DONE: 'done',
});

const SUPPORT_TICKET_TYPES = Object.freeze({
  QUESTION: 'question',
  BUG: 'bug',
  PAID_CHANGE: 'paid_change',
  CONSULTATION: 'consultation',
});

const SUPPORT_TICKET_STATUSES = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_CLIENT: 'waiting_client',
  DONE: 'done',
  CLOSED: 'closed',
});

const SUBSCRIPTION_STATUSES = Object.freeze({
  TRIAL_SUPPORT: 'trial_support',
  ACTIVE: 'active',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
});

const DEBT_STATUSES = Object.freeze({
  OPEN: 'open',
  PAID: 'paid',
  CANCELLED: 'cancelled',
});

const PERMISSIONS = Object.freeze({
  CRM_READ: 'crm:read',
  LEAD_WRITE: 'lead:write',
  DEAL_WRITE: 'deal:write',
  PAYMENT_WRITE: 'payment:write',
  IMPLEMENTATION_WRITE: 'implementation:write',
  SUPPORT_WRITE: 'support:write',
  TASK_WRITE: 'task:write',
  ANALYTICS_READ: 'analytics:read',
  ADMIN_READ: 'admin:read',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.OWNER]: Object.values(PERMISSIONS),
  [ROLES.SUPERVISOR]: Object.values(PERMISSIONS),
  [ROLES.SALES_LEAD]: [
    PERMISSIONS.CRM_READ,
    PERMISSIONS.LEAD_WRITE,
    PERMISSIONS.DEAL_WRITE,
    PERMISSIONS.PAYMENT_WRITE,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.ANALYTICS_READ,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.CRM_READ,
    PERMISSIONS.LEAD_WRITE,
    PERMISSIONS.DEAL_WRITE,
  ],
  [ROLES.IMPLEMENTATION]: [
    PERMISSIONS.CRM_READ,
    PERMISSIONS.IMPLEMENTATION_WRITE,
    PERMISSIONS.SUPPORT_WRITE,
  ],
  [ROLES.SUPPORT]: [
    PERMISSIONS.CRM_READ,
    PERMISSIONS.SUPPORT_WRITE,
  ],
  [ROLES.DEVELOPER]: [
    PERMISSIONS.CRM_READ,
    PERMISSIONS.SUPPORT_WRITE,
  ],
});

module.exports = {
  ROLES,
  DIRECTIONS,
  AUTOTECH_NICHES,
  EDUTECH_NICHES,
  LEAD_STATUSES,
  DEAL_STAGES,
  TASK_TYPES,
  PACKAGES,
  IMPLEMENTATION_STATUSES,
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_STATUSES,
  SUBSCRIPTION_STATUSES,
  DEBT_STATUSES,
  COMMUNICATION_RESULTS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
};
