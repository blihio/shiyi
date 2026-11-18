// 负责人：A
// 首页时间轴：接真实接口（GET /api/assets）+ 按月分组 + 无限滚动 + 大图查看器 + 上传
//
// 数据流：useAssets()（TanStack Query 无限查询）
//        → 展平成 assets
//        → groupByMonth 分组渲染
//        → 上传成功后 useUploadAssets 自动 invalidate，时间轴自己刷新

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAssets } from '../api/hooks'
import type { Asset } from '../api/types'
import PhotoGrid from '../components/PhotoGrid'
import UploadDialog from '../components/UploadDialog'
import Viewer from '../components/Viewer'
import { formatMonth, groupByMonth, pickOnThisDay } from '../lib/date'

export default function Timeline() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAssets()

  const assets = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data])
  const groups = useMemo(() => groupByMonth(assets), [assets])
  const memories = useMemo(() => pickOnThisDay(assets), [assets])

  // ---- 无限滚动：滚动到底部自动加载下一页 ----
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ---- 大图查看器：按 id 从最新数据里取，避免翻页后对象过期 ----
  const current = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId])
  const index = selectedId ? assets.findIndex((a) => a.id === selectedId) : -1

  const step = useCallback(
    (delta: number) => {
      if (index < 0 || assets.length === 0) return
      const next = assets[(index + delta + assets.length) % assets.length]
      if (next) setSelectedId(next.id)
    },
    [assets, index],
  )

  const header = (
    <header className="mb-5 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-medium">时间轴</h1>
        <p className="text-xs text-slate-500">
          {isLoading ? '加载中…' : `共 ${assets.length} 张照片 · 按拍摄时间自动分组`}
        </p>
      </div>
      <button
        onClick={() => setUploadOpen(true)}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
      >
        上传照片
      </button>
    </header>
  )

  const uploadModal = uploadOpen ? <UploadDialog onClose={() => setUploadOpen(false)} /> : null

  // ---- 加载中 ----
  if (isLoading) {
    return (
      <div className="p-6">
        {header}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-slate-800" />
          ))}
        </div>
      </div>
    )
  }

  // ---- 出错（后端没起 / 网络问题） ----
  if (isError) {
    return (
      <div className="p-6">
        {header}
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-6 text-sm text-rose-200">
          <div className="mb-2 font-medium">照片加载失败</div>
          <div className="mb-4 text-rose-300/80">{error instanceof Error ? error.message : '未知错误'}</div>
          <div className="text-xs text-rose-300/60">
            检查后端是否启动：<code className="rounded bg-black/30 px-1">npm run dev</code> 或{' '}
            <code className="rounded bg-black/30 px-1">npm run dev:api</code>
          </div>
          <button
            onClick={() => void refetch()}
            className="mt-4 rounded-md bg-rose-800/60 px-4 py-2 text-xs text-white hover:bg-rose-700/60"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // ---- 空库 ----
  if (assets.length === 0) {
    return (
      <div className="p-6">
        {header}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-24 text-center">
          <div className="mb-3 text-4xl">🖼</div>
          <div className="mb-1 text-sm text-slate-300">还没有照片</div>
          <div className="mb-5 text-xs text-slate-500">上传一些手机里拍的照片，系统会自动读取拍摄时间和地点</div>
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm text-white hover:bg-indigo-500"
          >
            上传照片
          </button>
        </div>
        {uploadModal}
      </div>
    )
  }

  // ---- 正常 ----
  return (
    <div className="p-6">
      {header}

      {/* 往年今日：同一月日、非今年 */}
      {memories.length > 0 ? (
        <section className="mb-6 rounded-xl bg-slate-800/50 p-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-200">往年今日</span>
            <span className="text-xs text-slate-500">{memories.length} 张</span>
          </div>
          <PhotoGrid assets={memories} onSelect={(a) => setSelectedId(a.id)} />
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.month} className="mb-6">
          <h2 className="month-sticky -mx-1 mb-2 px-1 py-2 text-sm font-medium text-slate-300">
            {formatMonth(group.month)}
            <span className="ml-2 text-xs text-slate-500">{group.items.length} 张</span>
          </h2>
          <PhotoGrid assets={group.items} onSelect={(a: Asset) => setSelectedId(a.id)} />
        </section>
      ))}

      {/* 无限滚动哨兵 */}
      <div ref={sentinelRef} className="py-8 text-center text-xs text-slate-600">
        {isFetchingNextPage ? '加载中…' : hasNextPage ? '继续往下滚动加载更多' : `已经到底了 · 共 ${assets.length} 张`}
      </div>

      {uploadModal}

      {current ? (
        <Viewer asset={current} onClose={() => setSelectedId(null)} onPrev={() => step(-1)} onNext={() => step(1)} />
      ) : null}
    </div>
  )
}