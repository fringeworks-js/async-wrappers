export type WithFallbackOptions = {
  /**
   * fallback に切り替えるか判断するコールバック
   *
   * `false` を返すとそのエラーを fallback せず即 throw する。
   * 省略した場合はすべてのエラーで fallback する。
   *
   * @param error 発生したエラー
   */
  shouldFallback?: (error: unknown) => boolean;

  /**
   * fallback 時に実行されるコールバック
   *
   * ログの記録や通知などの副作用を差し込む際に使用する。
   *
   * @param error 発生したエラー
   */
  onFallback?: (error: unknown) => void;
};
