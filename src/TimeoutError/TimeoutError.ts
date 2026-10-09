/**
 * タイムアウト時のエラー
 */
export default class TimeoutError extends Error {
  constructor(timeout: number) {
    super(`Timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}
