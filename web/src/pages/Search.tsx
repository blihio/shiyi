// 负责人：B
import { useState } from 'react'

import { useSearch } from '../api/hooks'
import PhotoGrid from '../components/PhotoGrid'

export default function Search() {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useSearch(submitted)
  const hits = search.data ?? []

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-xl font-medium">搜索</h1>
        <p className="text-xs text-slate-400">用一句话描述你想找的照片，例如「海边日落」或「毕业照」。</p>
      </header>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const query = q.trim()
          if (!query) return
          if (query === submitted) {
            void search.refetch()
          } else {
            setSubmitted(query)
          }
        }}
      >
        <input
          aria-label="搜索关键词"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="试试输入：海边日落"
          className="min-w-0 flex-1 rounded-lg bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!q.trim()}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          搜索
        </button>
      </form>

      {submitted && (
        <section aria-busy={search.isFetching}>
          {search.isPending ? (
            <p role="status" className="text-sm text-slate-400">正在搜索…</p>
          ) : search.isError ? (
            <p role="alert" className="text-sm text-rose-300">搜索失败，{search.error.message}</p>
          ) : (
            <>
              <h2 className="mb-3 break-all text-sm text-slate-400">「{submitted}」的结果 · {hits.length} 张</h2>
              {hits.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                  {hits.map(({ assetId, asset, score }) => (
                    <article key={assetId}>
                      <PhotoGrid assets={[asset ?? { id: assetId }]} />
                      <p className="mt-1 text-xs tabular-nums text-slate-400">相似度 {score.toFixed(3)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p role="status" className="py-16 text-center text-sm text-slate-400">没有找到相关照片</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
