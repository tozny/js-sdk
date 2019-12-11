const { validateResponseAsJSON, urlEncodeData } = require('../utils')
const { deriveNoteCreds } = require('./shared')
const fetch = require('isomorphic-fetch')
const CryptoConsumer = require('../crypto/cryptoConsumer')

async function fetchToken(client, appName) {
  /* eslint-disable camelcase */
  const bodyData = {
    grant_type: 'password',
    client_id: appName,
  }
  /* eslint-enable */

  const request = await client.storage.authenticator.tsv1Fetch(
    client.config.apiUrl +
      `/auth/realms/${client.config.realmName}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlEncodeData(bodyData),
    }
  )
  return validateResponseAsJSON(request)
}

class Client extends CryptoConsumer {
  constructor(config, storage) {
    super()
    // Construct this object.
    this.config = config
    this.storage = storage
    this._tokenInfo = false
  }

  serialize() {
    return {
      config: Object.assign({}, this.config),
      storage: this.storage.config.serialize(),
    }
  }

  serializeData() {
    return {
      config: JSON.stringify(this.config),
      storage: JSON.stringify(this.storage.config),
    }
  }

  stringify() {
    return JSON.stringify(this.serialize())
  }

  async changePassword(newPassword) {
    const newCreds = await deriveNoteCreds(
      this.config.realmName,
      this.crypto,
      this.config.username,
      newPassword
    )
    // Write new credentials (change password)
    /* eslint-disable camelcase */
    await this.storage.replaceNoteByName(
      this.serializeData(),
      newCreds.cryptoKeyPair.publicKey,
      newCreds.signingKeyPair.publicKey,
      {
        id_string: newCreds.noteName,
        max_views: -1,
        expires: false,
        eacp: {
          tozid_eacp: {
            realm_name: this.config.realmName,
          },
        },
      }
    )
    /* eslint-enable */
  }

  async token() {
    const info = await this.tokenInfo()
    return info.access_token
  }

  async tokenInfo() {
    const fiveFromNow = Math.floor(Date.now() / 1000) + 5 * 60
    if (!this._tokenInfo || this._tokenInfo.expires < fiveFromNow) {
      const tokenInfo = await fetchToken(this, this.config.appName)
      this._tokenInfo = tokenInfo
    }
    return this._tokenInfo
  }

  async fetch(url, options) {
    const token = await this.token()
    options.headers = options.headers || {}
    options.headers.Authorization = `Bearer ${token}`
    return fetch(url, options)
  }
}

module.exports = Client
