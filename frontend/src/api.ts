export type User = {
  id: string
  email: string
  displayName: string
}

export type Session = {
  token: string
  user: User
}

export type DocumentRecord = {
  id: string
  ownerUserId: string
  title: string
  content: string
  version: number
  metadata: Record<string, unknown>
  permissionRole: 'owner' | 'editor' | 'viewer'
  statistics: {
    characterCount: number
    wordCount: number
    lastEditedByUserId: string | null
    lastEditedAt: string | null
  }
  createdAt: string
  updatedAt: string
}

export type SessionResponse = {
  token: string
  tokenType: string
  expiresInSeconds: number
  user: User
}

type ErrorResponse = {
  message?: string
  details?: Array<{ field?: string; message?: string }>
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await readError(response)
    throw new ApiError(error, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorResponse
    const detail = body.details?.find((item) => item.message)?.message
    return detail || body.message || `Request failed with status ${response.status}.`
  } catch {
    return `Request failed with status ${response.status}.`
  }
}

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
}
