# @fringeworks/async-wrappers

`@fringeworks/async-wrappers` is a library some will find handy, offering wrappers that add caching, retries, timeouts, and fallbacks to async functions.

**[日本語のREADMEはこちら](./README.ja.md)**

## Installation

```bash
npm install @fringeworks/async-wrappers
# or
pnpm add @fringeworks/async-wrappers
```

## Usage

Functions, classes, and types can be imported by the same name from the root or from a per-function path. A per-function path also provides its function as the default export.

```ts
import { withRetry } from '@fringeworks/async-wrappers';
import withRetry from '@fringeworks/async-wrappers/withRetry';
```

The wrappers do not pass `this` to the wrapped function. To wrap a method, bind it first.

```ts
const fetchUserWithRetry = withRetry(api.fetchUser.bind(api), 3);
```

---

## API

| Function / Class                       | Description                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `new TimeoutError(timeout)`            | An error that represents a timeout                                                                  |
| `promiseTry(fn, ...args)`              | Runs a function and returns its result as a `Promise`                                               |
| `withAbortableTimeout(fn, timeout)`    | Returns a function that adds a timeout to an async function and aborts it via a `signal` on timeout |
| `withCache(fn, options?)`              | Returns a function that caches the results of an async function                                     |
| `withFallback(fn, fallback, options?)` | Returns a function that returns a fallback value when an async function fails                       |
| `withRetry(fn, maxRetries, options?)`  | Returns a function that retries an async function when it fails                                     |
| `withTimeout(fn, timeout)`             | Returns a function that adds a timeout to an async function                                         |

### `TimeoutError`

```ts
class TimeoutError extends Error {
  readonly timeout: number;
  constructor(timeout: number);
}
```

An error that represents a timeout, thrown by `withTimeout` and `withAbortableTimeout`. Its `name` is `'TimeoutError'` and its `message` is `Timed out after <timeout>ms`.

| Property  | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `timeout` | `number` | The time until the timeout, in milliseconds |

### `promiseTry`

```ts
promiseTry<A extends unknown[], R>(fn: (...args: A) => R | PromiseLike<R>, ...args: A): Promise<Awaited<R>>
```

Calls `fn` with `args` and returns the result as a `Promise`. If `fn` throws synchronously, the returned `Promise` is rejected. Behaves the same as the standard `Promise.try` (ES2025).

```ts
await promiseTry((a: number, b: number) => a + b, 1, 2); // 3
await promiseTry(() => {
  throw new Error('x');
}); // rejects
```

| Parameter | Type                                  | Description                  |
| --------- | ------------------------------------- | ---------------------------- |
| `fn`      | `(...args: A) => R \| PromiseLike<R>` | The function to run          |
| `...args` | `A`                                   | The arguments passed to `fn` |

### `withAbortableTimeout`

```ts
withAbortableTimeout<T extends unknown[], R>(fn: (signal: AbortSignal, ...args: T) => Promise<R>, timeout: number): (...args: T) => Promise<R>
```

Works like `withTimeout`, and also lets `fn` stop its work on timeout. Use `withTimeout` when you do not need to abort the operation.

Each call creates its own `AbortController` and passes its `signal` to `fn` as the first argument. On timeout the `signal` is aborted with the `TimeoutError` as its `reason` (browsers without `reason` support use an `AbortError`). Pass the `signal` to operations that support `AbortSignal`, such as `fetch`, to stop them. The returned function takes the arguments of `fn` without the `signal`.

```ts
const fetchWithTimeout = withAbortableTimeout(
  (signal, url: string) => fetch(url, { signal }),
  5000,
);
await fetchWithTimeout('/api/items');
```

| Parameter | Type                                              | Description                                                        |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `fn`      | `(signal: AbortSignal, ...args: T) => Promise<R>` | The async function. Receives the `signal` first                    |
| `timeout` | `number`                                          | The time until the timeout, in milliseconds. Same as `withTimeout` |

### `withCache`

```ts
withCache<T extends unknown[], R>(fn: (...args: T) => Promise<R>, options?: WithCacheOptions<T, R>): (...args: T) => Promise<R>
```

Returns a function that caches the results of an async function per arguments. Calls with the same arguments return the cached result from the second time on. While a call with the same arguments is in progress, later calls share its result. Failed results are not cached.

Expired entries are removed from the `store` on each call, checked in the order they were stored. There is no limit on the number of entries by default; set `maxEntries` to remove the oldest stored entries first. Both apply only to entries stored by this wrapper. If you need an LRU cache (keeping recently used entries), pass one as the `store`.

```ts
const fetchUserCached = withCache(fetchUser, { ttl: 60_000 });
await fetchUserCached('user-1'); // calls fetchUser
await fetchUserCached('user-1'); // returns the cached result
```

| Parameter  | Type                         | Description                 |
| ---------- | ---------------------------- | --------------------------- |
| `fn`       | `(...args: T) => Promise<R>` | The async function to cache |
| `options?` | `WithCacheOptions<T, R>`     | The options below           |

