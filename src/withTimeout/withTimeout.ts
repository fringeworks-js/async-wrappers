import type { AsyncFunction } from '@fringeworks/types';
import { withAbortableTimeout } from '../withAbortableTimeout';

/**
 * 非同期関数にタイムアウトを付与するラッパー
 *
 * 指定した時間内に処理が完了しない場合、`TimeoutError` で reject する。
 * タイムアウト後も元の処理は完了まで実行され続ける。
 * 処理を中断する必要がある場合は `withAbortableTimeout` を使う。
 *
 * @param fn タイムアウトを付与する非同期関数
 * @param timeout タイムアウトまでの時間（ミリ秒）。
 * `setTimeout` の最大値（約24.8日）を超える値も指定でき、`Infinity` の場合はタイムアウトしない。
 * `NaN` や負の値は `0` として扱う
 * @returns 元の関数と同じシグネチャを持つラップされた非同期関数
 *
 * @example
 * // 5秒でタイムアウト
 * const fetchDataWithTimeout = withTimeout(fetchData, 5000);
 */
export default function withTimeout<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  timeout: number,
): AsyncFunction<T, R> {
  return withAbortableTimeout(
    (_signal: AbortSignal, ...args: T) => fn(...args),
    timeout,
  );
}
