// The toolchain is pinned to TypeScript 6: no TypeScript parser supports
// TypeScript 7 yet. All sources stay erasable-only so they are TS7-ready.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
      'line-comment-position': ['error', { position: 'above' }],
      'no-inline-comments': 'error',
    },
  },
);
