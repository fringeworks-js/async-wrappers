import { TimeoutError } from '../TimeoutError';
import withTimeout from './withTimeout';

// タイマーの扱いは withAbortableTimeout と共通のため、そちらのテストで検証する
describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** 指定 ms 後に解決する非同期関数を返す */
  function resolveAfter<T>(ms: number, value: T) {
    return vi.fn(async (..._args: unknown[]) => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return value;
    });
  }

  it('タイムアウト前に完了した場合、結果を返す', async () => {
    const wrapped = withTimeout(resolveAfter(100, 'ok'), 1000);

    const promise = wrapped();
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe('ok');
  });

  it('引数だけを元の関数にそのまま渡す', async () => {
    const fn = vi.fn(async (a: number, b?: string) => `${a}-${b}`);
    const wrapped = withTimeout(fn, 1000);

    await expect(wrapped(42, 'hello')).resolves.toBe('42-hello');
    await expect(wrapped(1)).resolves.toBe('1-undefined');
    expect(fn.mock.calls).toEqual([[42, 'hello'], [1]]);
  });

  it('タイムアウト時間を超えた場合、TimeoutError を throw する', async () => {
    const wrapped = withTimeout(resolveAfter(2000, 'late'), 1000);

    const promise = wrapped();
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.runAllTimersAsync();
  });

  it('fn が reject した場合、fn のエラーを throw する', async () => {
    const error = new Error('fn failed');
    const wrapped = withTimeout(async () => {
      throw error;
    }, 1000);

    await expect(wrapped()).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('一度タイムアウトしても、次の呼び出しは成功できる', async () => {
    const wrapped = withTimeout(async (ms: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return ms;
    }, 1000);

    const first = wrapped(2000);
    first.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).rejects.toBeInstanceOf(TimeoutError);

    const second = wrapped(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(second).resolves.toBe(100);
    await vi.runAllTimersAsync();
  });
});
