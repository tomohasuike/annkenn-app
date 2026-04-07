import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:SECRET_REDACTED@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await pool.query('ALTER TABLE materials ADD COLUMN page_number INTEGER;');
    console.log("Column added.");
  } catch (err) {
    if (err.message.includes('already exists')) {
        console.log("Column already exists.");
    } else {
        console.error(err);
    }
  } finally {
    await pool.end();
  }
}
run();
