// 负责人：B
// 地图聚合点用 /api/map/points，下钻照片用带条件的 /api/map/assets。

import { useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'

import { useMapAssets, useMapPoints } from '../api/hooks'
import type { MapPoint } from '../api/types'
import PhotoGrid from '../components/PhotoGrid'

const DEFAULT_CENTER: [number, number] = [31.5, 114.0]

export default function MapPage() {
  const [active, setActive] = useState<MapPoint | null>(null)
  const pointsQuery = useMapPoints()
  const gallery = useMapAssets(active)
  const points = pointsQuery.data ?? []
  const photos = gallery.data?.pages.flatMap((page) => page.data) ?? []
  const count = gallery.data?.pages[0]?.meta.total
  const locatedCount = points.reduce((sum, point) => sum + point.count, 0)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 p-6 pb-3">
        <div>
          <h1 className="text-xl font-medium">地图</h1>
          {pointsQuery.isLoading ? (
            <p role="status" className="text-xs text-slate-400">正在读取位置信息…</p>
          ) : pointsQuery.isError ? (
            <p role="alert" className="text-xs text-rose-300">
              点位加载失败，{pointsQuery.error.message}
              <button type="button" onClick={() => void pointsQuery.refetch()} className="ml-2 text-indigo-300">重试</button>
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              {points.length ? locatedCount + ' 张有 GPS 的照片 · ' + points.length + ' 个点位' : '还没有带 GPS 的照片'}
            </p>
          )}
        </div>
        {active && (
          <button type="button" onClick={() => setActive(null)} className="text-sm text-slate-400 hover:text-slate-200">← 返回全部</button>
        )}
      </header>

      <div className={active ? 'h-64 shrink-0 px-6' : 'min-h-0 flex-1 px-6'}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={5}
          style={{ height: '100%', width: '100%', borderRadius: 12 }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((point) => (
            <CircleMarker
              key={point.sampleAssetId}
              center={[point.lat, point.lng]}
              radius={Math.min(10 + point.count * 2, 26)}
              pathOptions={{ color: '#818cf8', fillColor: '#6366f1', fillOpacity: 0.6 }}
              eventHandlers={{ click: () => setActive(point) }}
            >
              <Tooltip>{point.city ?? '未知地点'} · {point.count} 张</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {active && (
        <section className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-3 text-sm text-slate-400">{active.city ?? '这个地点'}{count !== undefined && ' · ' + count + ' 张'}</h2>
          {gallery.isPending && <p role="status" className="text-sm text-slate-400">正在加载地点照片…</p>}
          {gallery.isError && !gallery.isFetchNextPageError && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              照片加载失败，{gallery.error.message}
              <button type="button" onClick={() => void gallery.refetch()} className="ml-2 text-indigo-300">重试</button>
            </p>
          )}
          {gallery.data && <PhotoGrid assets={photos} emptyText="这个地点还没有照片" />}
          {gallery.hasNextPage && (
            <button
              type="button"
              disabled={gallery.isFetching}
              onClick={() => void gallery.fetchNextPage()}
              className="mt-4 rounded-md bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {gallery.isFetchingNextPage ? '正在加载…' : gallery.isFetchNextPageError ? '重试加载更多' : '加载更多照片'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
