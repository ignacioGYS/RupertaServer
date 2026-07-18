import pg from 'pg';
const { Pool } = pg;

// Connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || process.env.SSH_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'ruperta',
  password: process.env.DB_PASSWORD || 'ruperta_secure_pass',
  database: process.env.DB_NAME || 'ruperta_monitor',
});

// Helper to query the DB
export const query = (text, params) => pool.query(text, params);

// Initialize tables
export const initializeDb = async () => {
  try {
    console.log('🔄 Inicializando base de datos PostgreSQL...');
    
    // Server metrics table
    await query(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        cpu_usage_percent REAL,
        ram_total_mb REAL,
        ram_used_mb REAL,
        uptime_seconds REAL
      )
    `);

    // GPU metrics table
    await query(`
      CREATE TABLE IF NOT EXISTS gpu_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        gpu_name VARCHAR(255),
        core_usage_percent REAL,
        vram_total_mb REAL,
        vram_used_mb REAL,
        temperature_c REAL,
        power_draw_w REAL
      )
    `);

    // Index on timestamps for fast time-series queries
    await query(`CREATE INDEX IF NOT EXISTS idx_server_metrics_time ON server_metrics (timestamp)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gpu_metrics_time ON gpu_metrics (timestamp)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gpu_metrics_name ON gpu_metrics (gpu_name)`);

    // Local devices nicknames table
    await query(`
      CREATE TABLE IF NOT EXISTS local_devices (
        mac VARCHAR(17) PRIMARY KEY,
        custom_name VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrate/Add columns to local_devices if they don't exist
    try {
      await query(`ALTER TABLE local_devices ADD COLUMN IF NOT EXISTS is_light BOOLEAN DEFAULT FALSE`);
      await query(`ALTER TABLE local_devices ADD COLUMN IF NOT EXISTS light_type VARCHAR(50) DEFAULT 'wiz'`);
      await query(`ALTER TABLE local_devices ADD COLUMN IF NOT EXISTS device_config JSONB DEFAULT '{}'::jsonb`);
    } catch (err) {
      console.warn('[DB Migration] Notice: Columns already exist or migration skipped:', err.message);
    }

    console.log('✅ Base de datos PostgreSQL lista y conectada.');
  } catch (error) {
    console.error('❌ Error conectando o inicializando PostgreSQL:', error.message);
    // No tiramos error fatal para que la app pueda seguir funcionando sin DB temporalmente si es necesario
  }
};
