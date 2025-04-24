import express from 'express'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import { PORT, SECRET_JWT_KEY, connection } from './config.js'
import { formatDate, login } from './methods.js'
// import mysql from 'mysql2/promise'

const app = express()

app.use(express.json())

app.use(cookieParser())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*') // o reemplaza '*' con tu URL frontend si deseas limitarlo

  // Permitir ciertos métodos HTTP
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  // Permitir ciertos encabezados
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept, X-Requested-With')

  // Si estás trabajando con credenciales (cookies, autenticación básica), debes permitirlo
  res.header('Access-Control-Allow-Credentials', 'true')

  // Si es una solicitud OPTIONS (preflight request), solo responde con un 200 OK
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const token = req.cookies.access_token
  let data = null

  req.session = { user: null }

  try {
    data = jwt.verify(token, SECRET_JWT_KEY)
    req.session.user = data
  } catch {}

  next()
})

app.get('/', (req, res) => {
  // const { user } = req.session

  // return res.send({ data })
})

app.post('/login', async (req, res) => {
  const { username, password } = req.body
  try {
    const user = await login(username, password)
    const token = jwt.sign({ username: user.username, email: user.email }, SECRET_JWT_KEY, { expiresIn: '1h' })

    res
      .cookie('access_token', token, {
        httpOnly: true, // solo se acedde a la cookie desde el servidor
        sameSite: 'strict', // se accede a la cookie solo desde el mismo dominio
        maxAge: 3600000 * 360 // 1 hour
      })
      .json({ user, token })
  } catch (error) {
    console.error('Error al iniciar sesión:', error)
    res.status(401).json({ error: error.message })
  }
})

app.post('/register', (req, res) => {
  const { username, password, email } = req.body
  const actualDate = formatDate(new Date())

  try {
    const newUser = {
      username,
      password,
      email,
      actualDate
    }

    const query = 'INSERT INTO User (username, password, email) VALUES (?, ?, ?)'
    const values = [newUser.username, newUser.password, newUser.email, newUser.actualDate]

    connection.query(query, values)
      .then(result => {
        res.send({ succes: true, data: 'Usuario creado con éxito' })
      })
      .catch(err => {
        console.error('Error al insertar el usuario:', err)
        res.status(500).json({ error: 'Error al insertar el usuario' })
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/logout', (req, res) => {
  res.clearCookie('access_token')
  res.send({ message: 'Logout success' })
})

app.post('/protected', (req, res) => {
  // const {user } = req.session
  // if (!user) {
  //   return res.status(401).json({ error: 'Acces not authorized' })
  // }

  // res.send({ data })
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
