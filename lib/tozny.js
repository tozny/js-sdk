const Crypto = require('./crypto/crypto')
const Identity = require('./identity')
const Storage = require('./storage')
const types = require('../types')

class Tozny {
  constructor(cryptoProvider, platform, fileOperations, helpers = {}) {
    this.crypto = new Crypto(cryptoProvider, platform)
    this.storage = new Storage(this.crypto, fileOperations)
    this.identity = new Identity(this.crypto, this.storage)
    this.types = types
    this.helpers = helpers
  }
}

module.exports = Tozny
