// 负责人：A
// TanStack Query 的封装：页面只管调 hook，不用管 loading / 缓存 / 刷新。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, apiPage, uploadWithProgress } from './client'
import type { Album, AlbumDetailData, Asset, MapPoint, Person, SearchHit, ShareResp, SharedAlbum } from './types'

/** 一页多少张（后端上限 100） */
const PAGE_SIZE = 60
const PEOPLE_KEY = ['people']
const ALBUMS_KEY = ['albums']
const MAP_POINTS_KEY = ['map-points']
const MAP_ASSETS_KEY = ['map-assets']

function nextAssetPage({ data, meta }: Awaited<ReturnType<typeof apiPage<Asset>>>) {
  const loaded = (meta.page - 1) * meta.pageSize + data.length
  return loaded < meta.total ? meta.page + 1 : undefined
}

/**
 * 照片列表，可按人物查询。
 * 用法：
 *   const q = useAssets()
 *   const assets = q.data?.pages.flatMap((p) => p.data) ?? []
 */
export function useAssets(personId?: string) {
  return useInfiniteQuery({
    queryKey: personId ? ['assets', { personId }] : ['assets'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(PAGE_SIZE) })
      if (personId) params.set('personId', personId)
      return apiPage<Asset>(`/assets?${params}`, { signal })
    },
    getNextPageParam: nextAssetPage,
  })
}

export function useAsset(assetId?: string | null) {
  return useQuery({
    queryKey: ['asset', assetId],
    enabled: Boolean(assetId),
    queryFn: ({ signal }) => api<Asset>(`/assets/${encodeURIComponent(assetId ?? '')}`, { signal }),
  })
}

export function usePeople() {
  return useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: ({ signal }) => api<Person[]>('/people', { signal }),
  })
}

export function useRenamePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, name }: { personId: string; name: string }) =>
      api<{ ok: boolean }>(`/people/${encodeURIComponent(personId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: async (_result, { personId, name }) => {
      await queryClient.cancelQueries({ queryKey: PEOPLE_KEY })
      queryClient.setQueryData<Person[]>(PEOPLE_KEY, (people) =>
        people?.map((person) => (person.id === personId ? { ...person, name } : person)),
      )
      void queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
    },
  })
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    enabled: query.length > 0,
    queryFn: ({ signal }) => api<SearchHit[]>(`/search?q=${encodeURIComponent(query)}`, { signal }),
  })
}

/** 上传照片；成功后自动刷新时间轴 */
export function useUploadAssets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ files, onProgress }: { files: File[]; onProgress?: (percent: number) => void }) =>
      uploadWithProgress(files, onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] })
      void queryClient.invalidateQueries({ queryKey: MAP_POINTS_KEY })
      void queryClient.invalidateQueries({ queryKey: MAP_ASSETS_KEY })
      // AI 索引在后台写入，稍后刷新人物分组和搜索缓存。
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['assets'] })
        void queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
        void queryClient.invalidateQueries({ queryKey: ['search'] })
      }, 2500)
    },
  })
}

// ---------------- 相册与分享 ----------------

export function useAlbums() {
  return useQuery({
    queryKey: ALBUMS_KEY,
    queryFn: ({ signal }) => api<Album[]>('/albums', { signal }),
  })
}

export function useCreateAlbum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api<Album>('/albums', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
    },
  })
}

export function useAlbum(albumId?: string) {
  return useQuery({
    queryKey: ['album', albumId],
    enabled: Boolean(albumId),
    queryFn: ({ signal }) => api<AlbumDetailData>(`/albums/${encodeURIComponent(albumId ?? '')}`, { signal }),
  })
}

export function useAddAssetsToAlbum(albumId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assetIds: string[]) =>
      api<{ ok: boolean; count: number }>(`/albums/${encodeURIComponent(albumId ?? '')}/assets`, {
        method: 'POST',
        body: JSON.stringify({ assetIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['album', albumId] })
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
    },
  })
}

export function useCreateShare(albumId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      api<ShareResp>(`/albums/${encodeURIComponent(albumId ?? '')}/share`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  })
}

/** 免登录读取分享相册（/s/:key） */
export function useSharedAlbum(key?: string) {
  return useQuery({
    queryKey: ['share', key],
    enabled: Boolean(key),
    retry: false,
    queryFn: ({ signal }) => api<SharedAlbum>(`/share/${encodeURIComponent(key ?? '')}`, { signal }),
  })
}

/** 删除相册（照片不会删，只删相册本身和关联） */
export function useDeleteAlbum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (albumId: string) =>
      api<{ ok: boolean }>(`/albums/${encodeURIComponent(albumId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALBUMS_KEY })
    },
  })
}

/** 地图上有 GPS 的照片聚合点 */
export function useMapPoints() {
  return useQuery({
    queryKey: MAP_POINTS_KEY,
    queryFn: ({ signal }) => api<MapPoint[]>('/map/points', { signal }),
  })
}

export function useMapAssets(point: MapPoint | null) {
  const filter = point?.city ? { city: point.city } : point && { lat: point.lat, lng: point.lng }
  return useInfiniteQuery({
    queryKey: [...MAP_ASSETS_KEY, filter],
    enabled: point !== null,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(PAGE_SIZE) })
      if (point?.city) {
        params.set('city', point.city)
      } else if (point) {
        params.set('lat', String(point.lat))
        params.set('lng', String(point.lng))
      }
      return apiPage<Asset>(`/map/assets?${params}`, { signal })
    },
    getNextPageParam: nextAssetPage,
  })
}
