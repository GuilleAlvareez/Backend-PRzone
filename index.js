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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
      asResponse: true
    })

    if (authResponse.ok) {
      const cookies = authResponse.headers.getSetCookie()
      const sessionData = await authResponse.json()

      res.setHeader('Set-Cookie', cookies)

      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        user: sessionData.user
      })
    } else {
      let errorBody = { message: 'Error al iniciar sesión.' }
      try {
        errorBody = await authResponse.json()
      } catch (e) {
      }
      console.error('Error de Better Auth:', errorBody)
      return res.status(authResponse.status).json(errorBody)
    }
  } catch (error) {
    console.error('Error inesperado en /login:', error)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/register', async (req, res) => {
  const { email, password, name, username } = req.body

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Email, contraseña y nombre son requeridos.' })
  }

  // si no existe auth.options.plugins este sera undefined gracias al ?
  if (auth.options.plugins?.some(p => p.id === 'username') && !username) {
    return res.status(400).json({ message: 'Nombre de usuario es requerido.' })
  }

  try {
    const registrationResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        // añadimos username solo si tiene un valor
        ...(username && { username }),
        admin: false
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
      returnHeaders: true
    })

    // Aplicar las cabeceras Set-Cookie de la respuesta de Better Auth a la respuesta de Express
    const setCookieHeaders = response.headers.getSetCookie()
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      res.setHeader('Set-Cookie', setCookieHeaders)
    }

    res.status(200).json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
  }
})

app.get('/api/me', async (req, res) => {
  try {
    // Convierte las cabeceras de Express a Headers estándar
    const requestHeaders = fromNodeHeaders(req.headers)

    const sessionData = await auth.api.getSession({
      headers: requestHeaders
    })

    if (sessionData) {
      const user = sessionData.user
      const session = sessionData.session

      res.json({
        user,
        sessionId: session.id
      })
    } else {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session found.' })
    }
  } catch (error) {
    console.error('Error al obtener la sesión en /api/me:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.get('/exercises/:username', async (req, res) => {
  const { username } = req.params

  try {
    const [exercises] = await connection.query('SELECT * FROM Ejercicio WHERE visibilidad = ? OR visibilidad = "public"', [username])

    const exercisesWithMuscles = await Promise.all(
      exercises.map(async (exercise) => {
        try {
          const muscleQuery = `
            SELECT m.id, m.nombre 
            FROM Musculo m
            JOIN Ejercicio_Musculo em ON m.id = em.musculo_id 
            WHERE em.ejercicio_id = ?
          `

          const [muscles] = await connection.query(muscleQuery, [exercise.id])

          return {
            ...exercise,
            category: muscles // Ahora devolvemos un array plano de objetos músculo
          }
        } catch (muscleError) {
          console.error(`Error fetching muscles for exercise ${exercise.id}:`, muscleError)
          return {
            ...exercise,
            category: []
          }
        }
      })
    )

    res.status(200).json({
      results: exercisesWithMuscles,
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
    return res.status(400).json({ message: 'Name and username are required.' })
  }

  try {
    // Insertar el ejercicio
    const [result] = await connection.execute(
      'INSERT INTO Ejercicio (nombre, visibilidad) VALUES (?, ?)',
      [name, username]
    )

    const exerciseId = result.insertId

    // Insertar músculos si hay
    if (Array.isArray(category) && category.length > 0) {
      const values = category.map((muscleId) => [exerciseId, muscleId])
      await connection.query(
        'INSERT INTO Ejercicio_musculo (ejercicio_id, musculo_id) VALUES ?',
        [values]
      )

      return res.status(201).json({
        message: 'Exercise created successfully with muscles.',
        exerciseId: exerciseId
      })
    } else {
      return res.status(201).json({
        message: 'Exercise created successfully without muscles.',
        exerciseId: exerciseId
      })
    }
  } catch (err) {
    console.error('Error during exercise creation:', err)
    return res.status(500).json({ message: 'Internal server error.' })
  }
})

app.patch('/exercises/update/:id', async (req, res) => {
  const { id } = req.params
  const { name, username, category } = req.body

  if (!id || !name || !username) {
    return res.status(400).json({ message: 'ID, name and username are required.' })
  }

  try {
    // Actualizar el ejercicio
    await connection.query(
      'UPDATE Ejercicio SET nombre = ? WHERE id = ?',
      [name, id]
    )

    // Eliminar los músculos antiguos
    await connection.query(
      'DELETE FROM Ejercicio_musculo WHERE ejercicio_id = ?',
      [id]
    )

    // Insertar nuevos músculos si hay
    if (Array.isArray(category) && category.length > 0) {
      const values = category.map((muscleId) => [id, muscleId])
      await connection.query(
        'INSERT INTO Ejercicio_musculo (ejercicio_id, musculo_id) VALUES ?',
        [values]
      )
    }

    res.status(200).json({ message: 'Exercise updated successfully.' })
  } catch (err) {
    console.error('Error during exercise update:', err)
    return res.status(500).json({ message: 'Internal server error.' })
  }
})

app.delete('/exercises/delete/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID del ejercicio requerido.' })
  }

  try {
    await connection.query(
      'DELETE FROM Ejercicio_musculo WHERE ejercicio_id = ?',
      [id]
    )

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

app.get('/workouts/:id', async (req, res) => {
  const { id } = req.params

  try {
    const [workouts] = await connection.query('SELECT * FROM Entreno WHERE usuario_id = ?', [id])

    res.status(200).json({
      results: workouts,
      category: 'all'
    })
  } catch (err) {
    console.error('Error fetching workouts:', err)
    res.status(500).json({ message: 'Error fetching workouts.' })
  }
})

app.delete('/workouts/delete/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID del entrenamiento requerido.' })
  }

  try {
    // Iniciar transacción
    await connection.beginTransaction()

    await connection.query(
      'DELETE FROM Ejercicio_realizado WHERE entreno_id = ?',
      [id]
    )

    const [result] = await connection.query(
      'DELETE FROM Entreno WHERE id = ?',
      [id]
    )

    if (result.affectedRows === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'Entrenamiento no encontrado.' })
    }

    // Confirmar transacción
    await connection.commit()

    res.status(200).json({ message: 'Entrenamiento y ejercicios asociados eliminados correctamente.' })
  } catch (err) {
    // Revertir transacción en caso de error
    await connection.rollback()
    console.error('Error al eliminar entrenamiento:', err)
    res.status(500).json({ message: 'Error interno del servidor al eliminar entrenamiento.' })
  }
})

