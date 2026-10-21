import { TimeoutError } from '../TimeoutError';
import withAbortableTimeout from './withAbortableTimeout';

describe('withAbortableTimeout', () => {
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
   * withAbortableTimeout は Promise.race を使うため、タイムアウトが先に発火すると
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
   * fn が先に reject するとタイマーは解除されるため、timeoutPromise は決着しない。
   * 一方、タイムアウトが先の場合は race で負けた fn の reject が後から起きるため、
   * 呼び出した Promise には `.catch(() => {})` を付けておく。
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
   * 使いたいが、それは withAbortableTimeout の内部実装なので外からは制御できない。
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
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBe('ok');
    });

    it('signal に続けて引数を元の関数にそのまま渡す', async () => {
      const fn = vi.fn(
        async (_signal: AbortSignal, a: number, b: string) => `${a}-${b}`,
      );
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped(42, 'hello');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('42-hello');
      expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal), 42, 'hello');
    });

    it('タイムアウト時間を超えた場合、TimeoutError を throw する', async () => {
      const fn = resolveAfter(2000, 'late');
      const wrapped = withAbortableTimeout(fn, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });

    it('TimeoutError のメッセージと timeout にタイムアウト値が含まれる', async () => {
      const fn = resolveAfter(2000, 'late');
      const wrapped = withAbortableTimeout(fn, 500);

      await expectTimeout(
        () => wrapped(),
        500,
        async (p) => {
          const err = await p.catch((e) => e);
          expect(err).toBeInstanceOf(TimeoutError);
          expect((err as TimeoutError).message).toBe('Timed out after 500ms');
          expect((err as TimeoutError).timeout).toBe(500);
        },
      );
    });

    it('タイムアウト前に完了した場合、タイマーはクリアされる', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const fn = resolveAfter(100, 'done');
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('fn が reject した場合、タイマーはクリアされる', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const fn = rejectAfter(100, new Error('fn error'));
      const wrapped = withAbortableTimeout(fn, 1000);

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
      const wrapped = withAbortableTimeout(fn, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });

    it('timeout ms の 1ms 前に完了すればタイムアウトしない', async () => {
      const fn = resolveAfter(999, 'ok');
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(999);
      await expect(promise).resolves.toBe('ok');
    });

    it('fn が reject した場合、TimeoutError ではなく fn のエラーを throw する', async () => {
      const fnError = new Error('fn failed');
      const fn = rejectAfter(100, fnError);
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped();
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).rejects.toBe(fnError);
      // タイムアウトタイマーの残留を消化
      await vi.runAllTimersAsync();
    });
  });

  // -----------------------------------------------------------------
  // signal
  // -----------------------------------------------------------------

  describe('signal', () => {
    it('タイムアウト時に signal が中断され、reason は TimeoutError', async () => {
      let signal: AbortSignal | undefined;
      const wrapped = withAbortableTimeout(async (s: AbortSignal) => {
        signal = s;
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }, 1000);

      await expectTimeout(
        () => wrapped(),
        1000,
        async (p) => {
          const err = await p.catch((e) => e);
          expect(signal?.aborted).toBe(true);
          expect(signal?.reason).toBe(err);
        },
      );
    });

    it('タイムアウト前に完了した場合、signal は中断されない', async () => {
      let signal: AbortSignal | undefined;
      const wrapped = withAbortableTimeout(async (s: AbortSignal) => {
        signal = s;
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return 'ok';
      }, 1000);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBe('ok');
      await vi.runAllTimersAsync();
      expect(signal?.aborted).toBe(false);
    });

    it('signal が中断されて fn が reject しても TimeoutError を throw する', async () => {
      const wrapped = withAbortableTimeout(
        (signal: AbortSignal) =>
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
        1000,
      );

      await expectTimeout(
        () => wrapped(),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });

    it('呼び出しごとに別の signal を渡す', async () => {
      const signals: AbortSignal[] = [];
      const wrapped = withAbortableTimeout(async (signal: AbortSignal) => {
        signals.push(signal);
      }, 1000);

      await wrapped();
      await wrapped();
      expect(signals).toHaveLength(2);
      expect(signals[0]).not.toBe(signals[1]);
    });

    it('一度タイムアウトしても、次の呼び出しは中断されていない signal で実行できる', async () => {
      const wrapped = withAbortableTimeout(
        async (signal: AbortSignal, ms: number) => {
          if (signal.aborted) {
            throw new Error('already aborted');
          }
          await new Promise<void>((resolve) => setTimeout(resolve, ms));
          return 'ok';
        },
        1000,
      );

      await expectTimeout(
        () => wrapped(2000),
        1000,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );

      const promise = wrapped(100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBe('ok');
    });

    it('並行呼び出しの1つがタイムアウトしても、処理中の他の呼び出しは中断されない', async () => {
      const signals: AbortSignal[] = [];
      const wrapped = withAbortableTimeout(
        async (signal: AbortSignal, ms: number) => {
          signals.push(signal);
          await new Promise<void>((resolve) => setTimeout(resolve, ms));
          return ms;
        },
        1000,
      );

      // 0ms 時点で開始し、1000ms でタイムアウトする
      const slow = wrapped(2000);
      slow.catch(() => {});
      await vi.advanceTimersByTimeAsync(500);
      // 500ms 時点で開始し、1200ms で完了する（期限は 1500ms）
      const fast = wrapped(700);

      await vi.advanceTimersByTimeAsync(500);
      await expect(slow).rejects.toBeInstanceOf(TimeoutError);
      expect(signals[1]?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      await expect(fast).resolves.toBe(700);
      await vi.runAllTimersAsync();
    });
  });

  // -----------------------------------------------------------------
  // 同期的な例外
  // -----------------------------------------------------------------

  describe('同期的な例外', () => {
    it('fn が同期的に throw した場合、そのエラーで reject しタイマーを残さない', async () => {
      const error = new Error('sync');
      const wrapped = withAbortableTimeout((): Promise<never> => {
        throw error;
      }, 1000);

      await expect(wrapped()).rejects.toBe(error);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // エッジケース
  // -----------------------------------------------------------------

  describe('エッジケース', () => {
    it('ラップした関数は元の戻り値の型を返す', async () => {
      const fn = vi.fn(async (_signal: AbortSignal, x: number) => x * 2);
      const wrapped = withAbortableTimeout(fn, 1000);

      const promise = wrapped(21);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe(42);
    });

    it('複数の並行呼び出しが互いに干渉しない', async () => {
      const fn = resolveAfter(300, 'result');
      const wrapped = withAbortableTimeout(fn, 1000);

      const p1 = wrapped();
      const p2 = wrapped();
      await vi.advanceTimersByTimeAsync(300);
      const [a, b] = await Promise.all([p1, p2]);

      expect(a).toBe('result');
      expect(b).toBe('result');
    });

    it('setTimeout の最大値を超える timeout も指定どおりに待つ', async () => {
      const timeout = 2 ** 31 + 1000;
      // setTimeout の最大値を超えて待つと素の setTimeout はすぐ発火するため、完了しない Promise にする
      const wrapped = withAbortableTimeout(
        () => new Promise<never>(() => {}),
        timeout,
      );

      const promise = wrapped();
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(2 ** 31 - 1);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(timeout - (2 ** 31 - 1));
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('timeout が Infinity のときはタイムアウトしない', async () => {
      const fn = resolveAfter(1000, 'ok');
      const wrapped = withAbortableTimeout(fn, Infinity);

      const promise = wrapped();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).resolves.toBe('ok');
    });

    it('timeout が 0 のとき即座に TimeoutError を throw する', async () => {
      const fn = resolveAfter(0, 'ok');
      const wrapped = withAbortableTimeout(fn, 0);

      await expectTimeout(
        () => wrapped(),
        0,
        (p) => expect(p).rejects.toBeInstanceOf(TimeoutError),
      );
    });
  });
});
