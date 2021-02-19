const { credentialedDecodeResponse, urlEncodeData } = require('../utils')
const fetch = require('isomorphic-fetch')
const PartialClient = require('./partialClient')
const { SECRET_UUID, TYPES } = require('../../lib/utils/constants')
const { GroupMember, Search } = require('../../types')
const { fileAsUrl } = require('../../browser/helpers')

async function fetchToken(client, appName) {
  /* eslint-disable camelcase */
  const bodyData = {
    grant_type: 'password',
    client_id: appName,
  }
  /* eslint-enable */

  const request = await client.storage.authenticator.tsv1Fetch(
    client.config.apiUrl +
      `/auth/realms/${client.config.realmDomain}/protocol/openid-connect/token`,
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
  secretTypes() {
    return TYPES
  }
  /**
   * createSecret
   *
   * @param {Object} secret the new Secret to create.
   *
   * @return {Promise<Record>}
   */
  async createSecret(secret) {
    const trimmedName = secret.secretName.trim()
    const trimmedValue = secret.secretValue.trim()
    if (secret.secretType === '') {
      throw new Error('Type cannot be empty')
    }
    if (!TYPES.includes(secret.secretType)) {
      throw new Error('Invalid type')
    }
    if (trimmedName === '') {
      throw new Error('Name cannot be empty')
    }
    if (!/^[a-zA-Z0-9-_]{1,50}$/.test(trimmedName)) {
      throw new Error(
        'Secret name must contain 1-50 alphanumeric characters, -, or _'
      )
    }
    if (trimmedValue === '' && secret.secretType !== 'File') {
      throw new Error('Value cannot be empty')
    }
    if (secret.secretType === 'File' && secret.fileName.trim() === '') {
      throw new Error('Filename cannot be empty')
    }
    if (secret.secretType === 'File' && secret.file.size > 5242880) {
      throw new Error('File size must be less that 5MB')
    }
    // also check that file is less than 5Mb
    const groupName = `tozny.secret.${this.config.realmName}.${
      this.storage.config.clientId
    }.${secret.secretType.toLowerCase()}`
    // check if the clients secret group already exists
    const groups = await this.storage.listGroups(this.storage.config.clientId, [
      groupName,
    ])
    let group
    let groupMembers = []
    if (groups.groups.length < 1) {
      // create the group if it doesn't exist
      const newGroup = await this.storage.createGroup(groupName)
      group = newGroup.group
      const capabilities = {
        read: true,
        share: true,
      }
      const member = new GroupMember(this.storage.config.clientId, capabilities)
      groupMembers.push(member)
      // add read and share capabilities for the client
      await this.storage.addGroupMembers(group.groupID, groupMembers)
    } else {
      group = groups.groups[0]
    }
    const recordType = `tozny.secret.${SECRET_UUID}.${secret.secretType}.${secret.secretName}`
    let timestamp = Date.now().toString()
    let meta = {
      secretType: secret.secretType,
      secretName: secret.secretName,
      description: secret.description,
      version: timestamp,
    }
    let secretMade
    if (secret.secretType === 'File') {
      meta['fileName'] = secret.fileName
      // in kibibytes
      const size = secret.file.size / 1024
      meta['size'] = size.toFixed(4).toString()
      const file = await this.storage.writeFile(recordType, secret.file, meta)
      secretMade = await file.record()
    } else {
      const data = {
        secretValue: secret.secretValue,
      }
      secretMade = await this.storage.writeRecord(recordType, data, meta)
    }
    // share record type with the group
    await this.storage.shareRecordWithGroup(group.groupID, recordType)
    return secretMade
  }
  /**
   * get a secret by its ID
   *
   * @param {string} secretID   the ID of the secret
   *
   * @return {Promise<Record>}
   */
  async viewSecret(secretID) {
    const secret = this.storage.readRecord(secretID)
    return secret
  }
  /**
   * getSecrets
   *
   * @param {number} limit   The maximum number of secrets to list per request.
   *
   * @return {Promise<Record>}
   */
  async getSecrets(limit) {
    let request = new Search(true, true, limit)
    let searchType = `tozny.secret.${SECRET_UUID}.*`
    request.match({ type: searchType }, 'OR', 'WILDCARD')
    let resultQuery = await this.storage.search(request)
    return resultQuery
  }
  /**
   * getLatestSecret
   *
   * @param {string} secretName   The name of the Secret given by User.
   * @param {string} secretType   The type of the Secret chosen by User.
   *
   *
   * @return {Promise<Record>}
   */
  async getLatestSecret(secretName, secretType) {
    const request = new Search(true) // Include Data
    let searchType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
    request.match({ type: searchType }, 'AND', 'EXACT').order('DESCENDING')
    let resultQuery = await this.storage.search(request)
    let resultList = await resultQuery.next()
    if (resultList.length > 0) {
      return { exists: true, results: resultList[0] }
    }
    return { exists: false, results: null }
  }
  /*
   * updateSecrets
   *
   * @param {Object} oldSecret The current version of Secret.
   * @param {Object} newSecret The new version of the Secret to create.
   *
   * @return {Promise<Record>}
   */
  async updateSecret(oldSecret, newSecret) {
    // check name and type are the same
    if (oldSecret.secretType != newSecret.secretType) {
      throw new Error('Cannot Update Secret of Different Type')
    }
    if (oldSecret.secretName != newSecret.secretName) {
      throw new Error('Cannot Update Secret of Different Name')
    }
    // Create New Secret
    const newSecretCreated = this.createSecret(newSecret)
    return newSecretCreated
  }
  async downloadFile(recordId) {
    const file = await this.storage.getFile(recordId)
    const url = await fileAsUrl(file)
    return url
  }
}

module.exports = Client
