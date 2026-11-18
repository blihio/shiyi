// 负责人：C
// 可预期的业务错误：路由里抛出，统一由 errorHandler 转成契约里的错误响应。

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class InvalidFileTypeError extends ApiError {
  constructor(message = '只支持 JPG / PNG / WebP 图片') {
    super(400, 'INVALID_FILE_TYPE', message)
    this.name = 'InvalidFileTypeError'
  }
}