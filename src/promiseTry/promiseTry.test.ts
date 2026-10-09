import promiseTry from './promiseTry';

describe('promiseTry', () => {
  it('同期関数の戻り値をPromiseで返す', async () => {
    const fn = (a: number, b: number) => a + b;
    const result = promiseTry(fn, 1, 2);
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(3);
  });

  it('非同期関数の戻り値を解決する', async () => {
    const fn = async (v: number) => v * 2;
    expect(await promiseTry(fn, 5)).toBe(10);
  });

  it('引数なしで実行する', async () => {
    expect(await promiseTry(() => 42)).toBe(42);
  });

  it('同期的に投げられた例外はrejectされる', async () => {
    const result = promiseTry(() => {
      throw new Error('x');
    });
    await expect(result).rejects.toThrow('x');
  });
});
