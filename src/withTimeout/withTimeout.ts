import type { AsyncFunction } from '@fringeworks/types';
import { TimeoutError } from '../TimeoutError';
import type { WithTimeoutOptions } from './types';

/**
 * 非同期関数にタイムアウトを付与するラッパー
 *
 * 指定した時間内に処理が完了しない場合、`TimeoutError` を throw する。
 * タイムアウト後も本処理の Promise 自体は完了まで実行され続けるため、
 * 中断が必要な場合は `controller` オプションを使用する。
 *
 * @param fn タイムアウトを付与する非同期関数
 * @param timeout タイムアウトまでの時間（ミリ秒）
 * @param options タイムアウトの挙動を制御するオプション
 * @returns 元の関数と同じシグネチャを持つラップされた非同期関数
 *
 * @example
 * // 5秒でタイムアウト
 * const fetchWithTimeout = withTimeout(fetchData, 5000);
 *
 * @example
 * // AbortSignal で fetch を中断する
 * const controller = new AbortController();
 * const fetchWithTimeout = withTimeout(
 *   (url: string) => fetch(url, { signal: controller.signal }),
 *   5000,
 *   { controller },
 * );
 */
export default function withTimeout<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  timeout: number,
  options: WithTimeoutOptions = {},
): AsyncFunction<T, R> {
  const { controller } = options;

  return async (...args: T): Promise<R> => {
    let timerId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        controller?.abort();
        reject(new TimeoutError(timeout));
      }, timeout);
    });

    const resultPromise = fn(...args).finally(() => {
      clearTimeout(timerId);
    });

    return Promise.race([resultPromise, timeoutPromise]);
  };
}
