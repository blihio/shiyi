// 负责人：A
// 统一的请求封装。所有页面都通过这里调后端，不要自己写 fetch。

import type { ApiEnvelope, ApiError } from './types'

const BASE = '/api'

let authToken: string | null = localStorage.getItem('shiyi_token')

export function setToken(token: string | null) {
  authToken = token
  if (token) localStorage.setItem('shiyi_token', token)
  else localStorage.removeItem('shiyi_token')
}

export function getToken() {
  return authToken
}

export class RequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** 登录失效时统一跳登录页 */
function handleUnauthorized() {
  setToken(null)
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new RequestError('NETWORK', '连不上后端服务，确认 npm run dev 起起来了？')
  }

  if (res.status === 401) {
    handleUnauthorized()
    throw new RequestError('UNAUTHORIZED', '登录已过期，请重新登录')
  }

  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const fallback = { code: 'INTERNAL', message: `请求失败（${res.status}）` }
    const err = (json as Partial<ApiError> | null)?.error ?? fallback
    throw new RequestError(err.code ?? fallback.code, err.message ?? fallback.message)
  }
  return json as T
}

/** 返回 data 部分 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await request<ApiEnvelope<T>>(path, init)
  return body.data
}

/** 返回完整响应（含 meta 分页信息） */
export async function apiPage<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number } }> {
  const body = await request<{ data: T[]; meta: { page: number; pageSize: number; total: number } }>(path, init)
  return { data: body.data ?? [], meta: body.meta ?? { page: 1, pageSize: 0, total: 0 } }
}

/**
 * 上传照片，带进度回调。
 * 用 XMLHttpRequest 是因为 fetch 拿不到上传进度。
 */
export function uploadWithProgress(files: File[], onProgress?: (percent: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/assets`)
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        handleUnauthorized()
        reject(new RequestError('UNAUTHORIZED', '登录已过期，请重新登录'))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          resolve(null)
        }
        return
      }
      let message = `上传失败（${xhr.status}）`
      try {
        const parsed = JSON.parse(xhr.responseText) as ApiError
        if (parsed?.error?.message) message = parsed.error.message
      } catch {
        /* 忽略解析失败 */
      }
      reject(new RequestError('UPLOAD_FAILED', message))
    }

    xhr.onerror = () => reject(new RequestError('NETWORK', '网络异常，上传失败'))
    xhr.send(form)
  })
}