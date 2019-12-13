const { DEFAULT_API_URL } = require('../utils/constants')

/**
 * Configuration and credentials for E3DB.
 *
 * @property {number} version          The version number of the configuration format (currently 1)
 * @property {string} clientId         The client's unique client identifier
 * @property {string} apiKeyId         The client's non-secret API key component
 * @property {string} apiSecret        The client's confidential API key component
 * @property {string} publicKey        The client's Base64URL encoded Curve25519 public key
 * @property {string} privateKey       The client's Base64URL encoded Curve25519 private key
 * @property {string} [apiUrl]         Optional base URL for the E3DB API service
 * @property {string} [publicSigningKey]  The client's Base64URL encoded Ed25519 public key
 * @property {string} [privateSigningKey] The client's Base64URL encoded Ed25519 private key
 */
class Config {
  static fromObject(obj) {
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj)
      } catch (err) {
        throw new Error(
          'Config.fromObject param JSON string could not be parsed.'
        )
      }
    }
    const apiUrl = obj.apiUrl || obj.api_url
    const apiKeyId = obj.apiKeyId || obj.api_key_id
    const apiSecret = obj.apiSecret || obj.api_secret
    const clientId = obj.clientId || obj.client_id
    const publicKey = obj.publicKey || obj.public_key
    const privateKey = obj.privateKey || obj.private_key
    const publicSigningKey = obj.publicSigningKey || obj.public_signing_key
    const privateSigningKey = obj.privateSigningKey || obj.private_signing_key
    return new Config(
      clientId,
      apiKeyId,
      apiSecret,
      publicKey,
      privateKey,
      apiUrl,
      publicSigningKey,
      privateSigningKey
    )
  }

  constructor(
    clientId,
    apiKeyId,
    apiSecret,
    publicKey,
    privateKey,
    apiUrl = DEFAULT_API_URL,
    publicSigningKey = '',
    privateSigningKey = ''
  ) {
    if (publicSigningKey === '' || privateSigningKey === '') {
      this.version = 1
    } else {
      this.version = 2
      this.publicSigningKey = publicSigningKey
      this.privateSigningKey = privateSigningKey
    }

    this.clientId = clientId
    this.apiKeyId = apiKeyId
    this.apiSecret = apiSecret
    this.publicKey = publicKey
    this.privateKey = privateKey
    this.apiUrl = apiUrl
  }

  serialize() {
    /* eslint-disable camelcase */
    return {
      version: this.version,
      api_url: this.apiUrl,
      api_key_id: this.apiKeyId,
      api_secret: this.apiSecret,
      client_id: this.clientId,
      public_key: this.publicKey,
      private_key: this.privateKey,
      public_signing_key: this.publicSigningKey,
      private_signing_key: this.privateSigningKey,
    }
    /* eslint-enable */
  }
}

module.exports = Config
