import { pool } from "../config/database.js";

class VerificationTemp {
  static async create({
    correoElectronico,
    nombreCompleto,
    telefono,
    contrasena,
    codigoVerificacion,
    tipo,
    userId = null,
    verificado = false,
  }) {
    const result = await pool.query(
      `INSERT INTO tbl_verificaciones_temp 
       (correo_electronico, nombre_completo, telefono, contrasena, codigo_verificacion, tipo, user_id, verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [correoElectronico, nombreCompleto, telefono, contrasena, codigoVerificacion, tipo, userId, verificado]
    );
    return result.rows[0];
  }

  static async findOne(correoElectronico, tipo) {
    const result = await pool.query(
      'SELECT * FROM tbl_verificaciones_temp WHERE correo_electronico = $1 AND tipo = $2',
      [correoElectronico, tipo]
    );
    return result.rows[0];
  }

  static async findVerified(correoElectronico, tipo) {
    const result = await pool.query(
      'SELECT * FROM tbl_verificaciones_temp WHERE correo_electronico = $1 AND tipo = $2 AND verificado = TRUE',
      [correoElectronico, tipo]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE tbl_verificaciones_temp SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM tbl_verificaciones_temp WHERE id = $1', [id]);
  }

  static async deleteByEmail(correoElectronico, tipo) {
    await pool.query(
      'DELETE FROM tbl_verificaciones_temp WHERE correo_electronico = $1 AND tipo = $2',
      [correoElectronico, tipo]
    );
  }

  static async cleanOldVerifications() {
    await pool.query(
      "DELETE FROM tbl_verificaciones_temp WHERE created_at < NOW() - INTERVAL '10 minutes'"
    );
  }
}

export default VerificationTemp;