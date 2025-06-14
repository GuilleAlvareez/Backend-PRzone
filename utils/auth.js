import { betterAuth } from 'better-auth'
import { createPool } from 'mysql2/promise'
import { username } from 'better-auth/plugins'
import dotenv from 'dotenv'

dotenv.config()

const isProduction = process.env.NODE_ENV === 'production';

export const auth = betterAuth({
  database: createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'przone',
    ssl: {
      rejectUnauthorized: true
    }
  }),
  emailAndPassword: {
    enabled: true
  },
  cookies: {
    // En producción, permite cross-site. En desarrollo, usa el default 'lax'.
    sameSite: isProduction ? 'none' : 'lax',
    // En producción, la cookie DEBE ser segura (solo HTTPS).
    secure: isProduction,
  },
  user: {
    additionalFields: {
      admin: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: true
      }
    }
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 20
    })
  ]
})
