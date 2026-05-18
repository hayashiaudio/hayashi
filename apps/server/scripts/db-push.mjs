import 'dotenv/config';
import { spawn } from 'node:child_process';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: 'require',
  max: 1,
  prepare: false,
});

async function pruneOrphanedRows() {
  const [{ usersExists }] = await sql`
    SELECT to_regclass('public.users') IS NOT NULL AS "usersExists"
  `;

  if (!usersExists) {
    return;
  }

  const cleanupStatements = [
    {
      table: 'daily_usage',
      query: sql`
        DELETE FROM daily_usage du
        WHERE NOT EXISTS (
          SELECT 1
          FROM users u
          WHERE u.clerk_user_id = du.user_id
        )
      `,
    },
    {
      table: 'monthly_usage',
      query: sql`
        DELETE FROM monthly_usage mu
        WHERE NOT EXISTS (
          SELECT 1
          FROM users u
          WHERE u.clerk_user_id = mu.user_id
        )
      `,
    },
    {
      table: 'billing_customers',
      query: sql`
        DELETE FROM billing_customers bc
        WHERE NOT EXISTS (
          SELECT 1
          FROM users u
          WHERE u.clerk_user_id = bc.user_id
        )
      `,
    },
  ];

  for (const statement of cleanupStatements) {
    try {
      const [{ tableExists }] = await sql`
        SELECT to_regclass(${`public.${statement.table}`}) IS NOT NULL AS "tableExists"
      `;
      if (!tableExists) {
        continue;
      }

      const result = await statement.query;
      const deletedCount = Array.isArray(result) ? result.length : Number(result.count ?? 0);
      if (deletedCount > 0) {
        console.warn(`[db:push] Removed ${deletedCount} orphaned row(s) from ${statement.table}`);
      }
    } catch (error) {
      throw error;
    }
  }
}

try {
  await pruneOrphanedRows();
  await sql.end();

  await new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['drizzle-kit', 'push', '--config', 'drizzle.config.ts', '--force', ...process.argv.slice(2)],
      {
        stdio: 'inherit',
        cwd: new URL('..', import.meta.url),
      }
    );

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`drizzle-kit push exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`drizzle-kit push exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });

    child.on('error', reject);
  });
} catch (error) {
  await sql.end({ timeout: 0 }).catch(() => {});
  throw error;
}