app.post('/workouts/new', async (req, res) => {
  console.log('Recibida solicitud a /workouts/new')
  console.log('Datos recibidos:', req.body)

  const { nombre, fecha, valoracion, comentarios, ejercicios, usuarioId, numeroEjercicios } = req.body

  // Validación de datos
  if (!nombre || !fecha || !valoracion || !ejercicios || !usuarioId) {
    console.error('Datos incompletos:', { nombre, fecha, valoracion, ejercicios, usuarioId })
    return res.status(400).json({ message: 'All fields are required.' })
  }

  try {
    // Iniciar transacción para garantizar integridad
    await connection.beginTransaction()

    console.log('Iniciando transacción para crear entrenamiento')
    console.log('Insertando entrenamiento con datos:', {
      usuarioId,
      nombre,
      fecha,
      valoracion,
      numeroEjercicios: numeroEjercicios || ejercicios.length,
      comentarios
    })

    // IMPORTANTE: Corregir el orden de los parámetros para que coincida con la consulta SQL
    const [result] = await connection.execute(
      'INSERT INTO Entreno (usuario_id, nombre, fecha, valoracion, numero_ejercicios, comentarios) VALUES (?, ?, ?, ?, ?, ?)',
      [usuarioId, nombre, fecha, valoracion, numeroEjercicios || ejercicios.length, comentarios]
    )

    const workoutId = result.insertId
    console.log('Entrenamiento creado con ID:', workoutId)

    // Insertar ejercicios
    console.log('Insertando ejercicios:', ejercicios)

    for (const ejercicio of ejercicios) {
      console.log('Insertando ejercicio:', ejercicio)

      if (!ejercicio.nombre_id) {
        throw new Error('ID de ejercicio no proporcionado')
      }

      await connection.execute(
        'INSERT INTO Ejercicio_realizado (entreno_id, ejercicio_id, peso, series, repeticiones, rm_estimado, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          workoutId,
          ejercicio.nombre_id,
          ejercicio.peso || 0,
          ejercicio.series || 0,
          ejercicio.repeticiones || 0,
          parseFloat((ejercicio.peso * (1 + 0.0333 * ejercicio.repeticiones)).toFixed(2)),
          ejercicio.observaciones || null
        ]
      )
    }

    // Confirmar transacción
    await connection.commit()
    console.log('Transacción completada con éxito')

    // Enviar respuesta exitosa
    return res.status(201).json({
      success: true,
      message: 'Workout created successfully',
      workoutId
    })
  } catch (err) {
    // Revertir transacción en caso de error
    await connection.rollback()
    console.error('Error durante la creación del entrenamiento:', err)
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: err.message
    })
  }
})

