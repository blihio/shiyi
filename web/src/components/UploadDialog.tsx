// 负责人：A
// 上传弹窗：多选 + 真实进度条 + 上传成功后自动刷新时间轴

import { useState } from 'react'

import { useUploadAssets } from '../api/hooks'

type Props = {
  onClose: () => void
}

export default function UploadDialog({ onClose }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const upload = useUploadAssets()
  const busy = upload.isPending

  function start() {
    if (files.length === 0 || busy) return
    setError(null)
    setDone(false)
    setProgress(0)

    upload.mutate(
      { files, onProgress: setProgress },
      {
        onSuccess: () => {
          setProgress(100)
          setDone(true)
        },
        onError: (err) => setError(err instanceof Error ? err.message : '上传失败'),
      },
    )
  }

  function reset() {
    setFiles([])
    setProgress(0)
    setError(null)
    setDone(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={busy ? undefined : onClose}>
      <div className="w-[560px] rounded-xl bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-medium">上传照片</h2>

        {!done ? (
          <label className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-600 text-slate-400 hover:border-indigo-500">
            <span className="text-3xl">＋</span>
            <span className="mt-2 text-sm">点击选择照片（可多选，一次最多 20 张）</span>
            <span className="mt-1 text-[11px] text-slate-600">支持 JPG / PNG / WEBP / HEIC</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []))
                setDone(false)
                setProgress(0)
                setError(null)
              }}
            />
          </label>
        ) : null}

        {files.length > 0 && !done ? (
          <p className="mt-3 text-sm text-slate-300">已选择 {files.length} 个文件</p>
        ) : null}

        {/* 进度条 */}
        {busy || (progress > 0 && !done) ? (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{busy ? '上传中…' : '已完成'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {done ? (
          <div className="mt-4 rounded-lg bg-emerald-900/30 p-4 text-sm text-emerald-300">
            ✅ 已上传 {files.length} 张，时间轴已刷新
            <div className="mt-1 text-xs text-emerald-400/70">
              人物识别和语义索引在后台异步处理，稍等几秒再去"人物"页看看
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg bg-rose-900/30 p-3 text-sm text-rose-300">
            {error}
            <div className="mt-1 text-xs text-rose-400/70">检查后端是否启动，或文件是否超过 20MB</div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={done ? reset : onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            {done ? '继续上传' : '关闭'}
          </button>
          {done ? (
            <button
              onClick={onClose}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
            >
              完成
            </button>
          ) : (
            <button
              onClick={start}
              disabled={busy || files.length === 0}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? '上传中…' : `开始上传${files.length > 0 ? `（${files.length} 张）` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}