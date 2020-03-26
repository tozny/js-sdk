const Sodium = require('./sodium')
const Platform = require('./platform')
const FileOperations = require('./fileOperations')
const Tozny = require('../lib/tozny')
const helpers = require('./helpers')

// Option to overwrite default (Crypto)Type mode.
const platform = new Platform()
const fileOperations = new FileOperations()
const mode = process.env.TOZNY_CRYPTO_MODE || 'Sodium'
let crypto
switch (mode) {
  case 'Sodium':
  default:
    crypto = new Sodium()
    break
}

module.exports = new Tozny(crypto, platform, fileOperations, helpers)
