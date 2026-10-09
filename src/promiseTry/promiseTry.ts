/**
 * 関数を実行し、結果をPromiseで返す
 *
 * 標準の`Promise.try(fn, ...args)`（ES2025）と同じ動作。
 * 関数が同期的に例外を投げた場合もrejectされたPromiseになる。
 * 対応ブラウザーが揃った時点で`Promise.try`に置き換えられるようにしている
 * @param fn 実行する関数
 * @param args 関数に渡す引数
 * @returns 関数の戻り値を解決するPromise
 */
export default function promiseTry<A extends unknown[], R>(
  fn: (...args: A) => R | PromiseLike<R>,
  ...args: A
): Promise<Awaited<R>> {
  return new Promise<Awaited<R>>((resolve) => {
    resolve(fn(...args) as Awaited<R>);
  });
}
