import express from 'express'
import cookieParser from 'cookie-parser'
import { connection, PORT } from './config.js'
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
    const registrationResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        ...(username && { username }),
        admin: true
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

app.get('/exercises', async (req, res) => {
  const query = 'SELECT * FROM Ejercicio'

  try {
    const [results] = await connection.query(query)
    res.status(200).json({
      results: results,
      category: 'all'
    })
  } catch (err) {
    console.error('Error fetching exercises:', err)
    res.status(500).json({ message: 'Error fetching exercises.' })
  }
})

app.post('/exercises/new', async (req, res) => {
  const { name, username, category } = req.body

  if (!name || !username) {
    return res.status(400).json({ message: 'Name and category are required.' })
  }

  // const query = 'INSERT INTO Ejercicio (nombre, visibilidad) VALUES (?, ?)'

  try {
    // Insertar el ejercicio
    const [result] = await connection.execute(
      'INSERT INTO Ejercicio (nombre, visibilidad) VALUES (?, ?)',
      [name, username]
    )

    const exerciseId = result.insertId
    console.log('Exercise ID:', exerciseId)

    // Insertar músculos si hay
    if (Array.isArray(category) && category.length > 0) {
      const values = category.map((muscleId) => [exerciseId, muscleId])
      await connection.query(
        'INSERT INTO Ejercicio_musculo (ejercicio_id, musculo_id) VALUES ?',
        [values]
      )

      return res.status(201).json({ message: 'Exercise created successfully with muscles.' })
    } else {
      return res.status(201).json({ message: 'Exercise created successfully without muscles.' })
    }
  } catch (err) {
    console.error('Error during exercise creation:', err)
    return res.status(500).json({ message: 'Internal server error.' })
  }

  // connection.query(query, [name, username], (err, results) => {
  //   if (err) {
  //     console.error('Error creating exercise:', err)
  //     return res.status(500).json({ message: 'Error creating exercise.' })
  //   }

  //   console.log('Results from first query:', results) // Verifica lo que contiene results
  //   const exerciseId = results.insertId
  //   console.log('Exercise ID:', exerciseId)

  //   if (category.length > 0) {
  //     const values = category.map((muscleId) => [exerciseId, muscleId])
  //     const insertMusclesQuery = 'INSERT INTO Ejercicio_musculo (ejercicio_id, musculo_id) VALUES ?'

  //     connection.query(insertMusclesQuery, [values], (err2) => {
  //       if (err2) {
  //         console.error('Error linking muscles:', err2)
  //         return res.status(500).json({ message: 'Error linking muscles to exercise.' })
  //       }
  //       res.status(201).json({ message: 'Exercise created successfully.' })
  //     })
  //   } else {
  //     // Si no hay músculos, devolver solo éxito de creación
  //     return res.status(201).json({ message: 'Exercise created successfully without muscles.' })
  //   }
  // })
})

app.delete('/exercises/delete/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID del ejercicio requerido.' })
  }

  try {
    // Primero elimina relaciones con músculos si existen
    await connection.query(
      'DELETE FROM Ejercicio_musculo WHERE ejercicio_id = ?',
      [id]
    )

    // Luego elimina el ejercicio
    const [result] = await connection.query(
      'DELETE FROM Ejercicio WHERE id = ?',
      [id]
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Ejercicio no encontrado.' })
    }

    res.status(200).json({ message: 'Ejercicio eliminado correctamente.' })
  } catch (error) {
    console.error('Error al eliminar ejercicio:', error)
    res.status(500).json({ message: 'Error interno del servidor al eliminar ejercicio.' })
  }
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
