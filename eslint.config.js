import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'public', '01_phap_ly_quy_chuan', 'knowledge-base', '.agent', 'supabase'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message: 'Dùng formatDate() / formatDateTime() từ lib/utils (quy chuẩn Date Format).',
        },
        {
          selector: "CallExpression[callee.name='alert']",
          message: 'Không dùng alert() — dùng <Modal> / <ConfirmDialog>.',
        },
        {
          selector: "CallExpression[callee.name='confirm']",
          message: 'Không dùng confirm() — dùng <ConfirmDialog>.',
        },
      ],
    },
  }
);
