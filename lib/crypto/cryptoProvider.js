const {
  isExtension,
  checkConstructor,
  notImplemented,
} = require('../utils/interface')

/* eslint-disable no-unused-vars */

class CryptoProvider {
  static isExtension(crypto) {
    return isExtension(crypto, CryptoProvider)
  }

  constructor() {
    checkConstructor(this, CryptoProvider)
  }

  /**
   * Mode returns a string denoting which crypto library this implementation uses under the hood.
   */
  mode() {
    notImplemented()
  }

  async nonceBytes() {
    notImplemented()
  }

  async keyBytes() {
    notImplemented()
  }

  async keyPairBytes() {
    notImplemented()
  }

  async signingKeyBytes() {
    notImplemented()
  }

  async randomBytes(length) {
    notImplemented()
  }

  async encryptSymmetric(plain, nonce, key) {
    notImplemented()
  }

  async decryptSymmetric(cipher, nonce, rawKey) {
    notImplemented()
  }

  async encryptAsymmetric(message, nonce, publicKey, privateKey) {
    notImplemented()
  }

  async decryptAsymmetric(cipher, nonce, publicKey, privateKey) {
    notImplemented()
  }

  async seedSymmetricKey(seed, salt, iterations) {
    notImplemented()
  }

  async seedCryptoKeyPair(seed, salt, iterations) {
    notImplemented()
  }

  async seedSigningKeyPair(seed, salt, iterations) {
    notImplemented()
  }

  async generateKeypair() {
    notImplemented()
  }

  async generateSigningKeypair() {
    notImplemented()
  }

  async sign(message, privateKey) {
    notImplemented()
  }

  async verify(signature, message, publicKey) {
    notImplemented()
  }

  async hash(message) {
    notImplemented()
  }
}

module.exports = CryptoProvider
