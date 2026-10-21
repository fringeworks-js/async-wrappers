/**
 * オプション
 */
export type WithCacheOptions<T extends unknown[], R> = {
  /**
   * キャッシュの有効期限（ミリ秒）
   *
   * 省略した場合はキャッシュが無期限に保持される。
   * `0` 以下の場合は結果を保存せず、同じキーの処理中の呼び出しを共有するだけになる。
   *
   * @example
   * // 60秒間キャッシュする
   * withCache(fetchData, { ttl: 60_000 });
   */
  ttl?: number;

  /**
   * 保存するエントリーの最大件数
   *
   * 超えた場合は、古く保存したものから削除する（使った順ではなく保存した順）。
   * 省略した場合は上限が無い。小数は切り捨て、`0` 以下の場合は結果を保存せず、
   * 同じキーの処理中の呼び出しを共有するだけになる。
   * このラッパーが保存したエントリーだけを数える。
   *
   * @example
   * // 最大100件まで保存する
   * withCache(fetchData, { maxEntries: 100 });
   */
  maxEntries?: number;

  /**
   * キャッシュキーの生成関数
   *
   * 省略した場合は `JSON.stringify(args)` を使用する。
   * `JSON.stringify` では `undefined` と `null`、`Map` / `Set` と `{}` など、
   * 異なる値が同じキーになることがある。
   * 引数にこうした値が含まれる場合や、
   * キーの生成ロジックをカスタマイズしたい場合に指定する。
   *
   * @param args ラップされた関数の引数
   */
  getKey?: (...args: T) => string;

  /**
   * キャッシュの保存先となるストア
   *
   * `get` / `set` / `delete` を持つオブジェクトであれば何でも使用できる。
   * 省略した場合は内部で `Map` を使用する。
   * 件数に上限を設けたい場合（LRU キャッシュなど）や、テスト時のモックに使用する。
   * 値をそのまま保持しない保存先（`localStorage` など）を使う場合は、
   * エントリーをシリアライズするアダプターを用意する。
   */
  store?: WithCacheStore<R>;
};

/**
 * キャッシュストアーのインターフェイス
 */
export interface WithCacheStore<R> {
  /**
   * エントリーの取得
   * @param key
   */
  get(key: string): WithCacheEntry<R> | undefined;

  /**
   * エントリーの設定
   * @param key キャッシュキー
   * @param entry キャッシュするエントリー
   */
  set(key: string, entry: WithCacheEntry<R>): void;

  /**
   * エントリーの削除
   * @param key
   */
  delete(key: string): void;
}

/**
 * キャッシュストアーが受け取るエントリー
 */
export type WithCacheEntry<R> = {
  /**
   * キャッシュされた値
   */
  value: R;

  /**
   * キャッシュの期限
   */
  expiresAt: number | null;
};
