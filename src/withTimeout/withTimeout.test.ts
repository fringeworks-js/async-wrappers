import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError } from '../TimeoutError';
import withTimeout from './withTimeout';

describe('withTimeout', () => {
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

  /**
   * 指定 ms 後に解決する非同期関数を返す。
   *
   * withTimeout は Promise.race を使うため、タイムアウトが先に発火すると
   * この関数の resultPromise が後で resolve/reject しても捨てられる。
   * ただし内部の setTimeout が残るとタイマーが残留するため、
   * シンプルに setTimeout ベースで実装し、race で負けた場合の
   * unhandled rejection が起きないよう fn 自体は resolve のみで構成する。
   */
  function resolveAfter<T>(ms: number, value: T) {
    return vi.fn(async (..._args: unknown[]) => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return value;
    });
  }

  /**
   * 指定 ms 後に reject する非同期関数を返す。
   *
   * Promise.race で fn の reject が勝った後、timeoutPromise が後から reject する。
   * timeoutPromise の rejection は withTimeout 内部では捕捉されないため、
   * テスト側で必ず `.catch(() => {})` を付けて呼び出す必要がある。
   * （各テストで対処済み）
   */
  function rejectAfter(ms: number, error: unknown) {
    return vi.fn(async () => {
      await new Promise<never>((_, reject) =>
        setTimeout(() => reject(error), ms),
      );
    });
  }

  /**
   * タイムアウトが発生するテスト用のヘルパー。
   *
   * Promise.race でタイムアウト側が勝った場合、負けた resultPromise は
   * 内部で参照が残らず後から resolve/reject しても unhandled になる。
   * そのため race に渡す前に .catch(() => {}) を付けた silenced Promise を
   * 使いたいが、それは withTimeout の内部実装なので外からは制御できない。
   *
   * 代わりに、wrapped() の Promise（race の勝者）を捕捉しつつ、
   * タイマーを進めて負けた側も決着させることで unhandled を防ぐ。
   *
   * 具体的には:
   *   1. wrapped() の Promise に事前に .catch(() => {}) を付ける（silenced）
   *   2. expect(...).rejects で assertion する
   *   3. タイマーを進める
   *   4. 残留タイマーも vi.runAllTimersAsync() で全消化する
   */
  async function expectTimeout(
    wrappedCall: () => Promise<unknown>,
    advanceMs: number,
    assertion: (p: Promise<unknown>) => Promise<void>,
  ) {
    const promise = wrappedCall();
    // 負けた側の rejection を握るために事前に catch を付ける
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(advanceMs);
    await assertion(promise);
    // 残留タイマー（負けた resultPromise の setTimeout）を消化
    await vi.runAllTimersAsync();
  }

  // -----------------------------------------------------------------
  // 基本動作
  // -----------------------------------------------------------------

  describe('基本動作', () => {
    it('タイムアウト前に完了した場合、結果を返す', async () => {
      const fn = resolveAfter(100, 'ok');
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBe('ok');
    });

    it('引数を元の関数にそのまま渡す', async () => {
      const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped(42, 'hello');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('42-hello');
      expect(fn).toHaveBeenCalledWith(42, 'hello');
    });

    it('タイムアウト時間を超えた場合、TimeoutError を throw する', async () => {
      const fn = resolveAfter(2000, 'late');
      const wrapped = withTimeout(fn, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });

    it('TimeoutError のメッセージにタイムアウト値が含まれる', async () => {
      const fn = resolveAfter(2000, 'late');
      const wrapped = withTimeout(fn, 500);

      await expectTimeout(
        () => wrapped(),
        500,
        async (p) => {
          const err = await p.catch((e) => e);
          expect(err).toBeInstanceOf(TimeoutError);
          expect((err as TimeoutError).message).toBe('Timed out after 500ms');
        },
      );
    });

    it('タイムアウト前に完了した場合、タイマーはクリアされる', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const fn = resolveAfter(100, 'done');
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('fn が reject した場合、タイマーはクリアされる', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const fn = rejectAfter(100, new Error('fn error'));
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped();
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);
      await promise.catch(() => {});
      // タイムアウトタイマーが残っているので消化してから検証
      await vi.runAllTimersAsync();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // タイムアウトの境界
  // -----------------------------------------------------------------

  describe('タイムアウトの境界', () => {
    it('timeout ms ちょうどでは TimeoutError になる', async () => {
      const fn = resolveAfter(1000, 'ok');
      const wrapped = withTimeout(fn, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });

    it('timeout ms の 1ms 前に完了すればタイムアウトしない', async () => {
      const fn = resolveAfter(999, 'ok');
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(999);
      await expect(promise).resolves.toBe('ok');
    });

    it('fn が reject した場合、TimeoutError ではなく fn のエラーを throw する', async () => {
      const fnError = new Error('fn failed');
      const fn = rejectAfter(100, fnError);
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped();
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).rejects.toBe(fnError);
      // タイムアウトタイマーの残留を消化
      await vi.runAllTimersAsync();
    });
  });

  // -----------------------------------------------------------------
  // controller オプション
  // -----------------------------------------------------------------

  describe('controller オプション', () => {
    it('タイムアウト時に controller.abort() が呼ばれる', async () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');

      const fn = resolveAfter(2000, 'ok');
      const wrapped = withTimeout(fn, 1000, { controller });

      await expectTimeout(
        () => wrapped(),
        1000,
        async (p) => {
          await p.catch(() => {});
          expect(abortSpy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('タイムアウト前に完了した場合、controller.abort() は呼ばれない', async () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, 'abort');

      const fn = resolveAfter(100, 'ok');
      const wrapped = withTimeout(fn, 1000, { controller });

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(abortSpy).not.toHaveBeenCalled();
    });

    it('controller を渡さない場合、abort なしでも TimeoutError を throw する', async () => {
      const fn = resolveAfter(2000, 'ok');
      const wrapped = withTimeout(fn, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });
  });

  // -----------------------------------------------------------------
  // エッジケース
  // -----------------------------------------------------------------

  describe('エッジケース', () => {
    it('ラップした関数は元の戻り値の型を返す', async () => {
      const fn = vi.fn(async (x: number) => x * 2);
      const wrapped = withTimeout(fn, 1000);

      const promise = wrapped(21);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe(42);
    });

    it('複数の並行呼び出しが互いに干渉しない', async () => {
      const fn = resolveAfter(300, 'result');
      const wrapped = withTimeout(fn, 1000);

      const p1 = wrapped();
      const p2 = wrapped();
      await vi.advanceTimersByTimeAsync(300);
      const [a, b] = await Promise.all([p1, p2]);

      expect(a).toBe('result');
      expect(b).toBe('result');
    });

    it('timeout が 0 のとき即座に TimeoutError を throw する', async () => {
      const fn = resolveAfter(0, 'ok');
      const wrapped = withTimeout(fn, 0);

      await expectTimeout(
        () => wrapped(),
        0,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });
  });
});
