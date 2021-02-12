const { credentialedDecodeResponse, urlEncodeData } = require('../utils')
const { validateResponseAsJSON } = require('../utils')
const fetch = require('isomorphic-fetch')
const PartialClient = require('./partialClient')
const { SECRET_UUID, TYPES } = require('../../lib/utils/constants')
const { GroupMember, Search } = require('../../types')

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
    if (trimmedValue === '') {
      throw new Error('Value cannot be empty')
    }
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
    // create the record
    const recordType = `tozny.secret.${SECRET_UUID}.${secret.secretType}.${secret.secretName}`
    const data = {
      secretValue: secret.secretValue,
    }
    let timestamp = Date.now().toString()
    const meta = {
      secretType: secret.secretType,
      secretName: secret.secretName,
      description: secret.description,
      version: timestamp,
    }
    const secretMade = await this.storage.writeRecord(recordType, data, meta)
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
  /**
   * shareSecretWithUsername
   *
   * @param {String} secretType
   * @param {String} secretName
   * @param {Array} usernameToAdd
   *
   *
   */
  async shareSecretWithUsername(
    client,
    secretName,
    secretType,
    usernamesToAdd
  ) {
    // Generate Group to Validate it exists
    const groupName = `tozny.secret.${this.config.realmName}.${
      this.storage.config.clientId
    }.${secretType.toLowerCase()}`
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId,
      [groupName]
    )
    if (groupList.groups.length < 1) {
      throw new Error('Group Does Not Exist')
    }
    const currentGroup = groupList.groups[0]
    // Create the request for username to client id map
    const searchIdentitiesRequest = {
      identity_usernames: usernamesToAdd,
    }
    let response = await client.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/search/realm/${this.config.realmName}/identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchIdentitiesRequest),
      }
    )
    const clientMapping = await validateResponseAsJSON(response)
    console.log(clientMapping)
    // Create an array and set capabilities to read
    let groupMembers = []
    const capabilities = {
      read: true,
    }
    usernamesToAdd.forEach(username => {
      let usernameLowerCase = username.toLowerCase()
      let member = new GroupMember(
        clientMapping[usernameLowerCase],
        capabilities
      )
      groupMembers.push(member)
    })
    return await this.storage.addGroupMembers(
      currentGroup.groupID,
      groupMembers
    )
  }
}

module.exports = Client
