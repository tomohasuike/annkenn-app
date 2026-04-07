import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:SECRET_REDACTED@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function addCols() {
  try {
    await pool.query(`
      ALTER TABLE materials 
      ADD COLUMN IF NOT EXISTS width_mm numeric,
      ADD COLUMN IF NOT EXISTS height_mm numeric,
      ADD COLUMN IF NOT EXISTS depth_mm numeric;
    `);
    console.log('Columns added successfully');
    
    // Call Supabase RPC to reload schema cache
    await pool.query(`NOTIFY pgrst, 'reload schema'`);
    console.log('Schema cache reloaded');
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await pool.end();
  }
}

addCols();
