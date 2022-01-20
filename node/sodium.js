const crypto = require('crypto')
const sodium = require('libsodium-wrappers')
const CryptoProvider = require('../lib/crypto/cryptoProvider')
const { DEFAULT_KDF_ITERATIONS } = require('../lib/utils/constants')

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
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, length, 'sha512', (err, val) =>
      err ? reject(err) : resolve(val)
    )
  })
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

  async streamKeyBytes() {
    await sodium.ready
    return sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES
  }

  async streamHeaderBytes() {
    await sodium.ready
    return sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES
  }

  async streamOverheadBytes() {
    await sodium.ready
    return sodium.crypto_secretstream_xchacha20poly1305_ABYTES
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
    await sodium.ready
    return sodium.randombytes_buf(length)
  }

  async seedSymmetricKey(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    return deriveKey(seed, salt, await this.keyBytes(), iterations)
  }

  async seedCryptoKeyPair(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    await sodium.ready
    const stretchedSeed = await deriveKey(
      seed,
      salt,
      await this.keyPairBytes(),
      iterations
    )

    return sodium.crypto_box_seed_keypair(new Uint8Array(stretchedSeed))
  }

  async seedSigningKeyPair(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    await sodium.ready
    const stretchedSeed = await deriveKey(
      seed,
      salt,
      await this.signingKeyPairBytes(),
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

  async hash(message, algorithm = 'Blake2B') {
    if (algorithm === 'Blake2B') {
      await sodium.ready
      return sodium.crypto_generichash(sodium.crypto_generichash_BYTES, message)
    }
    let digestType
    switch (algorithm) {
      case 'SHA-1':
        digestType = 'sha1'
        break
      case 'SHA-256':
        digestType = 'sha256'
        break
      case 'SHA-384':
        digestType = 'sha384'
        break
      case 'SHA-512':
        digestType = 'sha512'
        break
      default:
        throw new Error(`Unsupported hash algorithm ${algorithm}`)
    }
    const hash = crypto.createHash(digestType)
    hash.update(message)
    return hash.digest()
  }

  checksum() {
    return crypto.createHash('md5')
  }

  async encryptStream(key) {
    await sodium.ready
    const stream = sodium.crypto_secretstream_xchacha20poly1305_init_push(key)
    return {
      header: stream.header,
      encrypt: function (block, done) {
        const tag = done
          ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE
        return sodium.crypto_secretstream_xchacha20poly1305_push(
          stream.state,
          block,
          null,
          tag
        )
      },
    }
  }

  async decryptStream(key, header) {
    await sodium.ready
    const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
      header,
      key
    )
    return {
      decrypt: function (block) {
        const decrypted = sodium.crypto_secretstream_xchacha20poly1305_pull(
          state,
          block
        )
        if (!decrypted) {
          throw new Error('Invalid cipher text')
        }
        return decrypted.message
      },
    }
  }
}

module.exports = SodiumCrypto
