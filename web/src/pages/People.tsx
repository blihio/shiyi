// 负责人：B
import { Link } from 'react-router-dom'

import { useAsset, usePeople } from '../api/hooks'
import type { Person } from '../api/types'

function PersonCard({ person }: { person: Person }) {
  const cover = useAsset(person.coverAssetId)
  const imageUrl = cover.data?.thumbUrl ?? cover.data?.fileUrl

  return (
    <Link
      to={'/people/' + encodeURIComponent(person.id)}
      className="group flex flex-col items-center rounded-xl bg-slate-800/50 p-4 hover:bg-slate-800"
    >
      <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-2xl">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">👤</span>
        )}
      </div>
      <div className="break-all text-center text-sm text-slate-200">{person.name ?? '未命名人物'}</div>
      <div className="text-xs text-slate-400">{person.faceCount} 张</div>
    </Link>
  )
}

export default function People() {
  const people = usePeople()

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-xl font-medium">人物</h1>
        <p className="text-xs text-slate-400">点击人物查看关联照片并命名</p>
      </header>

      {people.isPending ? (
        <p role="status" className="py-16 text-center text-sm text-slate-400">正在加载人物…</p>
      ) : people.isError && !people.data ? (
        <div className="py-16 text-center text-sm">
          <p role="alert" className="text-rose-300">人物加载失败，{people.error.message}</p>
          <button type="button" onClick={() => void people.refetch()} className="mt-3 text-indigo-300">
            重试
          </button>
        </div>
      ) : people.data?.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {people.data.map((person) => <PersonCard key={person.id} person={person} />)}
        </div>
      ) : (
        <div className="py-16 text-center text-sm">
          <p role="status" className="text-slate-400">还没有识别出人物，可以上传带人脸的照片后再查看。</p>
          <button
            type="button"
            disabled={people.isFetching}
            onClick={() => void people.refetch()}
            className="mt-3 text-indigo-300 disabled:opacity-50"
          >
            {people.isFetching ? '正在刷新…' : '刷新人物'}
          </button>
        </div>
      )}
    </div>
  )
}
