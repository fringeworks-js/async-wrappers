import createExports from '@fringeworks/dev/createExports';
import createExternal from '@fringeworks/dev/createExternal';
import distPackage from '@fringeworks/rollup-plugin-dist-package';
import copy from 'rollup-plugin-copy';
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.{ts,tsx}',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  unbundle: true,
  sourcemap: false,
  clean: true,
  outDir: 'dist',
  minify: false,
  inputOptions: {
    external: createExternal(),
  },
  outputOptions: {
    preserveModules: true,
    preserveModulesRoot: 'src',
    // default exportとnamed exportを併用するため、CJSでも名前付きで出力する
    exports: 'named',
  },
  plugins: [
    distPackage({
      content: {
        main: './index.cjs',
        module: './index.mjs',
        types: './index.d.cts',
        sideEffects: false,
        exports: createExports({
          target: 'dist',
          extraExports: { './package.json': './package.json' },
        }),
      },
      resolveWorkspaceDeps: true,
    }),
    copy({
      targets: [
        {
          src: ['LICENSE', 'README.md', 'README.ja.md'],
          dest: 'dist',
        },
      ],
    }),
  ],
});
