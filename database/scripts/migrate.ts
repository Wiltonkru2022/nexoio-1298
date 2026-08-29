import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const targetEnv = process.env.TARGET_ENV?.trim().toLowerCase();
if (targetEnv === 'staging' || targetEnv === 'production') {
  const parsed = new URL(url);
  const hostGuard = process.env.DATABASE_HOST_GUARD?.trim();
  const nameGuard = process.env.DATABASE_NAME_GUARD?.trim();
  if (!hostGuard) throw new Error('DATABASE_HOST_GUARD is required for release migrations');
  if (!nameGuard) throw new Error('DATABASE_NAME_GUARD is required for release migrations');
  if (!parsed.hostname.endsWith('.neon.tech')) throw new Error('Release DATABASE_URL must point to Neon');
  if (parsed.hostname !== hostGuard) throw new Error('DATABASE_URL host does not match DATABASE_HOST_GUARD');
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName !== nameGuard) throw new Error('DATABASE_URL database does not match DATABASE_NAME_GUARD');
}

const migrationsFolder = './database/migrations';
const journalPath = join(migrationsFolder, 'meta', '_journal.json');
const client = postgres(url, { max: 1 });

try {
  if (targetEnv === 'staging' || targetEnv === 'production') {
    const [{ database }] = await client<{ database: string }[]>`select current_database() as database`;
    if (database !== process.env.DATABASE_NAME_GUARD) throw new Error('Connected database identity does not match DATABASE_NAME_GUARD');
    console.log(`Release database guard OK: ${targetEnv}; database=${database}`);
  }

  await migrate(drizzle(client), { migrationsFolder });

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS _nexoio_migrations (
      filename text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries?: Array<{ tag?: string }>;
  };
  const drizzleManaged = new Set(
    (journal.entries ?? []).flatMap((entry) => entry.tag ? [`${entry.tag}.sql`] : [])
  );

  for (const filename of drizzleManaged) {
    const path = join(migrationsFolder, filename);
    const content = await readFile(path, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    await client`
      INSERT INTO _nexoio_migrations(filename, checksum_sha256)
      VALUES(${filename}, ${checksum})
      ON CONFLICT (filename) DO NOTHING
    `;
  }

  const files = (await readdir(migrationsFolder))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const filename of files) {
    if (drizzleManaged.has(filename)) continue;

    const path = join(migrationsFolder, filename);
    const content = await readFile(path, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const applied = await client<{ checksum_sha256: string }[]>`
      SELECT checksum_sha256 FROM _nexoio_migrations WHERE filename=${filename}
    `;

    if (applied.length) {
      if (applied[0]!.checksum_sha256 !== checksum) {
        throw new Error(`Migration ${filename} changed after it was applied`);
      }
      continue;
    }

    const statements = content
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    await client.begin(async (tx) => {
      for (const statement of statements) await tx.unsafe(statement);
      await tx`
        INSERT INTO _nexoio_migrations(filename, checksum_sha256)
        VALUES(${filename}, ${checksum})
      `;
    });

    console.log(`Applied manual migration ${filename}`);
  }

  console.log('Migrations completed');
} finally {
  await client.end();
}
