import mysql from 'mysql2/promise'

export const {
  PORT = 3000,
  SECRET_JWT_KEY = 'the-secret-key-jwt&572'
} = process.env

export const connection = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'przone'
})
