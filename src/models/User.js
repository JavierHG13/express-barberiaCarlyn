import { pool } from "../config/database.js";

class User {
  static async findByEmail(correoElectronico) {
    const result = await pool.query(
      'SELECT * FROM tbl_usuarios WHERE correo_electronico = $1',
      [correoElectronico]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM tbl_usuarios WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async create({ nombreCompleto, correoElectronico, telefono, contrasena }) {
    const result = await pool.query(
      `INSERT INTO tbl_usuarios (nombre_completo, correo_electronico, telefono, contrasena)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombreCompleto, correoElectronico, telefono, contrasena]
    );
    return result.rows[0];
  }

  static async update(id, { contrasena }) {
    const result = await pool.query(
      'UPDATE tbl_usuarios SET contrasena = $1 WHERE id = $2 RETURNING *',
      [contrasena, id]
    );
    return result.rows[0];
  }
}

export default User;