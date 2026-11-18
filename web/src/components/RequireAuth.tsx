// 负责人：A
// 没登录就不让进内页，直接跳登录页。

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { getToken } from '../api/client'

export default function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}