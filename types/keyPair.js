/**
 * Base64URL encoded representation of a public/private keypair
 *
 * @property {string} publicKey  Base64URL encoded public key component
 * @property {string} privateKey Base64URL encoded private key component
 */
class KeyPair {
  constructor(publicKey, privateKey) {
    this.publicKey = publicKey
    this.privateKey = privateKey
  }
}

module.exports = KeyPair
