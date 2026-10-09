export type WithTimeoutOptions = {
  /**
   * タイムアウト時に `AbortController.abort()` を呼び出すかどうか
   *
   * 指定すると、タイムアウト発生時に `signal` を通じて処理の中断を通知する。
   * `fetch` など `AbortSignal` に対応した処理と組み合わせることで、
   * バックグラウンドでの実行を止められる。
   * 呼び出し側で `controller.signal` を関数に渡す必要がある。
   *
   * @example
   * const controller = new AbortController();
   * const fetchWithTimeout = withTimeout(
   *   (url: string) => fetch(url, { signal: controller.signal }),
   *   5000,
   *   { controller },
   * );
   */
  controller?: AbortController;
};
