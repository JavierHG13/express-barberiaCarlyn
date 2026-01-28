import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_usuarios (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(100) NOT NULL,
        correo_electronico VARCHAR(255) UNIQUE NOT NULL,
        telefono VARCHAR(20),
        contrasena VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_verificaciones_temp (
        id SERIAL PRIMARY KEY,
        correo_electronico VARCHAR(255) NOT NULL,
        nombre_completo VARCHAR(100),
        telefono VARCHAR(20),
        contrasena VARCHAR(255),
        codigo_verificacion INTEGER NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        user_id INTEGER,
        verificado BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tablas creadas o verificadas exitosamente');
  } catch (error) {
    console.error('❌ Error al crear tablas:', error);
    throw error;
  }
};

export { pool, initDatabase };