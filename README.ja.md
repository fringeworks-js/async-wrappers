# @fringeworks/async-wrappers

`@fringeworks/async-wrappers` は、非同期関数にキャッシュ・リトライ・タイムアウト・フォールバックを付け加えるラッパーを集めた、誰かにとっては便利なライブラリです。

**[English README is available here](./README.md)**

## インストール

```bash
npm install @fringeworks/async-wrappers
# または
pnpm add @fringeworks/async-wrappers
```

## 使い方

関数・型・定数は、ルートと関数単位のパスのどちらからでも同じ名前で import できます。関数単位のパスでは、その関数を default import することもできます。

```ts
import { withRetry } from '@fringeworks/async-wrappers';
import withRetry from '@fringeworks/async-wrappers/withRetry';
```

---

## API

| 関数                                   | 説明                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| `TimeoutError(timeout)`                | タイムアウトを表すエラー                             |
| `promiseTry(fn, ...args)`              | 関数を実行し、結果を `Promise` で返す                |
| `withCache(fn, options?)`              | 非同期関数の結果をキャッシュする関数を返す           |
| `withFallback(fn, fallback, options?)` | 非同期関数が失敗したときに代わりの値を返す関数を返す |
| `withRetry(fn, maxRetries, options?)`  | 非同期関数が失敗したときにリトライする関数を返す     |
| `withTimeout(fn, timeout, options?)`   | 非同期関数にタイムアウトを付けた関数を返す           |

### `TimeoutError`

```ts
class TimeoutError extends Error {
  constructor(timeout: number);
}
```

タイムアウトを表すエラーです。`withTimeout` がタイムアウトした場合に投げます。`name` は `'TimeoutError'`、`message` は `Timed out after <timeout>ms` です。

### `promiseTry`

```ts
promiseTry<A extends unknown[], R>(fn: (...args: A) => R | PromiseLike<R>, ...args: A): Promise<Awaited<R>>
```

`fn` に `args` を渡して実行し、結果を `Promise` で返します。`fn` が同期的に例外を投げた場合も、reject された `Promise` になります。標準の `Promise.try`（ES2025）と同じ動作です。

```ts
await promiseTry((a: number, b: number) => a + b, 1, 2); // 3
await promiseTry(() => {
  throw new Error('x');
}); // reject される
```

### `withCache`

```ts
withCache<T extends unknown[], R>(fn: (...args: T) => Promise<R>, options?: WithCacheOptions<T, R>): (...args: T) => Promise<R>
```

非同期関数の結果を引数ごとにキャッシュする関数を返します。同じ引数で呼び出すと、2回目以降はキャッシュした結果を返します。同じ引数の呼び出しが処理中の場合は、その結果を待って共有します。失敗した結果はキャッシュしません。

```ts
const fetchUserCached = withCache(fetchUser, { ttl: 60_000 });
await fetchUserCached('user-1'); // fetchUser を呼び出す
await fetchUserCached('user-1'); // キャッシュを返す
```

| オプション | 型                       | 説明                                                                                      |
| ---------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `ttl?`     | `number`                 | キャッシュの有効期限（ミリ秒）。期限を過ぎたものは再取得する。省略した場合は無期限        |
| `getKey?`  | `(...args: T) => string` | 引数からキャッシュのキーを作る関数。デフォルトは `JSON.stringify(args)`                   |
| `store?`   | `WithCacheStore<R>`      | キャッシュの保存先。`get` / `set` / `delete` を持つオブジェクト。デフォルトは内部の `Map` |

### `withFallback`

```ts
withFallback<T extends unknown[], R>(fn: (...args: T) => Promise<R>, fallback: (error: unknown) => R | Promise<R>, options?: WithFallbackOptions): (...args: T) => Promise<R>
```

非同期関数が失敗した場合に、`fallback` の戻り値を返す関数を返します。

```ts
const fetchListSafely = withFallback(fetchList, () => []);

const fetchItemSafely = withFallback(fetchItem, () => null, {
  shouldFallback: (error) => error instanceof HttpError && error.status === 404,
});
```

| オプション        | 型                            | 説明                                                                                                              |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `shouldFallback?` | `(error: unknown) => boolean` | `fallback` に切り替えるか判定する関数。`false` を返すとそのエラーを投げる。省略した場合は全てのエラーで切り替える |
| `onFallback?`     | `(error: unknown) => void`    | `fallback` に切り替える際に呼ばれる関数。ログの記録などに使う                                                     |

### `withRetry`

```ts
withRetry<T extends unknown[], R>(fn: (...args: T) => Promise<R>, maxRetries: number, options?: WithRetryOptions): (...args: T) => Promise<R>
```

非同期関数が失敗した場合に、最大 `maxRetries` 回までリトライする関数を返します（試行回数は最大 `maxRetries + 1` 回）。全て失敗した場合は最後のエラーを投げます。

```ts
const fetchDataWithRetry = withRetry(fetchData, 3, {
  delay: 1000,
  exponentialBackoff: true,
  shouldRetry: (error) => error instanceof HttpError && error.status >= 500,
});
```

| オプション            | 型                                             | 説明                                                                                                                          |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `delay?`              | `number`                                       | リトライまでの待ち時間（ミリ秒）。デフォルトは `0`                                                                            |
| `exponentialBackoff?` | `boolean`                                      | `true` の場合、待ち時間を `delay × 2^(失敗回数 - 1) × 0.5〜1.0 の乱数` にして、リトライのたびに長くする。デフォルトは `false` |
| `shouldRetry?`        | `(error: unknown, retries: number) => boolean` | リトライするか判定する関数。`retries` はそれまでの失敗回数。`false` を返すとリトライせずにそのエラーを投げる                  |
| `onRetry?`            | `(error: unknown, retries: number) => void`    | 各リトライの直前に呼ばれる関数。`retries` は次のリトライの回数（1〜）。ログの記録などに使う                                   |

### `withTimeout`

```ts
withTimeout<T extends unknown[], R>(fn: (...args: T) => Promise<R>, timeout: number, options?: WithTimeoutOptions): (...args: T) => Promise<R>
```

非同期関数が `timeout` ミリ秒以内に完了しない場合に `TimeoutError` で reject する関数を返します。タイムアウトしても元の処理は止まらないため、処理を中断する場合は `controller` を指定し、その `signal` を処理に渡します。

```ts
const controller = new AbortController();
const fetchWithTimeout = withTimeout(
  (url: string) => fetch(url, { signal: controller.signal }),
  5000,
  { controller },
);
```

| オプション    | 型                | 説明                                                      |
| ------------- | ----------------- | --------------------------------------------------------- |
| `controller?` | `AbortController` | タイムアウトしたときに `abort()` を呼ぶ `AbortController` |

### 型

| 型                       | 説明                                               |
| ------------------------ | -------------------------------------------------- |
| `WithCacheOptions<T, R>` | `withCache` のオプション                           |
| `WithCacheStore<R>`      | `withCache` のキャッシュの保存先のインターフェイス |
| `WithCacheEntry<R>`      | 保存先に格納するエントリー `{ value, expiresAt }`  |
| `WithFallbackOptions`    | `withFallback` のオプション                        |
| `WithRetryOptions`       | `withRetry` のオプション                           |
| `WithTimeoutOptions`     | `withTimeout` のオプション                         |

## ライセンス

MIT
