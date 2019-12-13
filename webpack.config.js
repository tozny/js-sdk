const path = require('path')

/* global __dirname */

const makeConfig = (output, postFix = '', sourcemap = false) => ({
  entry: {
    sodium: './browser/sodium/browser.js',
  },
  output: {
    filename: 'tozny-[name]' + postFix + '.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: output,
  devtool: sourcemap ? 'cheap-eval-source-map' : 'none',
})

// Make sure webpack runs both prod and development builds simultaneously
module.exports = env => {
  switch (env) {
    case 'production':
      return [
        makeConfig('development', '.dev', true),
        makeConfig('production', '.min'),
      ]
    default:
      return makeConfig('development', '.dev', true)
  }
}
