import type { AsyncFunction } from '@fringeworks/types';
import type { WithFallbackOptions } from './types';

/**
 * 非同期関数に fallback を付与するラッパー
 *
 * 処理が失敗した場合、`fallback` 関数の戻り値を返す。
 * `shouldFallback` で fallback に切り替える条件を絞ることができる。
 *
 * @param fn fallback を付与する非同期関数
 * @param fallback 失敗時に呼び出される関数
 * @param options fallback の挙動を制御するオプション
 * @returns 元の関数と同じシグネチャを持つラップされた非同期関数
 *
 * @example
 * ```typescript
 * // 失敗時に空配列を返す
 * const fetchWithFallback = withFallback(fetchData, () => []);
 * ```
 *
 * @example
 * ```typescript
 * // withRetry と組み合わせる（リトライしても駄目なら fallback）
 * const fetchWithFallback = withFallback(
 *   withRetry(fetchData, 3, { delay: 1000 }),
 *   () => [],
 * );
 * ```
 *
 * @example
 * ```typescript
 * // エラーの種類によって fallback を絞る
 * const fetchWithFallback = withFallback(
 *   fetchData,
 *   (error) => ({ error: 'Not Found' }),
 *   {
 *     shouldFallback: (error) => error instanceof HttpError && error.status === 404,
 *   },
 * );
 * ```
 */
export default function withFallback<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  fallback: (error: unknown) => R | Promise<R>,
  options: WithFallbackOptions = {},
): AsyncFunction<T, R> {
  const { shouldFallback = () => true, onFallback } = options;

  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!shouldFallback(err)) {
        throw err;
      }

      onFallback?.(err);
      return fallback(err);
    }
  };
}
