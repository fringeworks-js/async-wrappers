import { afterEach, describe, expect, it, vi } from 'vitest';
import withFallback from './withFallback';

describe('withFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------
  // 基本動作
  // -----------------------------------------------------------------

  describe('基本動作', () => {
    it('成功した場合、fallback を呼ばずそのまま結果を返す', async () => {
      const fn = vi.fn(async () => 'ok');
      const fallback = vi.fn(() => 'fallback');
      const wrapped = withFallback(fn, fallback);

      await expect(wrapped()).resolves.toBe('ok');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('失敗した場合、fallback の戻り値を返す', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fail');
      });
      const fallback = vi.fn(() => 'fallback value');
      const wrapped = withFallback(fn, fallback);

      await expect(wrapped()).resolves.toBe('fallback value');
    });

    it('引数を元の関数にそのまま渡す', async () => {
      const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
      const wrapped = withFallback(fn, () => 'fallback');

      await expect(wrapped(42, 'hello')).resolves.toBe('42-hello');
      expect(fn).toHaveBeenCalledWith(42, 'hello');
    });

    it('fallback に発生したエラーが渡される', async () => {
      const error = new Error('original');
      const fn = vi.fn(async () => {
        throw error;
      });
      const fallback = vi.fn(() => 'fallback');
      const wrapped = withFallback(fn, fallback);

      await wrapped();
      expect(fallback).toHaveBeenCalledWith(error);
    });

    it('fallback が Promise を返す場合もその結果を返す', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fail');
      });
      const fallback = vi.fn(async () => 'async fallback');
      const wrapped = withFallback(fn, fallback);

      await expect(wrapped()).resolves.toBe('async fallback');
    });

    it('fallback の戻り値が falsy（空配列など）でも正しく返す', async () => {
      const fn = vi.fn(async () => {
        throw new Error();
      });
      const wrapped = withFallback(fn, () => [] as number[]);

      await expect(wrapped()).resolves.toEqual([]);
    });
  });

  // -----------------------------------------------------------------
  // shouldFallback
  // -----------------------------------------------------------------

  describe('shouldFallback', () => {
    it('shouldFallback が false を返した場合、fallback せずエラーを throw する', async () => {
      const error = new Error('fatal');
      const fn = vi.fn(async () => {
        throw error;
      });
      const fallback = vi.fn(() => 'fallback');
      const wrapped = withFallback(fn, fallback, {
        shouldFallback: () => false,
      });

      await expect(wrapped()).rejects.toBe(error);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('shouldFallback に発生したエラーが渡される', async () => {
      const error = new Error('oops');
      const fn = vi.fn(async () => {
        throw error;
      });
      const shouldFallback = vi.fn().mockReturnValue(true);
      const wrapped = withFallback(fn, () => 'fallback', { shouldFallback });

      await wrapped();
      expect(shouldFallback).toHaveBeenCalledWith(error);
    });

    it('特定のエラー型のみ fallback し、それ以外は throw する', async () => {
      class FallbackError extends Error {}
      class FatalError extends Error {}

      const shouldFallback = (err: unknown) => err instanceof FallbackError;
      const fallback = vi.fn(() => 'fallback');

      const fnFallback = vi.fn(async () => {
        throw new FallbackError();
      });
      const wrappedFallback = withFallback(fnFallback, fallback, {
        shouldFallback,
      });
      await expect(wrappedFallback()).resolves.toBe('fallback');

      const fnFatal = vi.fn(async () => {
        throw new FatalError();
      });
      const wrappedFatal = withFallback(fnFatal, fallback, { shouldFallback });
      await expect(wrappedFatal()).rejects.toBeInstanceOf(FatalError);
    });

    it('shouldFallback を省略した場合はすべてのエラーで fallback する', async () => {
      const fn = vi.fn(async () => {
        throw new Error('any error');
      });
      const fallback = vi.fn(() => 'default fallback');
      const wrapped = withFallback(fn, fallback);

      await expect(wrapped()).resolves.toBe('default fallback');
    });
  });

  // -----------------------------------------------------------------
  // onFallback
  // -----------------------------------------------------------------

  describe('onFallback', () => {
    it('fallback 時に onFallback が呼ばれる', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fail');
      });
      const onFallback = vi.fn();
      const wrapped = withFallback(fn, () => 'fallback', { onFallback });

      await wrapped();
      expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('onFallback に発生したエラーが渡される', async () => {
      const error = new Error('fail');
      const fn = vi.fn(async () => {
        throw error;
      });
      const onFallback = vi.fn();
      const wrapped = withFallback(fn, () => 'fallback', { onFallback });

      await wrapped();
      expect(onFallback).toHaveBeenCalledWith(error);
    });

    it('成功した場合、onFallback は呼ばれない', async () => {
      const fn = vi.fn(async () => 'ok');
      const onFallback = vi.fn();
      const wrapped = withFallback(fn, () => 'fallback', { onFallback });

      await wrapped();
      expect(onFallback).not.toHaveBeenCalled();
    });

    it('shouldFallback が false を返した場合、onFallback は呼ばれない', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fail');
      });
      const onFallback = vi.fn();
      const wrapped = withFallback(fn, () => 'fallback', {
        shouldFallback: () => false,
        onFallback,
      });

      await wrapped().catch(() => {});
      expect(onFallback).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // エッジケース
  // -----------------------------------------------------------------

  describe('エッジケース', () => {
    it('エラーオブジェクト以外（文字列）を throw しても fallback が呼ばれる', async () => {
      const fn = vi.fn(async () => {
        throw 'string error';
      });
      const fallback = vi.fn(() => 'fallback');
      const wrapped = withFallback(fn, fallback);

      await expect(wrapped()).resolves.toBe('fallback');
      expect(fallback).toHaveBeenCalledWith('string error');
    });

    it('ラップした関数は元の戻り値の型を返す', async () => {
      const fn = async (x: number) => x * 2;
      const wrapped = withFallback(fn, () => 0);

      await expect(wrapped(21)).resolves.toBe(42);
    });

    it('複数の並行呼び出しが互いに干渉しない', async () => {
      let count = 0;
      const fn = vi.fn(async () => {
        if (count++ % 2 === 0) {
          throw new Error('odd fail');
        }
        return 'ok';
      });
      const wrapped = withFallback(fn, () => 'fallback');

      const results = await Promise.all([
        wrapped(),
        wrapped(),
        wrapped(),
        wrapped(),
      ]);
      expect(results).toEqual(['fallback', 'ok', 'fallback', 'ok']);
    });
  });
});
