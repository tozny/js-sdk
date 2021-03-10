const fetch = require('cross-fetch')
const { v4: uuidv4 } = require('uuid')
const Config = require('../storage/config')
const { TSV1_SUPPORTED_ALGORITHMS } = require('../utils/constants')

function sortQueryParams(queryString) {
  // Parse query string into field=values
  var query = queryString.split('&')
  for (var i = 0; i < query.length; i++) {
    // Separate fields from values
    let splitQuery = query[i].split('=')
    query[i] = splitQuery
  }
  // Sort alphabetically
  query.sort(function(a, b) {
    return a[0] < b[0] ? -1 : 1
  })
  // Reconstruct query
  for (var j = 0; j < query.length; j++) {
    query[j] = query[j].join('=')
  }
  return query.join('&')
}

function parseUrl(url) {
  const parts = url.split('?')
  const pathMatch = parts[0].match(/:\/\/.*?(\/[^?#].*)?$/)
  return {
    path: pathMatch && pathMatch[1] ? pathMatch[1] : '/',
    queryString: parts[1] ? parts[1].split('#')[0] : '',
  }
}

class AuthenticatedRequest {
  /**
   * Create an AuthenticatedRequest object for interacting with ToznyPlatform in an authenticated manner.
   *
   * @param {Config} config A configuration object for making requests.
   * @param {Crypto} crypto The cryptography implementation.
   */
  constructor(config, crypto) {
    // Populate object values
    this.config = config
    this.crypto = crypto
    this._authToken = null
    this._authTokenTimeout = 0 // Minimum UNIX timestamp
  }

  /**
   * Wrapper method to generate the Authentication header through tsv1 if possible, but defaults to oauth if tsv1 is missing signing keys
   * Throws if both methods of authentication are not possible
   *
   * @param {string} urlString Absolute URL to fetch from the server
   * @param {object} options Object representing additional settings for the fetch
   *
   * @returns {Promise<string>} Promise of a valid authentication header
   */
  async authenticateHeader(urlString, options, userId) {
    if (this.canPerformTSV1Auth(urlString, options)) {
      return this.tsv1Auth(urlString, options, userId)
    }
    if (this.canPerformTokenAuth()) {
      return this.tokenAuth()
    }
    throw new Error(
      'This client is missing the keys to perform any supported authentication method'
    )
  }

  canPerformTSV1Auth(urlString, options) {
    return (
      this.config.publicSigningKey !== undefined &&
      this.config.privateSigningKey !== undefined &&
      urlString !== undefined &&
      options !== undefined
    )
  }

  /**
   * Wrapper method to generate the Authentication header using tsv1
   * Throws if tsv1 is missing needed signing keys or url options
   *
   * @param {string} urlString Absolute URL to fetch from the server
   * @param {object} options Object representing additional settings for the fetch
   *
   * @returns {Promise<string>} Promise of a valid authentication header
   */
  async getTSV1Header(urlString, options) {
    if (this.canPerformTSV1Auth(urlString, options)) {
      return this.tsv1Auth(urlString, options)
    }
    throw new Error('Missing public or private signing key')
  }

  /**
   * Generates and a signed request header according to the tsv1 specifications
   *
   * @returns {Promise<string>} Promise of a valid authentication header
   */
  async tsv1Auth(urlString, options) {
    let { path, queryString } = parseUrl(urlString)
    queryString = sortQueryParams(queryString)
    const timestamp = (Date.now() / 1000) | 0
    // Only one sodium cipher is currently supported.
    const authMethod = TSV1_SUPPORTED_ALGORITHMS[0]
    const nonce = uuidv4()
    const userId = this.config.clientId || ''
    const headerString = `${authMethod}; ${this.config.publicSigningKey}; ${timestamp}; ${nonce}; uid:${userId}`
    const strToSign = `${path}; ${queryString}; ${options.method}; ${headerString}`
    const hashToSign = await this.crypto.hash(strToSign)
    const fullSignature = await this.crypto.sign(
      hashToSign,
      this.config.privateSigningKey
    )
    const authHeader = `${headerString}; ${fullSignature}`
    return authHeader
  }

  canPerformTokenAuth() {
    return (
      this.config.apiKeyId !== undefined && this.config.apiSecret !== undefined
    )
  }

  /**
   * Wrapper method to cache and generate the Authentication header using oAuth
   * Throws if auth object is missing needed API keys
   *
   * @returns {Promise<string>} Promise of a valid authentication header
   */
  async getTokenHeader() {
    if (this._authToken === null || Date.now() > this._authTokenTimeout) {
      if (this.canPerformTokenAuth()) {
        return 'Bearer ' + (await this.tokenAuth())
      }
      throw new Error('Missing needed API keys to perform token auth')
    }
    return 'Bearer ' + this._authToken
  }

  /**
   * Retrieves token for an API key and secret
   *
   * @returns {Promise<string>} Promise of a valid authentication header
   */
  async tokenAuth() {
    let response
    response = await fetch(this.config.apiUrl + '/v1/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          // eslint-disable-next-line no-undef
          this.crypto.platform.b64encodeString(
            `${this.config.apiKeyId}:${this.config.apiSecret}`
          ),
      },
      body: 'grant_type=client_credentials',
    })
    let json = await response.json()
    this._authToken = json.access_token
    this._authTokenTimeout = Date.parse(json.expires_at)
    return this._authToken
  }

  /**
   * Transparent fetch() wrapper to set up authentication headers for oAuth based authentication
   *
   * @param {string} urlString Absolute URL to fetch from the server
   * @param {object} options Object representing additional settings for the fetch
   *
   * @returns {Promise}
   */
  async tokenFetch(urlString, options = {}) {
    let authHeader = await this.getTokenHeader()
    options.headers = options.headers || {}
    options.headers.Authorization = authHeader
    return fetch(urlString, options)
  }

  /**
   * Transparent fetch() wrapper to set up authentication headers for either tsv1 or oAuth based authentication
   *
   * @param {string} urlString Absolute URL to fetch from the server
   * @param {object} options Object representing additional settings for the fetch
   *
   * @returns {Promise}
   */
  async fetch(urlString, options) {
    let authHeader = await this.authenticateHeader(urlString, options)
    // eslint-disable-next-line require-atomic-updates
    options.headers = options.headers || {}
    // eslint-disable-next-line require-atomic-updates
    options.headers.Authorization = authHeader
    return fetch(urlString, options)
  }

  /**
   * Transparent fetch() wrapper to set up authentication headers for oAuth based authentication
   *
   * @param {string} urlString Absolute URL to fetch from the server
   * @param {object} options Object representing additional settings for the fetch
   *
   * @returns {Promise}
   */
  async tsv1Fetch(urlString, options) {
    let authHeader = await this.getTSV1Header(urlString, options)
    // eslint-disable-next-line require-atomic-updates
    options.headers = options.headers || {}
    // eslint-disable-next-line require-atomic-updates
    options.headers.Authorization = authHeader
    return fetch(urlString, options)
  }

  static async anonymousAuth(crypto, publicSigningKey, privateSigningKey) {
    let config = Config.fromObject({
      publicSigningKey,
      privateSigningKey,
    })
    return new AuthenticatedRequest(config, crypto)
  }
}

module.exports = AuthenticatedRequest