app.get('/workouts/details/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID del entrenamiento requerido.' })
  }

  try {
    const [workout] = await connection.query(
      'SELECT * FROM Entreno WHERE id = ?',
      [id]
    )

    if (workout.length === 0) {
      return res.status(404).json({ message: 'Entrenamiento no encontrado.' })
    }

    const [exercises] = await connection.query(
      'SELECT er.*, e.nombre AS ejercicio_nombre FROM Ejercicio_realizado er JOIN Ejercicio e ON er.ejercicio_id = e.id WHERE er.entreno_id = ?',
      [id]
    )

    const completeWorkout = {
      ...workout[0],
      ejercicios: exercises
    }

    res.status(200).json(completeWorkout)
  } catch (error) {
    console.error('Error al obtener el entrenamiento:', error)
    res.status(500).json({ message: 'Error interno del servidor al obtener el entrenamiento.' })
  }
})

app.get('/recentworkouts/:id', async (req, res) => {
  const { id } = req.params

  try {
    const [workouts] = await connection.query(
      'SELECT * FROM Entreno WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 4',
      [id]
    )

    res.status(200).json({
      results: workouts,
      category: 'all'
    })
  } catch (err) {
    console.error('Error fetching recent workouts:', err)
    res.status(500).json({ message: 'Error fetching recent workouts.' })
  }
})

app.get('/dias-consecutivos/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params

  try {
    const [rows] = await connection.query(
      `SELECT DISTINCT DATE(fecha) AS fecha_entrenamiento
       FROM Entreno
       WHERE usuario_id = ?
       ORDER BY fecha_entrenamiento DESC`,
      [usuarioId]
    )

    if (rows.length === 0) {
      return res.json({ diasConsecutivos: 0 })
    }

    let streak = 0
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const fechaEsperada = new Date(hoy)

    for (const row of rows) {
      const fechaEntreno = new Date(row.fecha_entrenamiento)

      const esMismoDia =
        fechaEntreno.getUTCFullYear() === fechaEsperada.getFullYear() &&
        fechaEntreno.getUTCMonth() === fechaEsperada.getMonth() &&
        fechaEntreno.getUTCDate() === fechaEsperada.getDate()

      if (esMismoDia) {
        streak++
        fechaEsperada.setDate(fechaEsperada.getDate() - 1)
      } else if (fechaEntreno < fechaEsperada) {
        break
      }
    }

    res.json({ diasConsecutivos: streak })
  } catch (err) {
    console.error('Error al calcular los días consecutivos:', err)
    res.status(500).json({ error: 'Error al calcular los días consecutivos' })
  }
})

app.get('/exercises/mostused/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params

  try {
    const [rows] = await connection.query(
      `SELECT e.nombre AS ejercicio, COUNT(er.id) AS veces_realizado
      FROM Ejercicio_realizado er
      JOIN Ejercicio e ON er.ejercicio_id = e.id
      JOIN Entreno en ON er.entreno_id = en.id
      WHERE en.usuario_id = ?
      GROUP BY e.nombre
      ORDER BY veces_realizado DESC
      LIMIT 3;`,
      [usuarioId]
    )

    res.json(rows)
  } catch (err) {
    console.error('Error al obtener los ejercicios más usados:', err)
    res.status(500).json({ error: 'Error al obtener los ejercicios más usados' })
  }
})

app.get('/exercises/progress/:exerciseId', async (req, res) => {
  const { exerciseId } = req.params

  try {
    const [rows] = await connection.query(
      `SELECT DATE_FORMAT(en.fecha, '%Y-%m-%d') AS fecha, er.rm_estimado
       FROM Ejercicio_realizado er
       JOIN Entreno en ON er.entreno_id = en.id
       WHERE er.ejercicio_id = ?
       ORDER BY en.fecha ASC;`,
      [exerciseId]
    )

    res.json(rows)
  } catch (err) {
    console.error('Error al obtener el progreso del ejercicio:', err)
    res.status(500).json({ error: 'Error al obtener el progreso del ejercicio' })
  }
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
