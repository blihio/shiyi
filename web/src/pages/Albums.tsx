// 负责人：B
// 相册列表：接真实接口 + 新建相册

import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAlbums, useCreateAlbum } from '../api/hooks'

export default function Albums() {
  const { data: albums, isLoading, isError, error, refetch } = useAlbums()
  const create = useCreateAlbum()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setFormError('相册名不能为空')
      return
    }
    setFormError(null)
    try {
      await create.mutateAsync(trimmed)
      setName('')
      setOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败')
    }
  }

  const header = (
    <header className="mb-5 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-medium">相册</h1>
        <p className="text-xs text-slate-500">把照片整理成旅行、聚会、校园活动</p>
      </div>
      <button
        onClick={() => {
          setOpen(true)
          setFormError(null)
        }}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
      >
        新建相册
      </button>
    </header>
  )

  const createModal = open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <form onSubmit={submit} className="w-[420px] rounded-xl bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-medium">新建相册</h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：毕业旅行"
          maxLength={40}
          className="mb-2 w-full rounded-lg bg-slate-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {formError ? <p className="mb-2 text-xs text-rose-400">{formError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {create.isPending ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="p-6">
        {header}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-slate-800" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6">
        {header}
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-6 text-sm text-rose-200">
          <div className="mb-2 font-medium">相册加载失败</div>
          <div className="text-rose-300/80">{error instanceof Error ? error.message : '未知错误'}</div>
          <button
            onClick={() => void refetch()}
            className="mt-4 rounded-md bg-rose-800/60 px-4 py-2 text-xs text-white hover:bg-rose-700/60"
          >
            重试
          </button>
        </div>
        {createModal}
      </div>
    )
  }

  if (!albums || albums.length === 0) {
    return (
      <div className="p-6">
        {header}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-24 text-center">
          <div className="mb-3 text-4xl">📚</div>
          <div className="mb-1 text-sm text-slate-300">还没有相册</div>
          <div className="mb-5 text-xs text-slate-500">把一次旅行、一场聚会的照片整理到一起</div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm text-white hover:bg-indigo-500"
          >
            新建相册
          </button>
        </div>
        {createModal}
      </div>
    )
  }

  return (
    <div className="p-6">
      {header}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
        {albums.map((album) => (
          <Link
            key={album.id}
            to={`/albums/${album.id}`}
            className="group overflow-hidden rounded-xl bg-slate-800/50 transition hover:bg-slate-800"
          >
            <div className="flex h-36 items-center justify-center bg-slate-700/40 text-4xl">📚</div>
            <div className="p-3">
              <div className="truncate text-sm text-slate-200">{album.name}</div>
              <div className="text-xs text-slate-500">{album.count} 张</div>
            </div>
          </Link>
        ))}
      </div>
      {createModal}
    </div>
  )
}