// 负责人：B
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAssets, usePeople, useRenamePerson } from '../api/hooks'
import type { Person } from '../api/types'
import PhotoGrid from '../components/PhotoGrid'
import Viewer from '../components/Viewer'

function RenamePerson({ person }: { person: Person }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const rename = useRenamePerson()

  function openDialog() {
    setName(person.name ?? '')
    rename.reset()
    dialog.current?.showModal()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || rename.isPending) return

    rename.mutate({ personId: person.id, name: trimmedName }, {
      onSuccess: () => dialog.current?.close(),
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
      >
        {person.name === null ? '命名' : '重命名'}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="rename-person-title"
        onCancel={(event) => { if (rename.isPending) event.preventDefault() }}
        className="w-full max-w-sm rounded-xl bg-slate-900 p-6 text-slate-100 shadow-xl backdrop:bg-black/60"
      >
        <form onSubmit={submit}>
          <h2 id="rename-person-title" className="mb-4 text-lg font-medium">编辑人物姓名</h2>
          <label htmlFor="person-name" className="mb-1 block text-sm text-slate-300">姓名</label>
          <input
            id="person-name"
            value={name}
            required
            disabled={rename.isPending}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {rename.isError && <p role="alert" className="mt-3 text-sm text-rose-300">{rename.error.message}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={rename.isPending}
              onClick={() => dialog.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || rename.isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {rename.isPending ? '正在保存…' : '保存'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

function PersonPhotos({ personId }: { personId: string }) {
  const people = usePeople()
  const photos = useAssets(personId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const person = people.data?.find(({ id }) => id === personId)
  const assets = photos.data?.pages.flatMap((page) => page.data) ?? []
  const total = photos.data?.pages[0]?.meta.total ?? 0
  const selectedIndex = assets.findIndex(({ id }) => id === selectedId)
  const selected = assets[selectedIndex]

  function step(delta: number) {
    if (selectedIndex < 0) return
    const index = (selectedIndex + delta + assets.length) % assets.length
    setSelectedId(assets[index].id)
  }

  return (
    <div className="p-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/people" className="text-sm text-slate-400 hover:text-slate-200">← 人物</Link>
        <div>
          <h1 className="break-all text-xl font-medium">{person ? (person.name ?? '未命名人物') : '人物详情'}</h1>
          {person && photos.data && <p className="text-xs text-slate-400">{total} 张照片</p>}
        </div>
        {person && <RenamePerson person={person} />}
      </header>

      {people.isPending ? (
        <p role="status" className="text-sm text-slate-400">正在加载人物…</p>
      ) : people.isError && !people.data ? (
        <p role="alert" className="text-sm text-rose-300">人物加载失败，{people.error.message}</p>
      ) : !person ? (
        <p className="text-sm text-slate-400">找不到这个人物。</p>
      ) : photos.isPending ? (
        <p role="status" className="text-sm text-slate-400">正在加载照片…</p>
      ) : photos.isError && !photos.data ? (
        <p role="alert" className="text-sm text-rose-300">照片加载失败，{photos.error.message}</p>
      ) : (
        <>
          <PhotoGrid assets={assets} onSelect={(asset) => setSelectedId(asset.id)} emptyText="这个人物暂无关联照片" />
          {photos.hasNextPage && (
            <button
              type="button"
              disabled={photos.isFetching}
              onClick={() => void photos.fetchNextPage()}
              className="mt-4 rounded-md bg-slate-800 px-3 py-2 text-sm disabled:opacity-50"
            >
              {photos.isFetchingNextPage ? '正在加载…' : photos.isFetchNextPageError ? '重试加载更多' : '加载更多照片'}
            </button>
          )}
        </>
      )}

      {selected && <Viewer asset={selected} onClose={() => setSelectedId(null)} onPrev={() => step(-1)} onNext={() => step(1)} />}
    </div>
  )
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  return id ? <PersonPhotos key={id} personId={id} /> : null
}
