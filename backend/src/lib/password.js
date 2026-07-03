const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, encodedHash) {
  if (!encodedHash) return false;
  const [scheme, salt, expected] = String(encodedHash).split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = hashPassword(password, salt).split(':')[2];
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, createSessionToken };
