import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
      // browserもnodeも有効にしない
      globals: {},
    },
    rules: {
      // 基本はerror
      '@typescript-eslint/no-explicit-any': 'error',
      // prefix付は使ってなくても許容
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/type/unsafeCast/unsafeCast.ts'],
    rules: {
      // 特定のファイルはwarn
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      // テストコードはoff
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
