import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import morgan from 'morgan';

dotenv.config();

const app = express();

const allowedOrigins = [
  'https://barberia-carlyn.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4200',
];

// Middlewares
app.use(cors({
  origin: function (origin, callback) {
 
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesiones
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Rutas
app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});


app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'El servidor está corriendo correctamente'
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(' Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({ message });
});

export default app;