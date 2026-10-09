/**
 * オプション
 */
export type WithRetryOptions = {
  /**
   * リトライ間の待機時間（ミリ秒）
   *
   * @default 0
   */
  delay?: number;

  /**
   * 指数バックオフを有効にするか
   *
   * 有効にすると、リトライのたびに待機時間が指数的に増加する。
   * 基準となる待機時間は `delay` で指定する。
   *
   * 待機時間の計算式:
   * ```
   * delay × 2^(失敗回数 - 1) × jitter
   * ```
   * jitter は 0.5〜1.0 のランダム係数で、複数のクライアントが
   * 同タイミングで失敗した際にリトライが重なる thundering herd を防ぐ。
   *
   * **待機時間の例** (`delay: 1000` の場合)
   * | 失敗回数 | 基準待機時間 | jitter 適用後の範囲 |
   * |---------|------------|-------------------|
   * | 1回目   | 1,000ms    | 500〜1,000ms       |
   * | 2回目   | 2,000ms    | 1,000〜2,000ms     |
   * | 3回目   | 4,000ms    | 2,000〜4,000ms     |
   *
   * 外部APIのレート制限や、サーバー高負荷時のリトライに適している。
   *
   * @default false
   */
  exponentialBackoff?: boolean;

  /**
   * リトライを継続するか判断するコールバック
   *
   * `false` を返すとその時点で即座に `throw` し、残りのリトライを中止する。
   * エラーの種類によってリトライ対象を絞りたい場合に使用する。
   *
   * @param error 発生したエラー
   * @param retries これまでの失敗回数（1～）
   */
  shouldRetry?: (error: unknown, retries: number) => boolean;

  /**
   * 各リトライの直前に実行されるコールバック
   *
   * ログの記録や通知などの副作用を差し込む際に使用する。
   * 最終失敗時（`throw` 直前）には呼ばれない。
   *
   * @param error 発生したエラー
   * @param retries 次のリトライ回数（1～）
   */
  onRetry?: (error: unknown, retries: number) => void;
};
