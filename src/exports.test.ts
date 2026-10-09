import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公開している各機能のフォルダーについて、export の規則を検査する
 *
 * - 各フォルダーの index は default export に加えて、フォルダー名と同じ名前で named export する
 * - ルートの index は、各フォルダーの named export を引き継ぐ
 *
 * `export *` は default export を引き継がないため、
 * フォルダー名と同じ名前の export を書き忘れると、ルートから黙って消える。
 */
const root = dirname(fileURLToPath(import.meta.url));
const folders = readdirSync(root).filter(
  (name) => !name.startsWith('_') && statSync(join(root, name)).isDirectory(),
);

describe('exports', () => {
  // ルートの読み込みは全モジュールを読み込むため時間がかかる
  let rootModule: Record<string, unknown>;
  beforeAll(async () => {
    rootModule = await import('./index.ts');
  }, 60_000);

  it('公開しているフォルダーがある', () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  describe.each(folders)('%s', (name) => {
    it('フォルダー名と同じ名前で default export と同じものを export している', async () => {
      const module = await import(`./${name}/index.ts`);
      expect(module[name]).toBeDefined();
      expect(module[name]).toBe(module.default);
    });

    it('ルートから export されている', async () => {
      const module = await import(`./${name}/index.ts`);
      expect(rootModule[name]).toBe(module[name]);
    });
  });
});
