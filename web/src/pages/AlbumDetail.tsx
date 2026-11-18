// 负责人：B
// 相册详情：真实照片 + 添加照片 + 生成分享链接

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAddAssetsToAlbum, useAlbum, useAssets, useCreateShare } from '../api/hooks'
import PhotoGrid from '../components/PhotoGrid'
import Viewer from '../components/Viewer'
import type { Asset } from '../api/types'

export default function AlbumDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: album, isLoading, isError, error, refetch } = useAlbum(id)
  const addAssets = useAddAssetsToAlbum(id)
  const createShare = useCreateShare(id)

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState<Asset | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickerError, setPickerError] = useState<string | null>(null)

  // 选择器里列出所有照片
  const allAssetsQuery = useAssets()
  const allAssets = useMemo(
    () => allAssetsQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [allAssetsQuery.data],
  )

  const inAlbumIds = useMemo(() => new Set((album?.assets ?? []).map((a) => a.id)), [album])

  async function handleShare() {
    try {
      const resp = await createShare.mutateAsync()
      setShareUrl(`${window.location.origin}${resp.url}`)
      setCopied(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成分享链接失败')
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // 非 https 环境下 clipboard 可能不可用，选中文本让用户手动复制
      setCopied(false)
    }
  }

  async function confirmAdd() {
    if (picked.size === 0) {
      setPickerOpen(false)
      return
    }
    setPickerError(null)
    try {
      await addAssets.mutateAsync(Array.from(picked))
      setPicked(new Set())
      setPickerOpen(false)
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : '添加失败')
    }
  }

  function togglePick(assetId: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-5 h-8 w-40 animate-pulse rounded bg-slate-800" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-slate-800" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !album) {
    return (
      <div className="p-6">
        <Link to="/albums" className="text-sm text-slate-400 hover:text-slate-200">
          ← 相册
        </Link>
        <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/30 p-6 text-sm text-rose-200">
          <div className="mb-2 font-medium">相册打不开</div>
          <div className="text-rose-300/80">{error instanceof Error ? error.message : '相册不存在'}</div>
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

  return (
    <div className="p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/albums" className="text-sm text-slate-400 hover:text-slate-200">
            ← 相册
          </Link>
          <div>
            <h1 className="text-xl font-medium">{album.name}</h1>
            <p className="text-xs text-slate-500">{album.assets.length} 张照片</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPickerOpen(true)
              setPicked(new Set())
              setPickerError(null)
            }}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-600"
          >
            添加照片
          </button>
          <button
            onClick={() => void handleShare()}
            disabled={createShare.isPending || album.assets.length === 0}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
            title={album.assets.length === 0 ? '先往相册里加几张照片再分享' : undefined}
          >
            {createShare.isPending ? '生成中…' : '生成分享链接'}
          </button>
        </div>
      </header>

      {shareUrl ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-900/20 px-4 py-3">
          <span className="text-xs text-emerald-300">分享链接（免登录可访问）：</span>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-[320px] flex-1 rounded bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
          />
          <button
            onClick={() => void copyLink()}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 underline">
            在新窗口打开
          </a>
        </div>
      ) : null}

      {album.assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-20 text-center">
          <div className="mb-3 text-4xl">🖼</div>
          <div className="mb-1 text-sm text-slate-300">这个相册还是空的</div>
          <div className="mb-5 text-xs text-slate-500">点右上角「添加照片」从时间轴里挑几张进来</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm text-white hover:bg-indigo-500"
          >
            添加照片
          </button>
        </div>
      ) : (
        <PhotoGrid assets={album.assets} onSelect={setSelected} />
      )}

      {/* 选照片弹窗 */}
      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-6" onClick={() => setPickerOpen(false)}>
          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <div className="text-sm font-medium">选择照片加入「{album.name}」</div>
                <div className="text-xs text-slate-500">已选 {picked.size} 张</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={() => void confirmAdd()}
                  disabled={addAssets.isPending || picked.size === 0}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {addAssets.isPending ? '添加中…' : `加入相册（${picked.size}）`}
                </button>
              </div>
            </div>

            {pickerError ? <div className="bg-rose-950/40 px-5 py-2 text-xs text-rose-300">{pickerError}</div> : null}

            <div className="flex-1 overflow-y-auto p-4">
              {allAssetsQuery.isLoading ? (
                <div className="py-16 text-center text-sm text-slate-500">加载照片中…</div>
              ) : allAssets.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">时间轴里还没有照片，先去上传</div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5">
                  {allAssets.map((asset) => {
                    const already = inAlbumIds.has(asset.id)
                    const isPicked = picked.has(asset.id)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        disabled={already}
                        onClick={() => togglePick(asset.id)}
                        className={`relative aspect-square overflow-hidden rounded-md border-2 transition ${
                          already
                            ? 'cursor-not-allowed border-transparent opacity-30'
                            : isPicked
                              ? 'border-indigo-400'
                              : 'border-transparent hover:border-slate-500'
                        }`}
                      >
                        {asset.thumbUrl ? (
                          <img src={asset.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full bg-slate-800" />
                        )}
                        {isPicked ? (
                          <span className="absolute right-1 top-1 rounded-full bg-indigo-500 px-1.5 text-xs text-white">✓</span>
                        ) : null}
                        {already ? (
                          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] text-slate-300">已在相册</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <Viewer
          asset={selected}
          onClose={() => setSelected(null)}
          onPrev={() => undefined}
          onNext={() => undefined}
        />
      ) : null}
    </div>
  )
}