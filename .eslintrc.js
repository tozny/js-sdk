
module.exports = {
  root: true,
  env: {
    commonjs: true,
    es6: true,
  },
  globals: {
    console: 'readonly'
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': ['error'],
  }
}
