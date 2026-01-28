import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/user.js';
import VerificationTemp from '../models/VerificationTemp.js';
import emailService from '../utils/emailService.js';
import dotenv from 'dotenv';

dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Control de intentos de login
const loginAttempts = new Map();
const resendAttempts = new Map();

// ========== UTILIDADES ==========
const createToken = (user) => {
  const payload = {
    sub: user.id,
    correoElectronico: user.correo_electronico,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const checkIfBlocked = (identifier) => {
  const attemptData = loginAttempts.get(identifier);
  if (!attemptData) return;

  if (attemptData.blockedUntil && Date.now() < attemptData.blockedUntil) {
    const remainingTime = Math.ceil((attemptData.blockedUntil - Date.now()) / 1000);
    throw {
      statusCode: 429,
      message: `Demasiados intentos fallidos. Intenta de nuevo en ${remainingTime} segundos`,
    };
  }

  if (attemptData.blockedUntil && Date.now() >= attemptData.blockedUntil) {
    loginAttempts.delete(identifier);
  }
};

const recordFailedAttempt = (identifier) => {
  const attemptData = loginAttempts.get(identifier) || { attempts: 0, blockedUntil: null };
  attemptData.attempts += 1;

  if (attemptData.attempts >= 3) {
    attemptData.blockedUntil = Date.now() + 2 * 60 * 1000;
    console.log(`🔒 Usuario bloqueado: ${identifier} por 2 minutos`);
  }

  loginAttempts.set(identifier, attemptData);
};

const clearFailedAttempts = (identifier) => {
  loginAttempts.delete(identifier);
};

const checkResendLimit = (correoElectronico) => {
  const resendData = resendAttempts.get(correoElectronico);
  if (!resendData) return;

  if (resendData.blockedUntil && Date.now() < resendData.blockedUntil) {
    const remainingTime = Math.ceil((resendData.blockedUntil - Date.now()) / 1000);
    throw {
      statusCode: 429,
      message: `Demasiados reenvíos. Espera ${remainingTime} segundos antes de intentar nuevamente`,
    };
  }

  const COOLDOWN = 30 * 1000;
  if (Date.now() - resendData.lastAttempt < COOLDOWN) {
    const remainingTime = Math.ceil((COOLDOWN - (Date.now() - resendData.lastAttempt)) / 1000);
    throw {
      statusCode: 429,
      message: `Debes esperar ${remainingTime} segundos antes de solicitar otro código`,
    };
  }

  if (resendData.blockedUntil && Date.now() >= resendData.blockedUntil) {
    resendAttempts.delete(correoElectronico);
  }
};

const recordResendAttempt = (correoElectronico) => {
  const resendData = resendAttempts.get(correoElectronico) || {
    attempts: 0,
    lastAttempt: 0,
    blockedUntil: null,
  };

  resendData.attempts += 1;
  resendData.lastAttempt = Date.now();

  if (resendData.attempts >= 5) {
    resendData.blockedUntil = Date.now() + 10 * 60 * 1000;
    console.log(`🔒 Reenvíos bloqueados para: ${correoElectronico} por 10 minutos`);
  }

  resendAttempts.set(correoElectronico, resendData);
};

// ========== REGISTRO ==========
export const register = async (req, res, next) => {
  try {
    const { nombreCompleto, correoElectronico, telefono, contrasena } = req.body;

    const existingUser = await User.findByEmail(correoElectronico);
    if (existingUser) {
      return res.status(400).json({ message: 'Error al registrarse' });
    }

    await VerificationTemp.deleteByEmail(correoElectronico, 'registro');

    const hashedPassword = await bcrypt.hash(contrasena, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    await VerificationTemp.create({
      correoElectronico,
      nombreCompleto,
      telefono,
      contrasena: hashedPassword,
      codigoVerificacion: verificationCode,
      tipo: 'registro',
    });

    console.log('Registro guardado:', correoElectronico, '- Código:', verificationCode);

    await VerificationTemp.cleanOldVerifications();
    await emailService.sendVerificationEmail(correoElectronico, nombreCompleto, verificationCode);

    res.status(201).json({
      message: 'Código de verificación enviado. Revisa tu correo.',
    });
  } catch (error) {
    next(error);
  }
};

// ========== VERIFICAR EMAIL ==========
export const verifyEmail = async (req, res, next) => {
  try {
    const { code, correoElectronico } = req.body;

    console.log('🔍 Verificando:', correoElectronico);

    const verification = await VerificationTemp.findOne(correoElectronico, 'registro');

    if (!verification) {
      return res.status(400).json({ message: 'No hay registro pendiente de verificación' });
    }

    // Verificar expiración (4 minutos)
    const EXPIRATION_TIME = 4 * 60 * 1000;
    const createdAt = new Date(verification.created_at).getTime();
    if (Date.now() - createdAt > EXPIRATION_TIME) {
      await VerificationTemp.delete(verification.id);
      return res.status(400).json({ message: 'El código de verificación ha expirado' });
    }

    if (parseInt(code) !== verification.codigo_verificacion) {
      return res.status(400).json({ message: 'Código incorrecto' });
    }

    const existing = await User.findByEmail(correoElectronico);
    if (existing) {
      await VerificationTemp.delete(verification.id);
      return res.status(400).json({ message: 'El correo ya está registrado' });
    }

    // Crear el usuario real
    const newUser = await User.create({
      nombreCompleto: verification.nombre_completo,
      correoElectronico: verification.correo_electronico,
      telefono: verification.telefono,
      contrasena: verification.contrasena,
    });

    await VerificationTemp.delete(verification.id);

    res.json({
      message: 'Correo verificado exitosamente. Tu cuenta ha sido creada.',
      user: {
        id: newUser.id,
        nombreCompleto: newUser.nombre_completo,
        correoElectronico: newUser.correo_electronico,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ========== REENVIAR CÓDIGO ==========
export const resendCode = async (req, res, next) => {
  try {
    const { correoElectronico } = req.body;

    checkResendLimit(correoElectronico);

    const verification = await VerificationTemp.findOne(correoElectronico, 'registro');

    if (!verification) {
      return res.status(400).json({ message: 'Error al registrarse' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    await VerificationTemp.update(verification.id, {
      codigo_verificacion: verificationCode,
      created_at: new Date(),
    });

    recordResendAttempt(correoElectronico);

    console.log('🔄 Código reenviado:', correoElectronico, '- Nuevo código:', verificationCode);

    await emailService.sendVerificationEmail(
      correoElectronico,
      verification.nombre_completo,
      verificationCode
    );

    res.json({ message: 'Nuevo código enviado. Revisa tu correo.' });
  } catch (error) {
    next(error);
  }
};

// ========== LOGIN ==========
export const login = async (req, res, next) => {
  try {
    const { correoElectronico, contrasena } = req.body;

    checkIfBlocked(correoElectronico);

    const user = await User.findByEmail(correoElectronico);
    if (!user) {
      recordFailedAttempt(correoElectronico);
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    const isMatch = await bcrypt.compare(contrasena, user.contrasena);
    if (!isMatch) {
      recordFailedAttempt(correoElectronico);
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    clearFailedAttempts(correoElectronico);

    const token = createToken(user);

    if (req.session) {
      req.session.user = {
        id: user.id,
        nombreCompleto: user.nombre_completo,
        correoElectronico: user.correo_electronico,
      };
    }

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user.id,
        nombreCompleto: user.nombre_completo,
        correoElectronico: user.correo_electronico,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ========== LOGIN CON GOOGLE ==========
export const googleAuth = async (req, res, next) => {
  try {
    const { googleToken } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Token de Google inválido' });
    }

    const { email, name, sub } = payload;

    let user = await User.findByEmail(email);

    if (!user) {
      const hashedPassword = await bcrypt.hash(sub, 10);
      user = await User.create({
        nombreCompleto: name || 'Usuario',
        correoElectronico: email,
        telefono: '',
        contrasena: hashedPassword,
      });
    }

    clearFailedAttempts(email);

    const token = createToken(user);

    if (req.session) {
      req.session.user = {
        id: user.id,
        nombreCompleto: user.nombre_completo,
        correoElectronico: user.correo_electronico,
      };
    }

    res.json({
      message: 'Inicio de sesión con Google exitoso',
      token,
      user: {
        id: user.id,
        nombreCompleto: user.nombre_completo,
        correoElectronico: user.correo_electronico,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ========== RECUPERACIÓN DE CONTRASEÑA ==========
export const forgotPassword = async (req, res, next) => {
  try {
    const { correoElectronico } = req.body;

    const user = await User.findByEmail(correoElectronico);
    if (!user) {
      return res.status(404).json({ message: 'No existe una cuenta con ese correo' });
    }

    await VerificationTemp.deleteByEmail(correoElectronico, 'recuperacion');

    const recoveryCode = Math.floor(100000 + Math.random() * 900000);

    await VerificationTemp.create({
      correoElectronico,
      nombreCompleto: user.nombre_completo,
      telefono: '',
      contrasena: '',
      codigoVerificacion: recoveryCode,
      tipo: 'recuperacion',
      userId: user.id,
      verificado: false,
    });

    console.log('🔑 Código de recuperación generado:', correoElectronico, '- Código:', recoveryCode);

    await emailService.sendPasswordRecoveryEmail(correoElectronico, user.nombre_completo, recoveryCode);

    res.json({ message: 'Código de recuperación enviado. Revisa tu correo.' });
  } catch (error) {
    next(error);
  }
};

// ========== VERIFICAR CÓDIGO DE RECUPERACIÓN ==========
export const verifyRecoveryCode = async (req, res, next) => {
  try {
    const { code, correoElectronico } = req.body;

    const verification = await VerificationTemp.findOne(correoElectronico, 'recuperacion');

    if (!verification) {
      return res.status(400).json({ message: 'No hay solicitud de recuperación activa' });
    }

    const EXPIRATION_TIME = 10 * 60 * 1000;
    const createdAt = new Date(verification.created_at).getTime();
    if (Date.now() - createdAt > EXPIRATION_TIME) {
      await VerificationTemp.delete(verification.id);
      return res.status(400).json({ message: 'El código de recuperación ha expirado' });
    }

    if (parseInt(code) !== verification.codigo_verificacion) {
      return res.status(400).json({ message: 'Código incorrecto' });
    }

    await VerificationTemp.update(verification.id, { verificado: true });

    res.json({ message: 'Código verificado correctamente' });
  } catch (error) {
    next(error);
  }
};

// ========== RESETEAR CONTRASEÑA ==========
export const resetPassword = async (req, res, next) => {
  try {
    const { newPassword, correoElectronico } = req.body;

    const verification = await VerificationTemp.findVerified(correoElectronico, 'recuperacion');

    if (!verification) {
      return res.status(400).json({ message: 'No hay solicitud de recuperación activa' });
    }

    const EXPIRATION_TIME = 10 * 60 * 1000;
    const createdAt = new Date(verification.created_at).getTime();
    if (Date.now() - createdAt > EXPIRATION_TIME) {
      await VerificationTemp.delete(verification.id);
      return res.status(400).json({ message: 'La sesión ha expirado' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(verification.user_id, { contrasena: hashedPassword });

    const user = await User.findById(verification.user_id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await emailService.sendPasswordChangedEmail(correoElectronico, user.nombre_completo);
    await VerificationTemp.delete(verification.id);

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    next(error);
  }
};

// ========== REENVIAR CÓDIGO DE RECUPERACIÓN ==========
export const resendRecoveryCode = async (req, res, next) => {
  try {
    const { correoElectronico } = req.body;

    checkResendLimit(correoElectronico);

    const verification = await VerificationTemp.findOne(correoElectronico, 'recuperacion');

    if (!verification) {
      return res.status(400).json({ message: 'No hay solicitud de recuperación activa' });
    }

    const recoveryCode = Math.floor(100000 + Math.random() * 900000);

    await VerificationTemp.update(verification.id, {
      codigo_verificacion: recoveryCode,
      created_at: new Date(),
      verificado: false,
    });

    recordResendAttempt(correoElectronico);

    console.log('🔄 Código de recuperación reenviado:', correoElectronico, '- Nuevo código:', recoveryCode);

    const user = await User.findById(verification.user_id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await emailService.sendPasswordRecoveryEmail(correoElectronico, user.nombre_completo, recoveryCode);

    res.json({ message: 'Nuevo código enviado. Revisa tu correo.' });
  } catch (error) {
    next(error);
  }
};

// ========== PERFIL ==========
export const getProfile = async (req, res) => {
  res.json({
    message: 'Perfil obtenido exitosamente',
    user: req.user,
  });
};