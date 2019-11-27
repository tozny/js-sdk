const Sodium = require('./sodium')
const Platform = require('../platform')
const Tozny = require('../../lib/tozny')

// Option to overwrite default (Crypto)Type mode.
const platform = new Platform()
const crypto = new Sodium()
module.exports = new Tozny(crypto, platform)
