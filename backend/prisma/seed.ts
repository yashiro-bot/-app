// Seed script — populates 45 CigarSpec rows.
// Idempotent: deletes existing rows first, then inserts fresh.
// Run via `npx prisma db seed` (which calls `tsx prisma/seed.ts`).

import { PrismaClient, CigarSpecStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Cycle through these three categories so the seed feels realistic.
const CATEGORIES = ['国产雪茄', '进口雪茄', '其他'] as const;

async function main(): Promise<void> {
  // Clean slate — keeps the script idempotent on re-run.
  await prisma.collectionDetail.deleteMany({});
  await prisma.collection.deleteMany({});
  await prisma.customerAssignment.deleteMany({});
  await prisma.cigarSpec.deleteMany({});

  const rows = Array.from({ length: 45 }, (_, i) => {
    const sortOrder = i + 1;
    const num = String(sortOrder).padStart(3, '0');
    return {
      code: `CIGAR-${num}`,
      name: `雪茄-${num}`,
      category: CATEGORIES[i % CATEGORIES.length]!,
      unitPerBox: 25,
      sortOrder,
      status: CigarSpecStatus.ACTIVE,
    };
  });

  const result = await prisma.cigarSpec.createMany({ data: rows });

  // Sanity-check the write actually persisted everything.
  const total = await prisma.cigarSpec.count();
  console.log(
    `[seed] createMany returned { count: ${result.count} }; CigarSpec table now has ${total} rows`,
  );

  if (total !== 45) {
    throw new Error(`Expected 45 CigarSpec rows after seed, got ${total}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });