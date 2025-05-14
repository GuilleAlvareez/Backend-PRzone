import { betterAuth } from 'better-auth'
import { createPool } from 'mysql2/promise'
import { username } from 'better-auth/plugins'

export const auth = betterAuth({
  database: createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'przone'
  }),
  emailAndPassword: {
    enabled: true
  },
  user: {
    additionalFields: {
      admin: {
        type: 'boolean', // Define el tipo como booleano
        required: false, // No es estrictamente requerido ya que tiene un default
        defaultValue: false, // Establece el valor por defecto a false
        input: true
      }
    }
  },
  plugins: [
    username({
      minUsernameLength: 3, // Longitud mínima (puedes ajustar)
      maxUsernameLength: 20
    })
  ]
})
