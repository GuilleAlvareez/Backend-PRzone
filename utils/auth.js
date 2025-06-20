import { betterAuth } from 'better-auth'
import { createPool } from 'mysql2/promise'
import { username, bearer } from 'better-auth/plugins'
import dotenv from 'dotenv'

dotenv.config()

const isProduction = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  url: process.env.BETTER_AUTH_URL,
  trustedOrigins: ['https://przone.vercel.app'], 
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
  advanced: {
    defaultCookieAttributes: {
      secure: true, 
      sameSite: 'none' 
    }
  },
  emailAndPassword: {
    enabled: true
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
    }),
    bearer()
  ]
})
