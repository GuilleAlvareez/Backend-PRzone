import express from 'express'
import cookieParser from 'cookie-parser'
import { connection, PORT } from './config.js'
import cors from 'cors'
import { auth } from './utils/auth.js'
import { fromNodeHeaders } from 'better-auth/node'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

const clientURL = process.env.CLIENT_URL || 'http://localhost:5173'

const corsOptions = {
  origin: clientURL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With']
}

app.use(cors(corsOptions));

app.use(express.json())

app.use(cookieParser())

app.get('/', (req, res) => {
  res.send('Hello from backend!');
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

    console.log('despues de Auth Response:')

    if (authResponse.ok) {
      console.log('dentro de authResponse.ok')
      const cookies = authResponse.headers.getSetCookie()
      const sessionData = await authResponse.json()
      console.log('Session Data:', sessionData)

      // EXTRAE EL TOKEN DE LA COOKIE PARA ENVIARLO
      const sessionTokenCookie = cookies.find(c => c.startsWith('__secure-better-auth.session_token'))
      const sessionToken = sessionTokenCookie ? sessionTokenCookie.split(';')[0].split('=')[1] : null
      console.log('Session Token:', sessionToken)

      res.setHeader('Set-Cookie', cookies)
      console.log('Cookies seteadas:', cookies)

      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        user: sessionData.user,
        token: sessionToken
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
  const { name, username, category, description } = req.body

  if (!name || !username) {
    return res.status(400).json({ message: 'Name and username are required.' })
  }

  try {
    // Insertar el ejercicio
    const [result] = await connection.execute(
      'INSERT INTO Ejercicio (nombre, visibilidad, descripcion) VALUES (?, ?, ?)',
      [name, username, description]
    )

    const exerciseId = result.insertId

    // Insertar músculos si hay
    if (Array.isArray(category) && category.length > 0) {
      const values = category.map((muscleId) => [exerciseId, muscleId])
      await connection.query(
        'INSERT INTO Ejercicio_Musculo (ejercicio_id, musculo_id) VALUES ?',
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
  const { name, category } = req.body

  if (!id || !name) {
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
      'DELETE FROM Ejercicio_Musculo WHERE ejercicio_id = ?',
      [id]
    )

    // Insertar nuevos músculos si hay
    if (Array.isArray(category) && category.length > 0) {
      const values = category.map((muscleId) => [id, muscleId])
      await connection.query(
        'INSERT INTO Ejercicio_Musculo (ejercicio_id, musculo_id) VALUES ?',
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
      'DELETE FROM Ejercicio_Musculo WHERE ejercicio_id = ?',
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

app.get('/exercises/details/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID del ejercicio requerido.' })
  }

  try {
    const [exercise] = await connection.query(
      'SELECT * FROM Ejercicio WHERE id = ?',
      [id]
    )

    if (exercise.length === 0) {
      return res.status(404).json({ message: 'Entrenamiento no encontrado.' })
    }

    res.status(200).json(exercise[0])
  } catch (error) {
    console.error('Error al obtener el ejercicio:', error)
    res.status(500).json({ message: 'Error interno del servidor al obtener el ejercicio.' })
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
    for (const ejercicio of ejercicios) {
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

// Chat bot
app.post('/chat', async (req, res) => {
  const { messages, userId } = req.body

  if (!messages) {
    return res.status(400).json({ message: 'Messages is required.' })
  }

  try {
    const systemPrompt = `
      Eres PR-Bot, el asistente de IA y entrenador personal experto integrado en la aplicación PRzone. Tu identidad es la de un profesional del fitness de élite: eres conocedor, motivador, y tu principal prioridad es la seguridad y el progreso del usuario.

      Tu misión principal:
      Proporcionar orientación experta, detallada y excepcionalmente clara sobre todo lo relacionado con el entrenamiento de fuerza y el fitness para ayudar a los usuarios a alcanzar sus metas de forma efectiva y segura.

      Tus áreas de especialización (puedes ayudar con todo esto):
      1. Creación y modificación de rutinas: Diseñar planes de entrenamiento completos basados en los objetivos del usuario (hipertrofia, fuerza, resistencia), nivel de experiencia (principiante, intermedio, avanzado), días disponibles por semana y equipo disponible (gimnasio completo, solo mancuernas, peso corporal, etc.).
      2. Técnica de ejercicios: Describir paso a paso la forma correcta de realizar cualquier ejercicio. Incluye músculos trabajados, consejos clave para la postura y errores comunes a evitar.
      3. Conceptos de fitness: Explicar de manera sencilla y detallada cualquier teoría o concepto de entrenamiento, como sobrecarga progresiva, RPE (esfuerzo percibido), RIR (repeticiones en reserva), superávit o déficit calórico, periodización, semanas de descarga, etc.
      4. Nutrición para el rendimiento: Ofrecer consejos generales sobre nutrición deportiva (macros, timing de nutrientes, hidratación, suplementos básicos como proteína o creatina).
      5. Resolución de dudas: Responder a cualquier pregunta específica que el usuario tenga sobre sus entrenamientos, progreso o planificación.
      6. Motivación y estrategia: Dar consejos para superar estancamientos, mantenerse motivado y ajustar el plan a largo plazo.

      Reglas de comportamiento y formato obligatorias:

      1. Detalle y claridad máxima: Tu principal característica es la claridad. Nunca des respuestas cortas o vagas. Estructura siempre tu información para que sea fácil de leer y entender. Utiliza listas con guiones o numeradas para desglosar pasos, beneficios o planes. Destaca los conceptos clave usando frases claras. Usa párrafos cortos y directos.

      2. Haz preguntas clarificadoras: Antes de proporcionar un plan o consejo específico, siempre debes hacer preguntas para entender el contexto del usuario si no lo tienes. Pregunta sobre su objetivo principal (por ejemplo: ¿Buscas ganar masa muscular, fuerza o resistencia?), su nivel de experiencia (por ejemplo: ¿Cuánto tiempo llevas entrenando de forma consistente?), su frecuencia de entrenamiento (por ejemplo: ¿Cuántos días a la semana puedes entrenar?) y el equipo que tiene disponible.

      3. La seguridad es lo primero (regla no negociable):
      - Nunca ofrezcas consejos médicos. No eres un doctor ni un fisioterapeuta.
      - Si un usuario menciona dolor, una lesión o una condición médica, tu respuesta prioritaria debe ser una recomendación clara y directa de que consulte a un profesional de la salud cualificado (médico, fisioterapeuta). No intentes diagnosticar, tratar o sugerir ejercicios para rehabilitar.
      - Siempre que describas un ejercicio, incluye una nota sobre la importancia de empezar con un peso ligero para dominar la técnica.

      4. Tono profesional y motivador: Habla con la autoridad de un experto, pero con un tono alentador y positivo. Evita el lenguaje excesivamente coloquial. Eres un coach, no un colega. Usa frases como: "Excelente pregunta", "Ese es un gran objetivo", "Vamos a diseñar un plan para que lo consigas".
      `

    const systemMessage = {
      role: 'system',
      content: systemPrompt
    }

    const userMessage = messages[messages.length - 1]

    await connection.query(
      'INSERT INTO Mensaje (usuario_id, fecha, rol, mensaje) VALUES (?, NOW(), ?, ?)',
      [userId, 'user', userMessage.content]
    )

    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    const messagesWithSystemPrompt = [systemMessage, ...formattedMessages]

    const messageToSend = {
      model: process.env.model,
      messages: messagesWithSystemPrompt
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageToSend)
    })

    const data = await response.json()

    const replyAI = data.choices[0].message.content

    await connection.query(
      'INSERT INTO Mensaje (usuario_id, fecha, rol, mensaje) VALUES (?, NOW(), ?, ?)',
      [userId, 'assistant', replyAI]
    )

    const dataSendFront = {
      created: data.created,
      role: data.choices[0].message.role,
      reply: replyAI
    }

    res.json(dataSendFront)
  } catch (err) {
    console.error('Error during chat:', err)
    return res.status(500).json({ message: 'Internal server error.' })
  }
})

app.get('/chat/history/:userId', async (req, res) => {
  const { userId } = req.params // Leemos el ID de los parámetros de la URL

  if (!userId) {
    return res.status(400).json({ message: 'El ID de usuario es requerido.' })
  }

  try {
    const [rows] = await connection.query(
      'SELECT rol, mensaje FROM Mensaje WHERE usuario_id = ? ORDER BY fecha ASC',
      [userId]
    )

    // Mapeamos al formato { role, content } que usa el estado del frontend
    const history = rows.map(row => ({
      role: row.rol,
      content: row.mensaje
    }))

    res.json(history)
  } catch (err) {
    console.error('Error al obtener el historial del chat:', err)
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})

app.delete('/chat/history/:userId', async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ message: 'El ID de usuario es requerido.' })
  }

  try {
    await connection.query('DELETE FROM Mensaje WHERE usuario_id = ?', [userId])

    res.status(200).json({ message: 'Historial eliminado correctamente.' })
  } catch (err) {
    console.error('Error al eliminar el historial del chat:', err)
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})

console.log('process.env.PORT:', process.env.PORT);
console.log('PORT exportada:', PORT);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`)
})
