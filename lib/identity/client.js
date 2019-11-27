const { validateResponseAsJSON, urlEncodeData } = require('../utils')
const { deriveNoteCreds } = require('../utils/credentials')
const fetch = require('isomorphic-fetch')

module.exports = Client

async function fetchToken(client, appName) {
  /* eslint-disable camelcase */
  const bodyData = {
    grant_type: 'password',
    client_id: appName,
  }
  /* eslint-enable */

  const request = await client.storageClient.authenticator.tsv1Fetch(
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

class Client {
  constructor(config, storageClient, crypto) {
    // Construct this object.
    this.config = config
    this._storage = storageClient
    this._crypto = crypto
    this._tokenInfo = false
  }

  get crypto() {
    return this._crypto
  }

  get storage() {
    return this._storage
  }

  serialize() {
    return {
      config: JSON.stringify(this.config),
      storage: JSON.stringify(this.storage.config),
    }
  }

  async changePassword(newPassword) {
    const newCreds = await deriveNoteCreds(
      this.config,
      this.crypto,
      this.config.username,
      newPassword
    )
    // Write new credentials (change password)
    /* eslint-disable camelcase */
    await this._storageClient.replaceNoteByName(
      this.serialize(),
      newCreds.cryptoKeyPair.publicKey,
      newCreds.signingKeyPair.publicKey,
      {
        id_string: newCreds.noteID,
        max_views: -1,
        expires: false,
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
