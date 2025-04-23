import mysql from 'mysql2/promise'

export const {
  PORT = 3000
} = process.env

export async function conectarDB () {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'przone'
  })

  return connection
}
