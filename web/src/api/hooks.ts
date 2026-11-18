// 负责人：A
// TanStack Query 的封装：页面只管调 hook，不用管 loading / 缓存 / 刷新。

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { apiPage, uploadWithProgress } from './client'
import type { Asset } from './types'

/** 一页多少张（后端上限 100） */
const PAGE_SIZE = 60

/**
 * 时间轴数据：无限滚动。
 * 用法：
 *   const q = useAssets()
 *   const assets = q.data?.pages.flatMap((p) => p.data) ?? []
 */
export function useAssets() {
  return useInfiniteQuery({
    queryKey: ['assets'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => apiPage<Asset>(`/assets?page=${pageParam}&pageSize=${PAGE_SIZE}`),
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.meta.page - 1) * lastPage.meta.pageSize + lastPage.data.length
      return loaded < lastPage.meta.total ? lastPage.meta.page + 1 : undefined
    },
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
      // AI 处理是后台异步的，稍后再刷一次，让"人物"能出现
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['assets'] })
      }, 2500)
    },
  })
}