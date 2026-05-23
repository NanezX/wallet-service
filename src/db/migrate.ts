import 'dotenv/config';

import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const pool = new Pool({ connectionString });

  try {
    const db = drizzle(pool);

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), 'src/db/migrations'),
    });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
