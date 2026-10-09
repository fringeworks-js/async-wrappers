import type { AsyncFunction } from '@fringeworks/types';
import type { WithCacheEntry, WithCacheOptions } from './types';

/**
 * 非同期関数にキャッシュを付与するラッパー
 *
 * 同じ引数での呼び出し結果をキャッシュし、2回目以降はキャッシュを返す。
 * `ttl` を指定した場合は有効期限を過ぎたエントリを再取得する。
 *
 * @param fn キャッシュを付与する非同期関数
 * @param options キャッシュの挙動を制御するオプション
 * @returns 元の関数と同じシグネチャを持つラップされた非同期関数
 *
 * @example
 * ```typescript
 * // 60秒間キャッシュする
 * const cachedFetch = withCache(fetchData, { ttl: 60_000 });
 * ```
 *
 * @example
 * ```typescript
 * // withRetry と組み合わせる
 * const cachedFetch = withCache(
 *   withRetry(fetchData, 3, { delay: 1000 }),
 *   { ttl: 60_000 },
 * );
 * ```
 */
export default function withCache<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  options: WithCacheOptions<T, R> = {},
): AsyncFunction<T, R> {
  const {
    ttl,
    getKey = (...args: T) => JSON.stringify(args),
    store = new Map<string, WithCacheEntry<R>>(),
  } = options;

  const inFlight = new Map<string, Promise<R>>();

  return async (...args: T): Promise<R> => {
    const key = getKey(...args);
    const cached = store.get(key);

    if (cached !== undefined) {
      const isExpired =
        cached.expiresAt !== null && Date.now() > cached.expiresAt;
      if (!isExpired) {
        return cached.value;
      }
      store.delete(key);
    }

    // 進行中のリクエストがあればそれを待つ
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const promise = fn(...args)
      .then((value) => {
        store.set(key, {
          value,
          expiresAt: ttl !== undefined ? Date.now() + ttl : null,
        });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };
}
