import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Export it first:\nexport DATABASE_URL="your_neon_url"');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require' });
await sql`DROP TABLE IF EXISTS plugin_messages CASCADE`;
await sql`DROP TABLE IF EXISTS plugin_versions CASCADE`;
await sql`DROP TABLE IF EXISTS plugins CASCADE`;
await sql`DROP TABLE IF EXISTS monthly_usage CASCADE`;
await sql`DROP TABLE IF EXISTS daily_usage CASCADE`;
await sql`DROP TABLE IF EXISTS billing_customers CASCADE`;
await sql`DROP TABLE IF EXISTS users CASCADE`;
console.log('Dropped all tables');
await sql.end();
