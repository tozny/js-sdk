const sodium = require('libsodium-wrappers')
const CryptoProvider = require('../../lib/crypto/cryptoProvider')
const { DEFAULT_KDF_ITERATIONS } = require('../../lib/utils/constants')

/**
 * Use PBKDF2 to derive a key of a given length using a specified password
 * and salt.
 *
 * @param {string} password     User-specified password
 * @param {string} salt         User-specified salt (should be random)
 * @param {number} length       Length of the key to generate
 * @param {number} [iterations] Option number of hash iterations to create the seed.
 *
 * @returns {Promise<ArrayBuffer>}
 */
async function deriveKey(password, salt, length, iterations) {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    this.maybeToBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: this.maybeToBytes(salt),
      iterations,
      hash: 'SHA-512',
    },
    keyMaterial,
    { name: 'HMAC', hash: { name: 'SHA-1' }, length: length * 8 },
    true,
    ['sign', 'verify']
  )
  return window.crypto.subtle.exportKey('raw', key)
}

class SodiumCrypto extends CryptoProvider {
  mode() {
    return 'Sodium'
  }

  async nonceBytes() {
    await sodium.ready
    return sodium.crypto_secretbox_NONCEBYTES
  }

  async keyBytes() {
    await sodium.ready
    return sodium.crypto_secretbox_KEYBYTES
  }

  async keyPairBytes() {
    await sodium.ready
    return sodium.crypto_box_SEEDBYTES
  }

  async signingKeyPairBytes() {
    await sodium.ready
    return sodium.crypto_sign_SEEDBYTES
  }

  async encryptSymmetric(plain, nonce, key) {
    await sodium.ready
    return sodium.crypto_secretbox_easy(plain, nonce, key)
  }

  async decryptSymmetric(cipher, nonce, key) {
    await sodium.ready
    return sodium.crypto_secretbox_open_easy(cipher, nonce, key)
  }

  async encryptAsymmetric(message, nonce, publicKey, privateKey) {
    await sodium.ready
    return sodium.crypto_box_easy(message, nonce, publicKey, privateKey)
  }

  async decryptAsymmetric(cipher, nonce, publicKey, privateKey) {
    await sodium.ready
    return sodium.crypto_box_open_easy(cipher, nonce, publicKey, privateKey)
  }

  async randomBytes(length) {
    return window.crypto.getRandomValues(new Uint8Array(length))
  }

  async seedSymmetricKey(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    return deriveKey(seed, salt, this.keyBytes(), iterations)
  }

  async seedKeyPair(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    await sodium.ready
    const stretchedSeed = await deriveKey(
      seed,
      salt,
      this.keyPairBytes(),
      iterations
    )

    return sodium.crypto_box_seed_keypair(new Uint8Array(stretchedSeed))
  }

  async seedSigningKeyPair(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    await sodium.ready
    const stretchedSeed = await deriveKey(
      seed,
      salt,
      this.signingKeyPairBytes(),
      iterations
    )

    return sodium.crypto_sign_seed_keypair(new Uint8Array(stretchedSeed))
  }

  async generateKeypair() {
    await sodium.ready
    return sodium.crypto_box_keypair()
  }

  async generateSigningKeypair() {
    await sodium.ready
    return sodium.crypto_sign_keypair()
  }

  async sign(message, privateKey) {
    await sodium.ready
    return sodium.crypto_sign_detached(message, privateKey)
  }

  async verify(signature, message, publicKey) {
    await sodium.ready
    return sodium.crypto_sign_verify_detached(signature, message, publicKey)
  }

  async hash(message) {
    await sodium.ready
    return sodium.crypto_generichash(sodium.crypto_generichash_BYTES, message)
  }
}

module.exports = SodiumCrypto
