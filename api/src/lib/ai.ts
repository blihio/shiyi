// 负责人：D
// 和 Python AI 服务通信。AI 服务没起来时不能影响主流程，所以全部 catch 掉返回 null。

import { AI_SERVICE_URL } from '../env'

export type EmbedResult = {
  assetId: string
  faces: { bbox: number[]; vec: number[]; personKey: string | null }[]
  clipVec: number[]
}

export type SearchHit = { assetId: string; score: number }

export type FaceBox = [number, number, number, number]

type EmbeddingSummary = {
  mode: 'real' | 'mock'
  clipDim: number
  faces: { bbox: FaceBox | null; dim: number }[]
}

export async function getEmbeddingSummary(assetId: string): Promise<{ data: EmbeddingSummary | null } | null> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/embeddings/${encodeURIComponent(assetId)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return { data: (await res.json()) as EmbeddingSummary | null }
  } catch {
    return null
  }
}

async function postJson<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function embedImage(assetId: string, imagePath: string, ownerId: string, legacyPersonIds: string[]) {
  return postJson<EmbedResult>('/embed', { assetId, imagePath, ownerId, legacyPersonIds })
}

export function semanticSearch(query: string, topK: number, assetIds: string[]) {
  return postJson<{ results: SearchHit[] }>('/search', { query, topK, assetIds })
}

export function mergePersons(keepId: string, mergeId: string) {
  return postJson<{ ok: boolean }>('/persons/merge', { keepId, mergeId }, 5000)
}

export async function getCoverFaces(covers: { personKey: string; assetId: string }[]) {
  if (covers.length === 0) return []
  const result = await postJson<{ boxes: (FaceBox | null)[] }>('/persons/cover-faces', { covers }, 5000)
  return result?.boxes ?? []
}

export function splitPerson(personId: string, assetId: string) {
  return postJson<{ ok: boolean }>('/persons/split', { personId, assetId }, 5000)
}

export async function deleteEmbedding(assetId: string): Promise<void> {
  const res = await fetch(`${AI_SERVICE_URL}/embeddings/${encodeURIComponent(assetId)}`, {
    method: 'DELETE', signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`删除 AI 索引失败（${res.status}）`)
}

export async function aiHealth(): Promise<{ status: string; mode: string } | null> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    return (await res.json()) as { status: string; mode: string }
  } catch {
    return null
  }
}
