/**
 * タイムアウト時のエラー
 */
export default class TimeoutError extends Error {
  /**
   * タイムアウトまでの時間（ミリ秒）
   */
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}
