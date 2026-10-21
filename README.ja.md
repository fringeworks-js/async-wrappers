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

関数・クラス・型は、ルートと関数単位のパスのどちらからでも同じ名前で import できます。関数単位のパスでは、その関数を default import することもできます。

```ts
import { withRetry } from '@fringeworks/async-wrappers';
import withRetry from '@fringeworks/async-wrappers/withRetry';
```

ラッパーは、ラップした関数に `this` を渡しません。メソッドをラップする場合は `bind` してから渡します。

```ts
const fetchUserWithRetry = withRetry(api.fetchUser.bind(api), 3);
```

---

## API

| 関数・クラス                           | 説明                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `new TimeoutError(timeout)`            | タイムアウトを表すエラー                                                               |
| `promiseTry(fn, ...args)`              | 関数を実行し、結果を `Promise` で返す                                                  |
| `withAbortableTimeout(fn, timeout)`    | 非同期関数にタイムアウトを付け、タイムアウト時に `signal` で処理を中断できる関数を返す |
| `withCache(fn, options?)`              | 非同期関数の結果をキャッシュする関数を返す                                             |
| `withFallback(fn, fallback, options?)` | 非同期関数が失敗したときに代わりの値を返す関数を返す                                   |
| `withRetry(fn, maxRetries, options?)`  | 非同期関数が失敗したときにリトライする関数を返す                                       |
| `withTimeout(fn, timeout)`             | 非同期関数にタイムアウトを付けた関数を返す                                             |

### `TimeoutError`

```ts
class TimeoutError extends Error {
  readonly timeout: number;
  constructor(timeout: number);
}
```

タイムアウトを表すエラーです。`withTimeout` と `withAbortableTimeout` がタイムアウトした場合に投げます。`name` は `'TimeoutError'`、`message` は `Timed out after <timeout>ms` です。

| プロパティ | 型       | 説明                             |
| ---------- | -------- | -------------------------------- |
| `timeout`  | `number` | タイムアウトまでの時間（ミリ秒） |

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

| 引数      | 型                                    | 説明            |
| --------- | ------------------------------------- | --------------- |
| `fn`      | `(...args: A) => R \| PromiseLike<R>` | 実行する関数    |
| `...args` | `A`                                   | `fn` に渡す引数 |

### `withAbortableTimeout`

```ts
withAbortableTimeout<T extends unknown[], R>(fn: (signal: AbortSignal, ...args: T) => Promise<R>, timeout: number): (...args: T) => Promise<R>
```

`withTimeout` と同じ動作に加えて、タイムアウトしたときに `fn` の処理を中断できるようにします。処理を中断する必要が無い場合は `withTimeout` を使います。

呼び出しのたびに `AbortController` を作り、その `signal` を `fn` の第1引数に渡します。タイムアウトすると、`TimeoutError` を `reason` にして `signal` を中断します（`reason` に未対応のブラウザーでは `AbortError`）。`fetch` など `AbortSignal` に対応した処理に `signal` を渡せば、処理を止められます。返す関数は、`fn` の引数から `signal` を除いたものを受け取ります。

```ts
const fetchWithTimeout = withAbortableTimeout(
  (signal, url: string) => fetch(url, { signal }),
  5000,
);
await fetchWithTimeout('/api/items');
```

| 引数      | 型                                                | 説明                                                   |
| --------- | ------------------------------------------------- | ------------------------------------------------------ |
| `fn`      | `(signal: AbortSignal, ...args: T) => Promise<R>` | 非同期関数。第1引数に `signal` を受け取る              |
| `timeout` | `number`                                          | タイムアウトまでの時間（ミリ秒）。`withTimeout` と同じ |

### `withCache`

```ts
withCache<T extends unknown[], R>(fn: (...args: T) => Promise<R>, options?: WithCacheOptions<T, R>): (...args: T) => Promise<R>
```

非同期関数の結果を引数ごとにキャッシュする関数を返します。同じ引数で呼び出すと、2回目以降はキャッシュした結果を返します。同じ引数の呼び出しが処理中の場合は、その結果を待って共有します。失敗した結果はキャッシュしません。

期限切れのエントリーは、呼び出しのたびに保存した順に確認して `store` から削除します。件数の上限はデフォルトでは無く、`maxEntries` を指定すると古く保存したものから削除します。どちらも、このラッパーが保存したエントリーだけが対象です。最近使ったものを残す LRU キャッシュが必要な場合は、`store` に指定します。

```ts
const fetchUserCached = withCache(fetchUser, { ttl: 60_000 });
await fetchUserCached('user-1'); // fetchUser を呼び出す
await fetchUserCached('user-1'); // キャッシュを返す
```

