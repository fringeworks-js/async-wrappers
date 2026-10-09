import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WithCacheEntry, WithCacheStore } from './types';
import withCache from './withCache';

describe('withCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------
  // 基本動作
  // -----------------------------------------------------------------

  describe('基本動作', () => {
    it('最初の呼び出しで fn を実行して結果を返す', async () => {
      const fn = vi.fn(async (x: number) => x * 2);
      const cached = withCache(fn);

      await expect(cached(3)).resolves.toBe(6);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('同じ引数での2回目の呼び出しはキャッシュを返し fn を呼ばない', async () => {
      const fn = vi.fn(async (x: number) => x * 2);
      const cached = withCache(fn);

      await cached(3);
      await expect(cached(3)).resolves.toBe(6);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('異なる引数での呼び出しはそれぞれ fn を実行する', async () => {
      const fn = vi.fn(async (x: number) => x * 2);
      const cached = withCache(fn);

      await cached(1);
      await cached(2);
      expect(fn).toHaveBeenCalledTimes(2);
      await expect(cached(1)).resolves.toBe(2);
      await expect(cached(2)).resolves.toBe(4);
      expect(fn).toHaveBeenCalledTimes(2); // 3回目以降はキャッシュ
    });

    it('引数を元の関数にそのまま渡す', async () => {
      const fn = vi.fn(async (a: string, b: number) => `${a}-${b}`);
      const cached = withCache(fn);

      await cached('hello', 42);
      expect(fn).toHaveBeenCalledWith('hello', 42);
    });

    it('fn が reject した場合、そのエラーを throw する', async () => {
      const error = new Error('fetch failed');
      const fn = vi.fn(async () => {
        throw error;
      });
      const cached = withCache(fn);

      await expect(cached()).rejects.toBe(error);
    });

    it('fn が reject した場合、キャッシュには保存されない', async () => {
      let count = 0;
      const fn = vi.fn(async () => {
        if (count++ === 0) {
          throw new Error('first fail');
        }
        return 'ok';
      });
      const cached = withCache(fn);

      await cached().catch(() => {});
      await expect(cached()).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------
  // TTL（有効期限）
  // -----------------------------------------------------------------

  describe('ttl', () => {
    it('ttl 内はキャッシュを返す', async () => {
      const fn = vi.fn(async () => 'value');
      const cached = withCache(fn, { ttl: 1000 });

      await cached();
      vi.advanceTimersByTime(999);
      await cached();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('ttl を過ぎたエントリは再取得する', async () => {
      const fn = vi.fn(async () => 'value');
      const cached = withCache(fn, { ttl: 1000 });

      await cached();
      vi.advanceTimersByTime(1001);
      await cached();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('ttl ちょうどではまだ有効（期限切れは ttl + 1ms 以降）', async () => {
      // 実装の判定式: Date.now() > cached.expiresAt（厳密な大なり）
      // → ttl ちょうど（Date.now() === expiresAt）はまだ有効
      const fn = vi.fn(async () => 'value');
      const cached = withCache(fn, { ttl: 1000 });

      await cached();
      vi.advanceTimersByTime(1000);
      await cached(); // まだ有効
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1); // 1ms 追加で期限切れ
      await cached();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('ttl を省略した場合は無期限にキャッシュされる', async () => {
      const fn = vi.fn(async () => 'value');
      const cached = withCache(fn);

      await cached();
      vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER);
      await cached();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('期限切れ後の再取得で新しい値が返る', async () => {
      let count = 0;
      const fn = vi.fn(async () => `value-${++count}`);
      const cached = withCache(fn, { ttl: 1000 });

      await expect(cached()).resolves.toBe('value-1');
      vi.advanceTimersByTime(1001);
      await expect(cached()).resolves.toBe('value-2');
    });
  });

  // -----------------------------------------------------------------
  // 同時リクエスト（in-flight deduplication）
  // -----------------------------------------------------------------

  describe('同時リクエスト', () => {
    it('同じキーへの並行呼び出しは fn を1回しか実行しない', async () => {
      const fn = vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return 'result';
      });
      const cached = withCache(fn);

      const [a, b, c] = await Promise.all([
        cached(),
        cached(),
        cached(),
        vi.runAllTimersAsync(),
      ]);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(a).toBe('result');
      expect(b).toBe('result');
      expect(c).toBe('result');
    });

    it('in-flight 中に別キーのリクエストが来ても干渉しない', async () => {
      const fn = vi.fn(async (x: number) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return x * 2;
      });
      const cached = withCache(fn);

      const [a, b] = await Promise.all([
        cached(1),
        cached(2),
        vi.runAllTimersAsync(),
      ]);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(a).toBe(2);
      expect(b).toBe(4);
    });

    it('in-flight 完了後はキャッシュから返す', async () => {
      const fn = vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return 'done';
      });
      const cached = withCache(fn);

      // 進行中リクエストを完了させる
      const p = cached();
      vi.advanceTimersByTime(100);
      await p;

      // 次の呼び出しはキャッシュから
      await cached();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('in-flight 中に reject した場合、全ての並行呼び出しがエラーを受け取る', async () => {
      const error = new Error('parallel fail');
      const fn = vi.fn(async () => {
        await new Promise<never>((_, reject) =>
          setTimeout(() => reject(error), 100),
        );
      });
      const cached = withCache(fn);

      const results = await Promise.allSettled([
        cached(),
        cached(),
        cached(),
        vi.runAllTimersAsync(),
      ]);

      // 最後の vi.runAllTimersAsync() の結果を除いた3件を検証
      results.slice(0, 3).forEach((r) => {
        expect(r.status).toBe('rejected');
        expect((r as PromiseRejectedResult).reason).toBe(error);
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------
  // getKey オプション
  // -----------------------------------------------------------------

  describe('getKey オプション', () => {
    it('getKey 関数でキーをカスタマイズできる', async () => {
      const fn = vi.fn(async (obj: { id: number; _ts: number }) => obj.id);
      // _ts を無視して id だけをキーにする
      const cached = withCache(fn, {
        getKey: (obj) => String(obj.id),
      });

      await cached({ id: 1, _ts: 100 });
      await cached({ id: 1, _ts: 200 }); // _ts が違っても同じキー
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('getKey が異なる値を返せば別々にキャッシュされる', async () => {
      const fn = vi.fn(async (x: number) => x);
      const cached = withCache(fn, {
        getKey: (x) => String(x),
      });

      await cached(1);
      await cached(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('デフォルトの getKey は JSON.stringify(args) を使う', async () => {
      const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
      const cached = withCache(fn);

      await cached(1, 'a');
      await cached(1, 'b'); // 引数が異なるので別キー
      expect(fn).toHaveBeenCalledTimes(2);

      await cached(1, 'a'); // 同じキーなのでキャッシュ
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------
  // store オプション
  // -----------------------------------------------------------------

  describe('store オプション', () => {
    it('カスタム store を使用できる', async () => {
      const store = new Map<string, WithCacheEntry<number>>();
      const fn = vi.fn(async (x: number) => x * 2);
      const cached = withCache(fn, { store });

      await cached(5);
      expect(store.has('[]')).toBe(false); // デフォルトキー
      expect(store.has('[5]')).toBe(true);
      expect(store.get('[5]')?.value).toBe(10);
    });

    it('store に get/set/delete が呼ばれる', async () => {
      const store: WithCacheStore<string> = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        delete: vi.fn(),
      };
      const fn = vi.fn(async () => 'result');
      const cached = withCache(fn, { store });

      await cached();
      expect(store.get).toHaveBeenCalled();
      expect(store.set).toHaveBeenCalled();
    });

    it('store が既存エントリを返せばキャッシュヒットする', async () => {
      const entry: WithCacheEntry<string> = {
        value: 'cached',
        expiresAt: null,
      };
      const store: WithCacheStore<string> = {
        get: vi.fn().mockReturnValue(entry),
        set: vi.fn(),
        delete: vi.fn(),
      };
      const fn = vi.fn(async () => 'fresh');
      const cached = withCache(fn, { store });

      await expect(cached()).resolves.toBe('cached');
      expect(fn).not.toHaveBeenCalled();
    });

    it('期限切れエントリは store から削除される', async () => {
      const entry: WithCacheEntry<string> = {
        value: 'old',
        expiresAt: Date.now() - 1, // すでに期限切れ
      };
      const store: WithCacheStore<string> = {
        get: vi.fn().mockReturnValue(entry),
        set: vi.fn(),
        delete: vi.fn(),
      };
      const fn = vi.fn(async () => 'fresh');
      const cached = withCache(fn, { store });

      await expect(cached()).resolves.toBe('fresh');
      expect(store.delete).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------
  // エッジケース
  // -----------------------------------------------------------------

  describe('エッジケース', () => {
    it('引数なしの関数でも動作する', async () => {
      const fn = vi.fn(async () => 42);
      const cached = withCache(fn);

      await cached();
      await cached();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('キャッシュの値が falsy（0, false, null）でもキャッシュヒットする', async () => {
      for (const falsyValue of [0, false, null] as const) {
        const fn = vi.fn(async () => falsyValue);
        const cached = withCache(fn);

        await cached();
        await cached();
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });

    it('ラップした関数は元の戻り値の型を返す', async () => {
      const fn = async (x: number) => x * 2;
      const cached = withCache(fn);
      await expect(cached(21)).resolves.toBe(42);
    });
  });
});
