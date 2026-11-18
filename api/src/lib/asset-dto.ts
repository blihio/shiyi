// 负责人：C
import { guessCity } from './exif'

export function assetDto(a: {
  id: string
  thumbPath: string | null
  filePath: string
  originalName: string | null
  takenAt: Date | null
  lat: number | null
  lng: number | null
  cameraModel: string | null
  width: number | null
  height: number | null
  isFavorite: boolean
}) {
  return {
    id: a.id,
    thumbUrl: a.thumbPath ?? undefined,
    fileUrl: a.filePath,
    originalName: a.originalName ?? undefined,
    takenAt: a.takenAt?.toISOString(),
    lat: a.lat ?? undefined,
    lng: a.lng ?? undefined,
    city: guessCity(a.lat, a.lng) ?? undefined,
    cameraModel: a.cameraModel ?? undefined,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    isFavorite: a.isFavorite,
  }
}
