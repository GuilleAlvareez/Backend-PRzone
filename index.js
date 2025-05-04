import express from 'express'
import cookieParser from 'cookie-parser'
import { PORT } from './config.js'
import cors from 'cors'
import { auth } from './utils/auth.js'
import { fromNodeHeaders } from 'better-auth/node'

const app = express()

app.use(express.json())

app.use(cookieParser())

app.use(cors({
  // Especifica el origen EXACTO de tu frontend
  origin: 'http://localhost:5173', // <-- CAMBIA ESTO si tu frontend está en otro puerto/dominio
  // Permite que el navegador envíe y reciba cookies
  credentials: true,
  // Puedes mantener los otros métodos y headers si los necesitas explícitamente,
  // aunque 'cors' suele manejar bien los comunes por defecto.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With']
}))

app.get('/', (req, res) => {
  // const { user } = req.session

  // return res.send({ data })
})

app.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son requeridos' })
  }

  try {
    const authResponse = await auth.api.signInEmail({
      body: {
        email: email,
        password: password
      },
      asResponse: true // Muy importante para obtener el objeto Response completo
    })

    if (authResponse.ok) {
      const cookies = authResponse.headers.getSetCookie()
      const sessionData = await authResponse.json()

      res.setHeader('Set-Cookie', cookies)

      // Considera enviar solo la información necesaria del usuario
      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        user: sessionData.user // O solo los campos que necesites
      })
    } else {
      let errorBody = { message: 'Error al iniciar sesión.' }
      try {
        errorBody = await authResponse.json()
      } catch (e) {
        // No se pudo parsear el cuerpo del error, usa el mensaje genérico
      }
      console.error('Error de Better Auth:', errorBody)
      return res.status(authResponse.status).json(errorBody)
    }
  } catch (error) {
    console.error('Error inesperado en /login:', error)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// Ruta de ejemplo para obtener la sesión actual (manejada por toNodeHandler)
// El frontend llamaría a GET /api/auth/session
// app.get('/api/me', async (req, res) => {
//   try {
//     const session = await auth.api.getSession({
//       headers: fromNodeHeaders(req.headers)
//     })
//     if (!session) {
//       return res.status(401).json({ message: 'No autenticado' })
//     }
//     return res.status(200).json({ user: session.user })
//   } catch (error) {
//     console.error('Error en /api/me:', error)
//     return res.status(500).json({ message: 'Error interno del servidor' })
//   }
// })

app.post('/register', async (req, res) => {
  const { email, password, name, username } = req.body

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Email, contraseña y nombre son requeridos.' })
  }

  if (auth.options.plugins?.some(p => p.id === 'username') && !username) {
    return res.status(400).json({ message: 'Nombre de usuario es requerido.' })
  }

  try {
    console.log('Intentando registrar usuario:', { email, name, username })

    const registrationResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        ...(username && { username })
      }
    })

    console.log('Usuario registrado:', registrationResult)

    return res.status(201).json({
      message: 'Usuario registrado exitosamente. Por favor, inicia sesión.'
    })
  } catch (error) {
    console.error('Error durante el registro:', error)
    return res.status(500).json({ message: 'Error interno del servidor durante el registro.' })
  }
})

app.post('/logout', async (req, res) => {
  try {
    const response = await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true // Necesario para obtener las cabeceras Set-Cookie
    })

    // Aplicar las cabeceras Set-Cookie de la respuesta de Better Auth a la respuesta de Express
    const setCookieHeaders = response.headers.getSetCookie()
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      res.setHeader('Set-Cookie', setCookieHeaders)
    }

    res.status(200).json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error) // Es útil mantener esto para depuración en el servidor
  }
})

app.get('/api/me', async (req, res) => {
  try {
    // 1. Convierte las cabeceras de Express a Headers estándar
    const requestHeaders = fromNodeHeaders(req.headers)

    // 2. Llama a getSession pasando las cabeceras
    const sessionData = await auth.api.getSession({
      headers: requestHeaders
    })

    // 3. Verifica si se encontró una sesión
    if (sessionData) {
      // ¡Éxito! Tienes la información del usuario y la sesión
      const user = sessionData.user
      const session = sessionData.session

      console.log(user)

      // Devuelve la información relevante (¡cuidado con devolver datos sensibles!)
      res.json({
        user,
        sessionId: session.id
      })
    } else {
      // No hay sesión válida
      res.status(401).json({ error: 'Unauthorized', message: 'No active session found.' })
    }
  } catch (error) {
    console.error('Error al obtener la sesión en /api/me:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.post('/protected', (req, res) => {})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
