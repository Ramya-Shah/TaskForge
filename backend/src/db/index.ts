import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'taskforge',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'taskforge'
});

export const initDB = async () => {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(255) NOT NULL,
        payload JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        attempts INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: connected and jobs schema ready.');
  } finally {
    client.release();
  }
};
