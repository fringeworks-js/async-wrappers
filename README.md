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

Functions, types, and constants can be imported by the same name from the root or from a per-function path. A per-function path also provides its function as the default export.

```ts
import { withRetry } from '@fringeworks/async-wrappers';
import withRetry from '@fringeworks/async-wrappers/withRetry';
```

---

## API

| Function                               | Description                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `TimeoutError(timeout)`                | An error that represents a timeout                                            |
| `promiseTry(fn, ...args)`              | Runs a function and returns its result as a `Promise`                         |
| `withCache(fn, options?)`              | Returns a function that caches the results of an async function               |
| `withFallback(fn, fallback, options?)` | Returns a function that returns a fallback value when an async function fails |
| `withRetry(fn, maxRetries, options?)`  | Returns a function that retries an async function when it fails               |
| `withTimeout(fn, timeout, options?)`   | Returns a function that adds a timeout to an async function                   |

### `TimeoutError`

```ts
class TimeoutError extends Error {
  constructor(timeout: number);
}
```

An error that represents a timeout, thrown by `withTimeout`. Its `name` is `'TimeoutError'` and its `message` is `Timed out after <timeout>ms`.

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

### `withCache`

```ts
withCache<T extends unknown[], R>(fn: (...args: T) => Promise<R>, options?: WithCacheOptions<T, R>): (...args: T) => Promise<R>
```

Returns a function that caches the results of an async function per arguments. Calls with the same arguments return the cached result from the second time on. While a call with the same arguments is in progress, later calls share its result. Failed results are not cached.

```ts
const fetchUserCached = withCache(fetchUser, { ttl: 60_000 });
await fetchUserCached('user-1'); // calls fetchUser
await fetchUserCached('user-1'); // returns the cached result
```

| Option    | Type                     | Description                                                                                                              |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `ttl?`    | `number`                 | How long a cached result stays valid, in milliseconds. Expired results are fetched again. Cached indefinitely if omitted |
| `getKey?` | `(...args: T) => string` | A function that builds the cache key from the arguments. Defaults to `JSON.stringify(args)`                              |
| `store?`  | `WithCacheStore<R>`      | Where results are cached: an object with `get`, `set`, and `delete`. Defaults to an internal `Map`                       |

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

| Option                | Type                                           | Description                                                                                                               |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `delay?`              | `number`                                       | The wait before a retry, in milliseconds. Defaults to `0`                                                                 |
| `exponentialBackoff?` | `boolean`                                      | If `true`, the wait grows with each retry as `delay × 2^(failures - 1) × a random factor of 0.5–1.0`. Defaults to `false` |
| `shouldRetry?`        | `(error: unknown, retries: number) => boolean` | Decides whether to retry. `retries` is the number of failures so far. Returning `false` throws the error without retrying |
| `onRetry?`            | `(error: unknown, retries: number) => void`    | Called right before each retry, with the number of the upcoming retry (from 1). Useful for logging                        |

### `withTimeout`

```ts
withTimeout<T extends unknown[], R>(fn: (...args: T) => Promise<R>, timeout: number, options?: WithTimeoutOptions): (...args: T) => Promise<R>
```

Returns a function that rejects with `TimeoutError` when the async function does not finish within `timeout` milliseconds. The original operation keeps running after the timeout; to abort it, pass a `controller` and hand its `signal` to the operation.

```ts
const controller = new AbortController();
const fetchWithTimeout = withTimeout(
  (url: string) => fetch(url, { signal: controller.signal }),
  5000,
  { controller },
);
```

| Option        | Type              | Description                                               |
| ------------- | ----------------- | --------------------------------------------------------- |
| `controller?` | `AbortController` | An `AbortController` whose `abort()` is called on timeout |

### Types

| Type                     | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `WithCacheOptions<T, R>` | Options for `withCache`                           |
| `WithCacheStore<R>`      | The interface of the cache store for `withCache`  |
| `WithCacheEntry<R>`      | An entry kept in the store `{ value, expiresAt }` |
| `WithFallbackOptions`    | Options for `withFallback`                        |
| `WithRetryOptions`       | Options for `withRetry`                           |
| `WithTimeoutOptions`     | Options for `withTimeout`                         |

## License

MIT
