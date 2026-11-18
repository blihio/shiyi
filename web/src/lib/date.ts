// 负责人：A
// 时间/分组相关的纯函数，独立出来方便复用和测试。

import type { Asset } from '../api/types'

/** 把照片按 YYYY-MM 分组，月份倒序，月内按拍摄时间倒序 */
export function groupByMonth(assets: Asset[]): { month: string; items: Asset[] }[] {
  const map = new Map<string, Asset[]>()
  for (const a of assets) {
    const key = (a.takenAt ?? new Date().toISOString()).slice(0, 7)
    const list = map.get(key) ?? []
    list.push(a)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, items]) => ({
      month,
      items: items.slice().sort((a, b) => ((a.takenAt ?? '') < (b.takenAt ?? '') ? 1 : -1)),
    }))
}

/** 把 2026-11 显示成 "2026 年 11 月" */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}

/** 本地化时间，用于大图查看器 */
export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 找出"往年今日"：月日相同、但不是今年的照片 */
export function pickOnThisDay(assets: Asset[], today = new Date()): Asset[] {
  const m = today.getMonth()
  const d = today.getDate()
  const thisYear = today.getFullYear()
  return assets.filter((a) => {
    if (!a.takenAt) return false
    const t = new Date(a.takenAt)
    if (Number.isNaN(t.getTime())) return false
    return t.getMonth() === m && t.getDate() === d && t.getFullYear() < thisYear
  })
}