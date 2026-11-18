// 负责人：A
// TanStack Query 的封装：页面只管调 hook，不用管 loading / 缓存 / 刷新。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, apiPage, uploadWithProgress } from './client'
import type { Asset, Person, SearchHit } from './types'

/** 一页多少张（后端上限 100） */
const PAGE_SIZE = 60
const PEOPLE_KEY = ['people']

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
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.meta.page - 1) * lastPage.meta.pageSize + lastPage.data.length
      return loaded < lastPage.meta.total ? lastPage.meta.page + 1 : undefined
    },
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
      // AI 索引在后台写入，稍后刷新人物分组和搜索缓存。
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['assets'] })
        void queryClient.invalidateQueries({ queryKey: PEOPLE_KEY })
        void queryClient.invalidateQueries({ queryKey: ['search'] })
      }, 2500)
    },
  })
}
