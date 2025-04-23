export async funtion addUser (user) {
    const query = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)'
    const values = [newUser.username, newUser.password, newUser.email]

    const result = await connection.execute(query, values)

    result.catch((err) => {
      console.error('Error al insertar el usuario:', err)
      res.status(500).json({ error: 'Error al insertar el usuario' })
    })
    
    res.send("Usuario creado con éxito")
}