| 引数       | 型                           | 説明                     |
| ---------- | ---------------------------- | ------------------------ |
| `fn`       | `(...args: T) => Promise<R>` | キャッシュする非同期関数 |
| `options?` | `WithCacheOptions<T, R>`     | 下記のオプション         |

| オプション    | 型                       | 説明                                                                                                                                                                                                             |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ttl?`        | `number`                 | キャッシュの有効期限（ミリ秒）。期限を過ぎたものは再取得する。省略した場合は無期限。`0` 以下の場合は結果を保存せず、処理中の呼び出しの共有だけを行う                                                             |
| `maxEntries?` | `number`                 | 保存するエントリーの最大件数。超えた場合は古く保存したものから削除する（使った順ではなく保存した順）。省略した場合は上限なし。小数は切り捨てる。`0` 以下の場合は結果を保存せず、処理中の呼び出しの共有だけを行う |
| `getKey?`     | `(...args: T) => string` | 引数からキャッシュのキーを作る関数。デフォルトは `JSON.stringify(args)` で、`undefined` と `null`、`Map` / `Set` と `{}` など、異なる値が同じキーになることがある                                                |
| `store?`      | `WithCacheStore<R>`      | キャッシュの保存先。`get` / `set` / `delete` を持つオブジェクト。デフォルトは内部の `Map`                                                                                                                        |

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

| 引数       | 型                                    | 説明                                                              |
| ---------- | ------------------------------------- | ----------------------------------------------------------------- |
| `fn`       | `(...args: T) => Promise<R>`          | fallback を付ける非同期関数                                       |
| `fallback` | `(error: unknown) => R \| Promise<R>` | `fn` が失敗したときにエラーを受け取って呼ばれる関数。戻り値を返す |
| `options?` | `WithFallbackOptions`                 | 下記のオプション                                                  |

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

| 引数         | 型                           | 説明                                                               |
| ------------ | ---------------------------- | ------------------------------------------------------------------ |
| `fn`         | `(...args: T) => Promise<R>` | リトライする非同期関数                                             |
| `maxRetries` | `number`                     | 最大リトライ回数。小数は切り捨て、負の値と `NaN` は `0` として扱う |
| `options?`   | `WithRetryOptions`           | 下記のオプション                                                   |

| オプション            | 型                                             | 説明                                                                                                                                                   |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delay?`              | `number`                                       | リトライまでの待ち時間（ミリ秒）。`setTimeout` の最大値（2^31 - 1 ミリ秒、約24.8日）が上限。デフォルトは `0`                                           |
| `exponentialBackoff?` | `boolean`                                      | `true` の場合、待ち時間を `delay × 2^(失敗回数 - 1) × 0.5〜1.0 の乱数` にして、リトライのたびに長くする。デフォルトは `false`                          |
| `shouldRetry?`        | `(error: unknown, retries: number) => boolean` | リトライするか判定する関数。`retries` はそれまでの失敗回数。`false` を返すとリトライせずにそのエラーを投げる。省略した場合は全てのエラーでリトライする |
| `onRetry?`            | `(error: unknown, retries: number) => void`    | 各リトライの直前に呼ばれる関数。`retries` は次のリトライの回数（1〜）。ログの記録などに使う                                                            |

### `withTimeout`

```ts
withTimeout<T extends unknown[], R>(fn: (...args: T) => Promise<R>, timeout: number): (...args: T) => Promise<R>
```

非同期関数が `timeout` ミリ秒以内に完了しない場合に `TimeoutError` で reject する関数を返します。タイムアウトしても元の処理は止まらないため、処理を中断する場合は `withAbortableTimeout` を使います。

```ts
const fetchDataWithTimeout = withTimeout(fetchData, 5000);
```

| 引数      | 型                           | 説明                                                                                                                                                              |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fn`      | `(...args: T) => Promise<R>` | タイムアウトを付ける非同期関数                                                                                                                                    |
| `timeout` | `number`                     | タイムアウトまでの時間（ミリ秒）。`setTimeout` の最大値（約24.8日）を超える値も指定できる。`Infinity` の場合はタイムアウトしない。`NaN` や負の値は `0` として扱う |

### 型

| 型                       | 説明                                               |
| ------------------------ | -------------------------------------------------- |
| `WithCacheOptions<T, R>` | `withCache` のオプション                           |
| `WithCacheStore<R>`      | `withCache` のキャッシュの保存先のインターフェイス |
| `WithCacheEntry<R>`      | 保存先に格納するエントリー `{ value, expiresAt }`  |
| `WithFallbackOptions`    | `withFallback` のオプション                        |
| `WithRetryOptions`       | `withRetry` のオプション                           |

## ライセンス

MIT
