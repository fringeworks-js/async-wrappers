import type { AsyncFunction } from '@fringeworks/types';
import type { WithCacheEntry, WithCacheOptions } from './types';

/**
 * 非同期関数にキャッシュを付与するラッパー
 *
 * 同じ引数での呼び出し結果をキャッシュし、2回目以降はキャッシュを返す。
 * `ttl` を指定した場合は有効期限を過ぎたエントリを再取得する。
 *
 * 期限切れのエントリは、呼び出しのたびに保存した順に確認して `store` から削除する。
 * 件数の上限はデフォルトでは無く、`maxEntries` を指定すると古く保存したものから削除する。
 * どちらも、このラッパーが保存したエントリだけが対象になる。
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
    maxEntries,
    getKey = (...args: T) => JSON.stringify(args),
    store = new Map<string, WithCacheEntry<R>>(),
  } = options;

  const entryLimit =
    maxEntries === undefined || Number.isNaN(maxEntries)
      ? Infinity
      : Math.floor(maxEntries);
  // ttl・maxEntries が 0 以下なら保存せず、処理中の呼び出しの共有だけを行う
  const shouldSave = (ttl === undefined || ttl > 0) && entryLimit > 0;

  const inFlight = new Map<string, Promise<R>>();

  // このラッパーが保存したキーと期限。保存した順に並び、
  // ttl はラッパーごとに一定なので、期限が切れる順にもなっている
  const savedKeys = new Map<string, number | null>();

  const removeSaved = (key: string) => {
    savedKeys.delete(key);
    store.delete(key);
  };

  const removeExpired = (now: number) => {
    for (const [key, expiresAt] of savedKeys) {
      if (expiresAt === null || now <= expiresAt) {
        break;
      }
      removeSaved(key);
    }
  };

  const save = (key: string, value: R) => {
    const expiresAt = ttl !== undefined ? Date.now() + ttl : null;
    store.set(key, { value, expiresAt });
    // 保存し直したキーは末尾に移す
    savedKeys.delete(key);
    savedKeys.set(key, expiresAt);
    while (savedKeys.size > entryLimit) {
      // size が entryLimit（1 以上）を超えているので、先頭のキーは必ずある
      removeSaved(savedKeys.keys().next().value!);
    }
  };

  return async (...args: T): Promise<R> => {
    removeExpired(Date.now());

    const key = getKey(...args);
    const cached = store.get(key);

    if (cached !== undefined) {
      const isExpired =
        cached.expiresAt !== null && Date.now() > cached.expiresAt;
      if (!isExpired) {
        return cached.value;
      }
      removeSaved(key);
    }

    // 進行中のリクエストがあればそれを待つ
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const promise = fn(...args)
      .then((value) => {
        if (shouldSave) {
          save(key, value);
        }
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };
}
