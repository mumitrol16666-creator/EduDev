const { ROLE_PERMISSIONS } = require('../domain/constants');
const { createSessionToken, hashPassword, verifyPassword } = require('../lib/password');

class AuthService {
  constructor(store) {
    this.store = store;
  }

  async authenticate(req) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw unauthorized('Missing bearer token');

    const token = match[1].trim();
    const users = await this.store.all('users');
    const user = users.find((item) => item.apiToken === token && item.status === 'active')
      || await this.userFromSessionToken(token);
    if (!user) throw unauthorized('Invalid bearer token');
    return user;
  }

  async login(payload = {}) {
    if (!payload.email || !payload.password) throw unauthorized('Email and password are required');
    const users = await this.store.all('users');
    const user = users.find((item) => String(item.email || '').toLowerCase() === String(payload.email).toLowerCase() && item.status === 'active');
    if (!user || !verifyPassword(payload.password, user.passwordHash)) throw unauthorized('Invalid email or password');

    const token = createSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(payload.remember ? 30 : 7));
    await this.store.insert('authSessions', {
      userId: user.id,
      token,
      status: 'active',
      userAgent: payload.userAgent || null,
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    });
    return { token, expiresAt: expiresAt.toISOString(), user: this.safeUser(user) };
  }

  async logout(token) {
    if (!token) return { revoked: false };
    const sessions = await this.store.all('authSessions');
    const session = sessions.find((item) => item.token === token && item.status === 'active');
    if (!session) return { revoked: false };
    await this.store.update('authSessions', session.id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
    });
    return { revoked: true };
  }

  async changePassword(user, payload = {}) {
    if (!payload.currentPassword || !payload.newPassword) throw unauthorized('Current and new password are required');
    if (!verifyPassword(payload.currentPassword, user.passwordHash)) throw unauthorized('Invalid current password');
    if (String(payload.newPassword).length < 8) {
      const error = new Error('New password must be at least 8 characters');
      error.status = 400;
      throw error;
    }
    const updated = await this.store.update('users', user.id, {
      passwordHash: hashPassword(payload.newPassword),
    });
    await this.revokeUserSessions(user.id);
    return this.safeUser(updated);
  }

  async userFromSessionToken(token) {
    const sessions = await this.store.all('authSessions');
    const session = sessions.find((item) => item.token === token && item.status === 'active');
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      await this.store.update('authSessions', session.id, { status: 'expired' });
      return null;
    }
    const user = await this.store.get('users', session.userId);
    if (!user || user.status !== 'active') return null;
    return user;
  }

  async revokeUserSessions(userId) {
    const sessions = await this.store.all('authSessions');
    const active = sessions.filter((item) => item.userId === userId && item.status === 'active');
    for (const session of active) {
      await this.store.update('authSessions', session.id, {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      });
    }
  }

  require(user, permission) {
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    if (!permissions.includes(permission)) {
      const error = new Error(`Permission denied: ${permission}`);
      error.status = 403;
      throw error;
    }
  }

  safeUser(user) {
    if (!user) return null;
    const { apiToken, passwordHash, ...safe } = user;
    return safe;
  }
}

function unauthorized(message) {
  const error = new Error(message);
  error.status = 401;
  return error;
}

module.exports = { AuthService };
