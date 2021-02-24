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
  const response = await credentialedDecodeResponse(request)
  // record the time this token will expire based on the info response.
  // Since we set this date based on the expires_in response, adding 5 seconds
  // helps ensure we do not attempt to use a token that is expired but shows as
  // valid due to network latency.
  response.expires = Math.floor(Date.now() / 1000) + response.expires_in - 5
  return response
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
    const now = Math.floor(Date.now() / 1000)
    if (!this._tokenInfo || this._tokenInfo.expires < now) {
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
      let size = secret.file.size / 1024
      size = size > 1 ? size.toFixed(1).toString() : '< 1'
      meta['size'] = size
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
   * getFile
   *
   * @param {Object} record the record that contains the file info or the recordId
   *
   * @return {Object} a File object
   */
  async getFile(record) {
    const file = await this.storage.getFile(record)
    return file
  }
  /**
   * shareSecretWithUsername
   *
   * @param {String} secretType
   * @param {String} secretName
   * @param {String} usernameToAdd
   *
   * @return {Promise<Record>}
   */
  async shareSecretWithUsername(secretName, secretType, usernameToAdd) {
    // Validation
    if (usernameToAdd == '') {
      throw new Error('Username Required')
    }
    // Look Up the ClientID for Username
    let clientMapping = await this.searchRealmIdentitiesByUsername([
      usernameToAdd,
    ])
    let usernameLowerCase = usernameToAdd.toLowerCase()
    let clientID =
      clientMapping.identities_username_to_client_aliases[usernameLowerCase]
    if (clientID == null) {
      return null
    }
    // Look up group for our current user sharing to the username
    // The group name is ordered by first clientID is the client who wrote the secret
    // and second clientID is the user that we are sharing with
    // This allows visibility to who owns the secret within a pairing
    const groupName = `tozny.secret.${this.config.realmName}.${this.storage.config.clientId}.${clientID}`
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId,
      [groupName]
    )
    let currentGroup
    if (groupList.groups.length < 1) {
      // Group Does not Exists, create one
      const newGroup = await this.storage.createGroup(groupName)
      currentGroup = newGroup.group
      let groupMembers = []
      const capabilities = {
        read: true,
        share: true,
      }
      const owner = new GroupMember(this.storage.config.clientId, capabilities)
      groupMembers.push(owner)
      const capabilitiesForNewMember = {
        read: true,
      }
      const newMember = new GroupMember(clientID, capabilitiesForNewMember)
      groupMembers.push(newMember)
      await this.storage.addGroupMembers(currentGroup.groupID, groupMembers)
    } else {
      // Group Exists, save the group object
      currentGroup = groupList.groups[0]
    }
    // Generate the Record Type to share
    let recordType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
    let sharedWithGroup = await this.storage.shareRecordWithGroup(
      currentGroup.groupID,
      recordType
    )
    return sharedWithGroup.record_type
  }
  /**
   * searchRealmIdentitiesByUsername
   *
   * @param {Array} usernamesToSearch
   *
   * @return {Object} UsernameToClientIDMapping
   */
  async searchRealmIdentitiesByUsername(usernamesToSearch = []) {
    const SearchRealmIdentitiesRequest = {
      identity_usernames: usernamesToSearch,
    }
    let response = await this.storage.authenticator.tsv1Fetch(
      `${
        this.storage.config.apiUrl
      }/v1/identity/search/realm/${this.config.realmName.toLowerCase()}/identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(SearchRealmIdentitiesRequest),
      }
    )
    return await validateResponseAsJSON(response)
  }
}

module.exports = Client
