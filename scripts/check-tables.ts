import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('taste_snapshots', 'mood_snapshots', 'recommendation_history')
  `;
  console.log('Existing tables:', tables.map(t => t.table_name));
  await sql.end();
}

main().catch(console.error);
