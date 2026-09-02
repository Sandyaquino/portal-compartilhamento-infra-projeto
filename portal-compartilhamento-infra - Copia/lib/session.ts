const TOKEN_KEY = "token"
const USER_KEY = "usuario"

export const TOKEN_COOKIE_NAME = "portal_token"

const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 8

export function setSession(token: string, usuario: unknown) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(usuario))
  document.cookie = `${TOKEN_COOKIE_NAME}=${token}; path=/; max-age=${TOKEN_MAX_AGE_SECONDS}; samesite=lax`
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0`
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}
