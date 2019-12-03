const Sodium = require('./sodium')
const Platform = require('./platform')
const Tozny = require('../lib/tozny')

// Option to overwrite default (Crypto)Type mode.
const platform = new Platform()
const mode = process.env.TOZNY_CRYPTO_MODE || 'Sodium'
let crypto
switch (mode) {
  case 'Sodium':
  default:
    crypto = new Sodium()
    break
}

module.exports = new Tozny(crypto, platform)
