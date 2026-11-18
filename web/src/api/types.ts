// 负责人：A
// 数据结构和 docs/api-contract.md 完全一致，后端接好后直接替换数据源即可。

export type Asset = {
  id: string
  thumbUrl?: string
  fileUrl?: string
  originalName?: string
  /** ISO-8601 UTC 字符串 */
  takenAt?: string
  lat?: number
  lng?: number
  city?: string
  cameraModel?: string
  width?: number
  height?: number
  isFavorite?: boolean
  persons?: { id: string; name: string | null }[]
}

export type Person = {
  id: string
  name: string | null
  coverAssetId?: string | null
  faceCount: number
}

export type Album = {
  id: string
  name: string
  coverAssetId?: string
  count: number
}

export type MapPoint = {
  lat: number
  lng: number
  count: number
  city?: string
  sampleAssetId?: string
}

export type SearchHit = {
  assetId: string
  score: number
  asset?: Asset
}

export type ApiEnvelope<T> = {
  data: T
  meta?: { page: number; pageSize: number; total: number }
}

export type ApiError = {
  error: { code: string; message: string }
}
