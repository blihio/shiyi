// 负责人：A
// 登录 / 注册页。
// 默认账号由后端启动时自动创建：demo@shiyi.local / demo1234
// 注册接口是 C 实现的：POST /api/auth/register（邮箱正则 + 密码至少 8 位）

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, setToken } from '../api/client'

type AuthResp = { token: string; user: { id: string; email: string } }

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('demo@shiyi.local')
  const [password, setPassword] = useState('demo1234')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    if (next === 'register') {
      setEmail('')
      setPassword('')
    } else {
      setEmail('demo@shiyi.local')
      setPassword('demo1234')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register'
      const data = await api<AuthResp>(path, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setToken(data.token)
      navigate('/timeline')
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'login' ? '登录失败' : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-[380px] rounded-2xl bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-semibold">拾忆</h1>
        <p className="mb-6 text-xs text-slate-500">个人影像管理与智能检索</p>

        {/* 登录 / 注册 切换 */}
        <div className="mb-5 flex rounded-lg bg-slate-800 p-1 text-xs">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 rounded-md py-2 transition ${
              isLogin ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 rounded-md py-2 transition ${
              !isLogin ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            注册新账号
          </button>
        </div>

        <label className="mb-1 block text-xs text-slate-400">邮箱</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mb-4 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="mb-1 block text-xs text-slate-400">
          密码{isLogin ? '' : '（至少 8 位）'}
        </label>
        <input
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isLogin ? '' : '至少 8 位'}
          className="mb-2 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {error ? (
          <p className="mb-3 rounded-md bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</p>
        ) : (
          <div className="mb-3 h-[1px]" />
        )}

        <button
          type="submit"
          disabled={busy || email.trim() === '' || password === ''}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? '处理中…' : isLogin ? '登录' : '注册并登录'}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
          {isLogin ? (
            <>
              默认演示账号 demo@shiyi.local / demo1234
              <br />
              没有账号？点上面的「注册新账号」
            </>
          ) : (
            <>
              注册成功后会自动登录
              <br />
              每个账号的照片、人物、相册互相隔离
            </>
          )}
        </p>
      </form>
    </div>
  )
}