// 负责人：C
export function pagination(query: { page?: unknown; pageSize?: unknown }) {
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50)))
  const page = Math.max(1, Number(query.page ?? 1))
  return { page, pageSize, skip: (page - 1) * pageSize }
}
