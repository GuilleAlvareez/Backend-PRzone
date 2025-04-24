import { findUser } from './dboperations.js'

export function formatDate (date) {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export async function login (username, password) {
  const user = await findUser(username, password)

  if (!user) throw new Error('Usuario no existe')

  const { password: _, ...publicUser } = user
  return publicUser
}
