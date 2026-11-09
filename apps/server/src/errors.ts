export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
export const invalid = (message = '입력값을 확인해 주세요.'): never => {
  throw new HttpError(400, message);
};
export const missing = (): never => {
  throw new HttpError(404, '요청한 항목을 찾을 수 없습니다.');
};
