import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import withRetry from './withRetry';

describe('withRetry', () => {
  // タイマーをフェイクにして待機をスキップ
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------
  // ヘルパー
  // -----------------------------------------------------------------

  /** n 回失敗してから成功する関数を返す */
  function failTimes(n: number, resolvedValue = 'ok') {
    let count = 0;
    return vi.fn(async () => {
      if (count++ < n) {
        throw new Error(`fail #${count}`);
      }
      return resolvedValue;
    });
  }

  /** 常に失敗する関数を返す */
  function alwaysFail(msg = 'always') {
    return vi.fn(async () => {
      throw new Error(msg);
    });
  }

  /**
   * タイマーを含む Promise を安全に解決するヘルパー。
   *
   * `promise` と `vi.runAllTimersAsync()` を同時に走らせることで、
   * タイマー消化中に rejection が unhandled になる瞬間をなくす。
   *
   * rejects を期待するテストでは、生の Promise ではなく
   * `expect(wrapped()).rejects.toThrow(...)` の Promise をここに渡すこと。
   *
   * @example
   * // resolve を期待する場合
   * await runWithTimers(wrapped());
   *
   * @example
   * // reject を期待する場合
   * await runWithTimers(expect(wrapped()).rejects.toThrow('msg'));
   */
  async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
    const [result] = await Promise.all([promise, vi.runAllTimersAsync()]);
    return result;
  }

  // -----------------------------------------------------------------
  // 基本動作
  // -----------------------------------------------------------------

  describe('基本動作', () => {
    it('最初の試行で成功した場合、そのまま結果を返す', async () => {
      const fn = vi.fn(async () => 'success');
      const wrapped = withRetry(fn, 3);
      await expect(wrapped()).resolves.toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('引数を元の関数にそのまま渡す', async () => {
      const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
      const wrapped = withRetry(fn, 2);
      await expect(wrapped(42, 'hello')).resolves.toBe('42-hello');
      expect(fn).toHaveBeenCalledWith(42, 'hello');
    });

    it('maxRetries 回以内に成功した場合、結果を返す', async () => {
      const fn = failTimes(2, 'done'); // 2 回失敗 → 3 回目で成功
      const wrapped = withRetry(fn, 3);
      await expect(runWithTimers(wrapped())).resolves.toBe('done');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('maxRetries を超えても失敗したらエラーを throw する', async () => {
      const fn = alwaysFail('persistent');
      const wrapped = withRetry(fn, 2);
      // rejects 側も runWithTimers に渡して unhandled rejection を防ぐ
      await runWithTimers(expect(wrapped()).rejects.toThrow('persistent'));
      // 初回 + 2 リトライ = 3 回
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('maxRetries が 0 のときリトライなしで即 throw する', async () => {
      const fn = alwaysFail('no retry');
      const wrapped = withRetry(fn, 0);
      await expect(wrapped()).rejects.toThrow('no retry');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------
  // shouldRetry
  // -----------------------------------------------------------------

  describe('shouldRetry', () => {
    it('shouldRetry が false を返したら即座に throw して残りリトライをスキップする', async () => {
      const fn = alwaysFail('stop');
      const shouldRetry = vi.fn().mockReturnValue(false);
      const wrapped = withRetry(fn, 5, { shouldRetry });

      await expect(wrapped()).rejects.toThrow('stop');
      // 最初の失敗後に shouldRetry が呼ばれ、false → 即 throw
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    it('shouldRetry に error と retries が正しく渡される', async () => {
      const error = new Error('oops');
      const fn = vi.fn(async () => {
        throw error;
      });
      const shouldRetry = vi.fn().mockReturnValue(false);
      const wrapped = withRetry(fn, 3, { shouldRetry });

      await expect(wrapped()).rejects.toThrow('oops');
      expect(shouldRetry).toHaveBeenCalledWith(error, 1);
    });

    it('shouldRetry が途中で false を返したらその時点で throw する', async () => {
      // 2 回目のリトライ（retries === 2）で止める
      const fn = alwaysFail('mid-stop');
      const shouldRetry = vi.fn((_, retries: number) => retries < 2);
      const wrapped = withRetry(fn, 5, { shouldRetry });

      await runWithTimers(expect(wrapped()).rejects.toThrow('mid-stop'));
      // 初回 + 1 リトライ = 2 回の呼び出し
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('特定のエラー型のみリトライする', async () => {
      class RetryableError extends Error {}
      class FatalError extends Error {}

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('retry me'))
        .mockRejectedValueOnce(new FatalError('fatal'));

      const shouldRetry = vi.fn((err) => err instanceof RetryableError);
      const wrapped = withRetry(fn, 5, { shouldRetry });

      await runWithTimers(expect(wrapped()).rejects.toBeInstanceOf(FatalError));
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------
  // onRetry
  // -----------------------------------------------------------------

  describe('onRetry', () => {
    it('リトライのたびに onRetry が呼ばれる', async () => {
      const fn = failTimes(2);
      const onRetry = vi.fn();
      const wrapped = withRetry(fn, 3, { onRetry });

      await expect(runWithTimers(wrapped())).resolves.toBe('ok');
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('onRetry に error と retries が正しく渡される', async () => {
      const error = new Error('err');
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');
      const onRetry = vi.fn();
      const wrapped = withRetry(fn, 3, { onRetry });

      await expect(runWithTimers(wrapped())).resolves.toBe('ok');
      expect(onRetry).toHaveBeenCalledWith(error, 1);
    });

    it('最終失敗時（throw 直前）には onRetry は呼ばれない', async () => {
      const fn = alwaysFail();
      const onRetry = vi.fn();
      const wrapped = withRetry(fn, 2, { onRetry });

      await runWithTimers(expect(wrapped()).rejects.toThrow());
      // maxRetries=2 → リトライは 2 回、onRetry も 2 回
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('shouldRetry が false で即 throw した場合も onRetry は呼ばれない', async () => {
      const fn = alwaysFail();
      const onRetry = vi.fn();
      const wrapped = withRetry(fn, 3, {
        shouldRetry: () => false,
        onRetry,
      });

      await expect(wrapped()).rejects.toThrow();
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // delay
  // -----------------------------------------------------------------

  describe('delay', () => {
    it('delay が 0 のときは setTimeout を呼ばない', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const fn = failTimes(1);
      const wrapped = withRetry(fn, 2, { delay: 0 });

      await runWithTimers(wrapped());
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('delay > 0 のときはリトライ前に待機する', async () => {
      const fn = failTimes(1);
      const wrapped = withRetry(fn, 2, { delay: 500 });

      const promise = wrapped();
      // タイマーを進める前は未解決
      await vi.advanceTimersByTimeAsync(499);
      // まだ fn は 1 回だけ（待機中）
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('リトライが複数回あるとき、各リトライで delay が挟まれる', async () => {
      const fn = failTimes(2);
      const wrapped = withRetry(fn, 3, { delay: 200 });

      const promise = wrapped();
      // 1 回目のリトライ待機
      await vi.advanceTimersByTimeAsync(200);
      // 2 回目のリトライ待機
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------
  // exponentialBackoff
  // -----------------------------------------------------------------

  describe('exponentialBackoff', () => {
    it('exponentialBackoff が false のとき待機時間は毎回 delay と同じ', async () => {
      const fn = failTimes(2);
      const wrapped = withRetry(fn, 3, {
        delay: 300,
        exponentialBackoff: false,
      });

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(300);
      await promise;

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('exponentialBackoff が true のとき待機時間は指数的に増加する（jitter 考慮）', async () => {
      // jitter の Math.random() を固定 (係数 = 0.5 + 0.5*random → 0.5 で固定)
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const fn = failTimes(2);
      const wrapped = withRetry(fn, 3, {
        delay: 1000,
        exponentialBackoff: true,
      });

      const promise = wrapped();

      // attempt=0: delay * 2^0 * 0.5 = 500ms
      await vi.advanceTimersByTimeAsync(500);
      expect(fn).toHaveBeenCalledTimes(2); // 初回失敗 + 1 リトライ完了

      // attempt=1: delay * 2^1 * 0.5 = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('exponentialBackoff が true でも delay=0 なら setTimeout を呼ばない', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const fn = failTimes(1);
      const wrapped = withRetry(fn, 2, { delay: 0, exponentialBackoff: true });

      await runWithTimers(wrapped());
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // 型・エッジケース
  // -----------------------------------------------------------------

  describe('エッジケース', () => {
    it('ラップした関数は元の戻り値の型を返す（Promise<R>）', async () => {
      const fn = async (x: number) => x * 2;
      const wrapped = withRetry(fn, 1);
      const result = await wrapped(21);
      expect(result).toBe(42);
    });

    it('エラーオブジェクト以外（文字列）を throw しても正しく再 throw する', async () => {
      const fn = vi.fn(async () => {
        throw 'string error';
      });
      const wrapped = withRetry(fn, 1, { shouldRetry: () => false });
      await expect(wrapped()).rejects.toBe('string error');
    });

    it('複数の並行呼び出しが互いに干渉しない', async () => {
      let callCount = 0;
      const fn = vi.fn(async (id: number) => {
        if (callCount++ < 2) {
          throw new Error('concurrent fail');
        }
        return `result-${id}`;
      });
      const wrapped = withRetry(fn, 3);

      const [a, b] = await Promise.all([
        runWithTimers(wrapped(1)),
        runWithTimers(wrapped(2)),
      ]);

      expect([a, b].sort()).toEqual(['result-1', 'result-2'].sort());
    });
  });
}); // describe('withRetry')
