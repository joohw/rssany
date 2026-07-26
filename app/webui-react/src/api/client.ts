export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError(`API 返回了无效 JSON（${response.status}）`, response.status)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body
      ? ('error' in body && typeof body.error === 'string' ? body.error
        : 'message' in body && typeof body.message === 'string' ? body.message
          : `请求失败（HTTP ${response.status}）`)
      : `请求失败（HTTP ${response.status}）`
    throw new ApiError(message, response.status)
  }
  return body as T
}
