/** Public errors must never include SQL, credentials or upstream response bodies. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function databaseError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const code = (error as { code?: string })?.code;
  switch (code) {
    case '40001':
    case '40P01':
      return new HttpError(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
    case '42501':
      return new HttpError(403, 'Thao tác nằm ngoài phạm vi quyền của tài khoản.');
    case '23505':
      return new HttpError(409, 'Mã đã tồn tại. Vui lòng dùng mã khác.');
    case '23514':
    case '22023':
      return new HttpError(422, 'Dữ liệu không đáp ứng điều kiện lưu hồ sơ.');
    default:
      return new HttpError(503, 'Không thể hoàn thành giao dịch dữ liệu. Vui lòng thử lại.');
  }
}
