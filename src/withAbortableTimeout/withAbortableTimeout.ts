import type { AsyncFunction } from '@fringeworks/types';
import { setLongTimeout } from '@fringeworks/utils/timer/setLongTimeout';
import { promiseTry } from '../promiseTry';
import { TimeoutError } from '../TimeoutError';

/**
 * 非同期関数に、タイムアウト時に処理を中断できるタイムアウトを付与するラッパー
 *
 * 指定した時間内に処理が完了しない場合、`TimeoutError` で reject する。
 * 呼び出しのたびに `AbortController` を作り、その `signal` を `fn` の
 * 第1引数に渡す。タイムアウトすると `signal` が中断されるため、
 * `fetch` など `AbortSignal` に対応した処理に渡せば処理を止められる。
 * `signal.reason` は `TimeoutError`（`reason` に未対応のブラウザーでは `AbortError`）になる。
 * 処理を中断する必要が無い場合は `withTimeout` を使う。
 *
 * @param fn タイムアウトを付与する非同期関数。第1引数に `AbortSignal` を受け取る
 * @param timeout タイムアウトまでの時間（ミリ秒）。
 * `setTimeout` の最大値（約24.8日）を超える値も指定でき、`Infinity` の場合はタイムアウトしない。
 * `NaN` や負の値は `0` として扱う
 * @returns `fn` から `signal` を除いた引数を受け取る非同期関数
 *
 * @example
 * // 5秒でタイムアウトし、fetch を中断する
 * const fetchWithTimeout = withAbortableTimeout(
 *   (signal, url: string) => fetch(url, { signal }),
 *   5000,
 * );
 * await fetchWithTimeout('/api/items');
 */
export default function withAbortableTimeout<T extends unknown[], R>(
  // AsyncFunction<[AbortSignal, ...T], R> と書くと、signal の型を省略した関数から T を推論できない
  fn: (signal: AbortSignal, ...args: T) => Promise<R>,
  timeout: number,
): AsyncFunction<T, R> {
  return async (...args: T): Promise<R> => {
    const controller = new AbortController();
    let cancelTimer = () => {};

    const timeoutPromise = new Promise<never>((_, reject) => {
      cancelTimer = setLongTimeout(() => {
        const error = new TimeoutError(timeout);
        // fn が中断を受けて reject するより先に TimeoutError で決着させる
        reject(error);
        controller.abort(error);
      }, timeout);
    });

    // fn が同期的に throw した場合もタイマーを解除するため promiseTry で呼ぶ
    const resultPromise = promiseTry(fn, controller.signal, ...args).finally(
      () => {
        cancelTimer();
      },
    );

    return Promise.race([resultPromise, timeoutPromise]);
  };
}
