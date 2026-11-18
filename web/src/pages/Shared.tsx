// 负责人：B
// 公开分享页 /s/:key —— 免登录访问
// 接口：GET /api/share/:key（不需要 token）

import { Link, useParams } from 'react-router-dom'

import { useSharedAlbum } from '../api/hooks'
import PhotoGrid from '../components/PhotoGrid'

export default function Shared() {
  const { key } = useParams<{ key: string }>()
  const { data, isLoading, isError, error } = useSharedAlbum(key)

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 border-b border-white/10 pb-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-lg font-medium">拾忆 · 分享相册</div>
            <div className="text-xs text-slate-500">
              {data ? data.album.name : '正在读取…'}
              {data ? ` · ${data.assets.length} 张` : ''}
            </div>
          </div>
          <Link to="/login" className="text-xs text-slate-500 hover:text-slate-300">
            我也要建一个 →
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-slate-500">加载中…</div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-8 text-center">
          <div className="mb-2 text-sm font-medium text-rose-200">分享不存在或已失效</div>
          <div className="text-xs text-rose-300/70">
            {error instanceof Error ? error.message : '请确认链接是否完整，或者联系分享者重新生成'}
          </div>
        </div>
      ) : data && data.assets.length === 0 ? (
        <div className="py-20 text-center text-sm text-slate-500">这个分享相册里还没有照片</div>
      ) : (
        <PhotoGrid assets={data?.assets ?? []} />
      )}
    </div>
  )
}