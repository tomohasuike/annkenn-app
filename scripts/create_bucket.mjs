import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:SECRET_REDACTED@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await pool.query(`INSERT INTO storage.buckets (id, name, public) VALUES ('material_images', 'material_images', true) ON CONFLICT DO NOTHING;`);
    console.log("Storage bucket created.");
    await pool.query(`
        -- Allow public read access
        CREATE POLICY "public_read_material_images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'material_images');
        -- Allow authenticated uploads (or service role)
        CREATE POLICY "auth_insert_material_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'material_images');
    `);
    console.log("Policies created.");
  } catch (err) {
    if (!err.message.includes("already exists")) {
       console.error('Failed:', err.message);
    } else {
       console.log("Policies already exist.");
    }
  } finally {
    await pool.end();
  }
}
run();
