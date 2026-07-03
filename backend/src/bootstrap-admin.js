const crypto = require('crypto');
const { loadEnv } = require('./config/env');
const { getPrisma, disconnectPrisma } = require('./config/prisma');
const { ROLES } = require('./domain/constants');
const { hashPassword } = require('./lib/password');

loadEnv();

async function main() {
  if ((process.env.CRM_STORE || '').toLowerCase() !== 'prisma') {
    throw new Error('Set CRM_STORE=prisma before bootstrapping production admin.');
  }

  const email = process.env.CRM_ADMIN_EMAIL;
  const password = process.env.CRM_ADMIN_PASSWORD;
  const name = process.env.CRM_ADMIN_NAME || 'Владелец';

  if (!email) throw new Error('CRM_ADMIN_EMAIL is required.');
  if (!password || password.length < 12) {
    throw new Error('CRM_ADMIN_PASSWORD is required and must be at least 12 characters.');
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      name,
      role: ROLES.OWNER,
      email,
      phone: process.env.CRM_ADMIN_PHONE || null,
      status: 'active',
      apiToken: `owner-${crypto.randomBytes(24).toString('hex')}`,
      passwordHash: hashPassword(password),
    },
  });

  console.log(`Admin created: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
