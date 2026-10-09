import type { AsyncFunction } from '@fringeworks/types';
import type { WithRetryOptions } from './types';

/**
 * 非同期関数にリトライ処理を付与するラッパー
 *
 * 指定した関数が失敗した場合、`maxRetries` 回までリトライする。
 * リトライの間隔・バックオフ・中止条件はオプションで細かく制御できる。
 *
 * @param fn リトライ対象の非同期関数
 * @param maxRetries 最大リトライ回数（合計試行回数は `maxRetries + 1`）
 * @param options リトライの挙動を制御するオプション
 * @returns 元の関数と同じシグネチャを持つラップされた非同期関数
 *
 * @example
 * // 最大3回リトライ、500ms 待機
 * const fetchWithRetry = withRetry(fetchData, 3, { delay: 500 });
 *
 * @example
 * // 5xx エラーのみリトライ、指数バックオフあり
 * const fetchWithRetry = withRetry(fetchData, 3, {
 *   delay: 1000,
 *   exponentialBackoff: true,
 *   shouldRetry: (err) => err instanceof HttpError && err.status >= 500,
 * });
 */
export default function withRetry<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  maxRetries: number,
  options: WithRetryOptions = {},
): AsyncFunction<T, R> {
  const {
    delay = 0,
    exponentialBackoff = false,
    shouldRetry = () => true,
    onRetry,
  } = options;

  return async (...args: T): Promise<R> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        const isLast = attempt === maxRetries;
        const retries = attempt + 1;
        if (isLast || !shouldRetry(err, retries)) {
          throw err;
        }

        onRetry?.(err, retries);

        if (delay > 0) {
          const wait = exponentialBackoff
            ? delay * 2 ** attempt * (0.5 + Math.random() * 0.5)
            : delay;
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
    }
    throw new Error('Unreachable');
  };
}
