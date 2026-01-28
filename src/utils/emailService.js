import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendVerificationEmail(email, name, code) {
    await this.transporter.sendMail({
      from: `"Barbería Carlyn - Soporte" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verificación de correo',
      html: `
        <h2>Hola ${name} 👋</h2>
        <p>Bienvenido a <strong>Barbería Carlyn</strong>.</p>
        <p>Tu código de verificación es:</p>
        <h3>${code}</h3>
        <p>Ingresa este código en la aplicación para activar tu cuenta.</p>
      `,
    });
  }

  async sendPasswordRecoveryEmail(email, name, code) {
    await this.transporter.sendMail({
      from: `"Barbería Carlyn - Soporte" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Barbería Carlyn – Recuperación de contraseña',
      html: `
        <h2>Hola ${name}</h2>
        <p>Has solicitado recuperar tu contraseña de <strong>Barbería Carlyn</strong>.</p>
        <p>Tu código de recuperación es:</p>
        <h3>${code}</h3>
        <p>Ingresa este código en la aplicación para restablecer tu contraseña.</p>
        <p><small>Este código expira en 10 minutos.</small></p>
        <p><small>Si no solicitaste esto, ignora este mensaje.</small></p>
      `,
    });
  }

  async sendPasswordChangedEmail(email, name) {
    await this.transporter.sendMail({
      from: `"Barbería Carlyn - Soporte" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Tu contraseña ha sido actualizada',
      html: `
        <h2>Hola ${name}</h2>
        <p>Queremos informarte que tu contraseña ha sido actualizada exitosamente.</p>
        <p>Si no realizaste este cambio, contacta inmediatamente con soporte.</p>
      `,
    });
  }
}

export default new EmailService();