| Option        | Type                     | Description                                                                                                                                                                                                                                          |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ttl?`        | `number`                 | How long a cached result stays valid, in milliseconds. Expired results are fetched again. Cached indefinitely if omitted. If `0` or less, results are not stored and only in-progress calls are shared                                               |
| `maxEntries?` | `number`                 | The maximum number of entries to store. When exceeded, the oldest stored entry is removed (stored order, not used order). No limit if omitted. Fractions are truncated. If `0` or less, results are not stored and only in-progress calls are shared |
| `getKey?`     | `(...args: T) => string` | A function that builds the cache key from the arguments. Defaults to `JSON.stringify(args)`, which maps some different values to the same key (`undefined` and `null`, `Map` / `Set` and `{}`, and so on)                                            |
| `store?`      | `WithCacheStore<R>`      | Where results are cached: an object with `get`, `set`, and `delete`. Defaults to an internal `Map`                                                                                                                                                   |

### `withFallback`

```ts
withFallback<T extends unknown[], R>(fn: (...args: T) => Promise<R>, fallback: (error: unknown) => R | Promise<R>, options?: WithFallbackOptions): (...args: T) => Promise<R>
```

Returns a function that returns the result of `fallback` when the async function fails.

```ts
const fetchListSafely = withFallback(fetchList, () => []);

const fetchItemSafely = withFallback(fetchItem, () => null, {
  shouldFallback: (error) => error instanceof HttpError && error.status === 404,
});
```

| Parameter  | Type                                  | Description                                                   |
| ---------- | ------------------------------------- | ------------------------------------------------------------- |
| `fn`       | `(...args: T) => Promise<R>`          | The async function to add a fallback to                       |
| `fallback` | `(error: unknown) => R \| Promise<R>` | Called with the error when `fn` fails. Its result is returned |
| `options?` | `WithFallbackOptions`                 | The options below                                             |

| Option            | Type                          | Description                                                                                                         |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `shouldFallback?` | `(error: unknown) => boolean` | Decides whether to switch to `fallback`. Returning `false` rethrows the error. Falls back on every error if omitted |
| `onFallback?`     | `(error: unknown) => void`    | Called when switching to `fallback`, for example to log the error                                                   |

### `withRetry`

```ts
withRetry<T extends unknown[], R>(fn: (...args: T) => Promise<R>, maxRetries: number, options?: WithRetryOptions): (...args: T) => Promise<R>
```

Returns a function that retries the async function up to `maxRetries` times when it fails (up to `maxRetries + 1` attempts in total). Throws the last error if every attempt fails.

```ts
const fetchDataWithRetry = withRetry(fetchData, 3, {
  delay: 1000,
  exponentialBackoff: true,
  shouldRetry: (error) => error instanceof HttpError && error.status >= 500,
});
```

| Parameter    | Type                         | Description                                                                                              |
| ------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `fn`         | `(...args: T) => Promise<R>` | The async function to retry                                                                              |
| `maxRetries` | `number`                     | The maximum number of retries. Fractions are truncated, and negative values and `NaN` are treated as `0` |
| `options?`   | `WithRetryOptions`           | The options below                                                                                        |

| Option                | Type                                           | Description                                                                                                                                                  |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delay?`              | `number`                                       | The wait before a retry, in milliseconds. Capped at the maximum of `setTimeout` (2^31 - 1 ms, about 24.8 days). Defaults to `0`                              |
| `exponentialBackoff?` | `boolean`                                      | If `true`, the wait grows with each retry as `delay × 2^(failures - 1) × a random factor of 0.5–1.0`. Defaults to `false`                                    |
| `shouldRetry?`        | `(error: unknown, retries: number) => boolean` | Decides whether to retry. `retries` is the number of failures so far. Returning `false` throws the error without retrying. Retries on every error if omitted |
| `onRetry?`            | `(error: unknown, retries: number) => void`    | Called right before each retry, with the number of the upcoming retry (from 1). Useful for logging                                                           |

### `withTimeout`

```ts
withTimeout<T extends unknown[], R>(fn: (...args: T) => Promise<R>, timeout: number): (...args: T) => Promise<R>
```

Returns a function that rejects with `TimeoutError` when the async function does not finish within `timeout` milliseconds. The original operation keeps running after the timeout; to abort it, use `withAbortableTimeout`.

```ts
const fetchDataWithTimeout = withTimeout(fetchData, 5000);
```

| Parameter | Type                         | Description                                                                                                                                                                                       |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fn`      | `(...args: T) => Promise<R>` | The async function to add a timeout to                                                                                                                                                            |
| `timeout` | `number`                     | The time until the timeout, in milliseconds. Values over the maximum of `setTimeout` (about 24.8 days) are supported, `Infinity` never times out, and `NaN` or negative values are treated as `0` |

### Types

| Type                     | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `WithCacheOptions<T, R>` | Options for `withCache`                           |
| `WithCacheStore<R>`      | The interface of the cache store for `withCache`  |
| `WithCacheEntry<R>`      | An entry kept in the store `{ value, expiresAt }` |
| `WithFallbackOptions`    | Options for `withFallback`                        |
| `WithRetryOptions`       | Options for `withRetry`                           |

## License

MIT
