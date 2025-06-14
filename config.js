import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

export const PORT = process.env.PORT || 3000;

export const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'przone',
  ssl: {
    rejectUnauthorized: true
  }
})
