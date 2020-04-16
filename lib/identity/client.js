const { credentialedDecodeResponse, urlEncodeData } = require('../utils')
const fetch = require('isomorphic-fetch')
const PartialClient = require('./partialClient')

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
  return credentialedDecodeResponse(request)
}

class Client extends PartialClient {
  constructor(config, storage, agentToken) {
    super(config, storage)
    agentToken.expiry = new Date(agentToken.expiry)
    this._agentToken = agentToken
  }

  serialize() {
    return {
      config: Object.assign({}, this.config),
      storage: this.storage.config.serialize(),
      agent: this._agentToken,
    }
  }

  async agentToken() {
    return this._agentToken.access_token
  }

  async agentInfo() {
    return this._agentToken
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
