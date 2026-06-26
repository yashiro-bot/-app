// One-off seed for a test admin user — used by the T3 smoke test.
// Idempotent: upserts by username so re-running is safe.
//
// Run: npx tsx prisma/seed-admin.ts

import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = 'admin';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      name: 'Test Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      username,
      passwordHash,
      name: 'Test Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `[seed-admin] upserted user id=${user.id} username=${user.username} role=${user.role} (login: ${username} / ${password})`,
  );
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed-admin] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });