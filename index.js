import app from './src/app.js';
import { initDatabase } from './src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Inicializar base de datos y servidor
const startServer = async () => {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();