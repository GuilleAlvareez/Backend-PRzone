import express from 'express'
import { PORT, conectarDB } from './config.js'
// import mysql from 'mysql2/promise'

const app = express()

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/login', (req, res) => {
  res.json({ user: 'Guille' })
})

app.post('/register', (req, res) => {
  const { username, password, email } = req.body

  try {
    const connection = conectarDB()
    const newUser = {
      username,
      password,
      email
    }

    const query = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)'
    const values = [newUser.username, newUser.password, newUser.email]

    connection.query(query, values)
      .then(result => {
        res.send('Usuario creado con éxito')
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

})

app.post('/protected', (req, res) => {

})

app.listen(PORT, () => {
  conectarDB()
    .then(() => {
      console.log('✅ Conectado a MySQL')
    })
    .catch((err) => {
      console.error('❌ Error al conectar a MySQL', err)
    })
  console.log(`Server is running on port ${PORT}`)
})
