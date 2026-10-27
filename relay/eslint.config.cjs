const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
);
