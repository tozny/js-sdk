const path = require('path')

/* global __dirname */

const makeConfig = (output, postFix = '', sourcemap = false) => {
  const config = {
    entry: {
      sodium: './browser/sodium/browser.js',
    },
    output: {
      filename: 'tozny-[name]' + postFix + '.js',
      path: path.resolve(__dirname, 'dist'),
    },
    mode: output,
    resolve: {
      fallback: {
        path: false,
        crypto: false,
      },
    },
  }
  if (sourcemap) {
    config.devtool = 'eval-cheap-source-map'
  }
  return config
}

// Make sure webpack runs both prod and development builds simultaneously
module.exports = env => {
  if (env.production) {
    return [
      makeConfig('development', '.dev', true),
      makeConfig('production', '.min'),
    ]
  } else {
    return makeConfig('development', '.dev', true)
  }
}
