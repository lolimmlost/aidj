import postgres from 'postgres';

const DATABASE_URL = 'postgres://user:password@10.0.0.4:5432/ai_dj';
const sql = postgres(DATABASE_URL);

try {
  const item = await sql`
    SELECT *
    FROM discovery_feed_items
    WHERE expires_at > NOW()
    LIMIT 1
  `;

  console.log('Item structure from DB:');
  console.log(JSON.stringify(item[0], null, 2));
} catch (error) {
  console.error('Error:', error);
} finally {
  await sql.end();
}
