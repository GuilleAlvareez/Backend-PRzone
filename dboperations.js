import { connection } from './config.js'

export async function findUser (username, password) {
  try {
    const [rows] = await connection.query(
      'SELECT username, password, email FROM User WHERE username = ? AND password = ?',
      [username, password]
    )
    return rows
  } catch (err) {
    console.error('Error al verificar usuario:', err)
    return []
  }
}
