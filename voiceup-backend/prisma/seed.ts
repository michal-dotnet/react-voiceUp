/**
 * Idempotent seed: the first admin account, categories and reference organizations.
 * Run with `npm run db:seed` (or automatically by `prisma migrate reset`).
 * The admin password comes from SEED_ADMIN_PASSWORD and is never printed.
 */
import { z } from 'zod';
import { hashPassword } from '../src/lib/password.js';
import { createPrisma } from '../src/lib/prisma.js';

const seedEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
    SEED_ADMIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),
    SEED_ADMIN_NAME: z.string().trim().min(2).max(80).default('VoiceUp Admin'),
  })
  .safeParse(process.env);

if (!seedEnv.success) {
  const lines = seedEnv.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  process.stderr.write(`Seed configuration is invalid:\n${lines.join('\n')}\n`);
  process.exit(1);
}

const env = seedEnv.data;
const prisma = createPrisma(env.DATABASE_URL);

const CATEGORIES = [
  { slug: 'roads-sidewalks', name: 'כבישים ומדרכות' },
  { slug: 'street-lighting', name: 'תאורת רחוב' },
  { slug: 'sanitation', name: 'ניקיון ופסולת' },
  { slug: 'public-transport', name: 'תחבורה ציבורית' },
  { slug: 'parks', name: 'גנים ושטחים ציבוריים' },
  { slug: 'accessibility', name: 'נגישות' },
  { slug: 'water-sewage', name: 'מים וביוב' },
  { slug: 'public-safety', name: 'בטיחות במרחב הציבורי' },
];

// Generic reference organizations. Replace them with the real bodies you work with.
const ORGANIZATIONS = [
  { name: 'מחלקת תשתיות עירונית', type: 'רשות מקומית' },
  { name: 'מחלקת תברואה עירונית', type: 'רשות מקומית' },
  { name: 'מפעיל תחבורה ציבורית אזורי', type: 'תחבורה ציבורית' },
  { name: 'תאגיד המים והביוב', type: 'תאגיד' },
];

async function main(): Promise<void> {
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    create: { email: env.SEED_ADMIN_EMAIL, name: env.SEED_ADMIN_NAME, passwordHash, role: 'ADMIN' },
    update: { role: 'ADMIN' },
  });

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }
  for (const organization of ORGANIZATIONS) {
    await prisma.organization.upsert({
      where: { name: organization.name },
      create: organization,
      update: { type: organization.type },
    });
  }

  process.stdout.write(
    `Seed complete: admin ${env.SEED_ADMIN_EMAIL}, ${CATEGORIES.length} categories, ${ORGANIZATIONS.length} organizations.\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
