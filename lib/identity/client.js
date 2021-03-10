const { credentialedDecodeResponse, urlEncodeData } = require('../utils')
const fetch = require('isomorphic-fetch')
const { validateResponseAsJSON } = require('../utils')
const PartialClient = require('./partialClient')
const {
  SECRET_UUID,
  TYPES,
  REQUIRED_CLIENT_KEYS,
  PUBLIC_SIGNING_LENGTH,
  PRIVATE_SIGNING_LENGTH,
  PUBLIC_KEY_LENGTH,
  PRIVATE_KEY_LENGTH,
} = require('../../lib/utils/constants')
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
   * verifyClientCreds
   *
   * @param {Object} credential the secret value for a client type secret.
   *
   */
  verifyClientCreds(credential) {
    let cred = credential
      .split('{')
      .pop()
      .split('}')[0]
      .split(',')
    let keys = {}
    cred.forEach(pair => {
      let [key, ...value] = pair.split(':')
      key = key.split('"')[1]
      // checks that values are given in the correct format
      if (value.length === 0 || value[0].trim() === '') {
        throw new Error(`Key-value pairs must be of the form 'key': 'value'`)
      }
      value = value.join(':')
      value = value.split('"')[1]
      keys[key.trim()] = value.trim()
    })
    // checks that all of the required keys are included
    REQUIRED_CLIENT_KEYS.forEach(key => {
      if (!(key in keys)) {
        throw new Error(`Key '${key}' must be in client credential`)
      } else if (keys[key] === '') {
        throw new Error(`Value for '${key}' must be non-empty`)
      }
    })
    // checks that client_id is a uuid
    if (
      !/^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/.test(
        keys['client_id']
      )
    ) {
      throw new Error('Value for client_id should be in UUID format')
    }
    if (keys['public_signing_key'].length !== PUBLIC_SIGNING_LENGTH) {
      throw new Error('Invalid key length: public_signing_key')
    } else if (keys['private_signing_key'].length !== PRIVATE_SIGNING_LENGTH) {
      throw new Error('Invalid key length: private_signing_key')
    } else if (keys['public_key'].length !== PUBLIC_KEY_LENGTH) {
      throw new Error('Invalid key length: public_key')
    } else if (keys['private_key'].length !== PRIVATE_KEY_LENGTH) {
      throw new Error('Invalid key length: private_key')
    }
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
    if (trimmedValue === '' && secret.secretType === 'Credential') {
      throw new Error('Value cannot be empty')
    }
    if (secret.secretType === 'File' && secret.fileName.trim() === '') {
      throw new Error('Filename cannot be empty')
    }
    if (secret.secretType === 'File' && secret.file.size > 5242880) {
      throw new Error('File size must be less that 5MB')
    }
    if (secret.secretType === 'Client') {
      this.verifyClientCreds(secret.secretValue)
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
    var secret
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId
    )
    for (let index = 0; index < groupList.groups.length; index++) {
      let sharedRecords = await this.storage.listRecordsSharedWithGroup(
        groupList.groups[0].groupID
      )
      for (
        let recordIndex = 0;
        recordIndex < sharedRecords[0].length;
        recordIndex++
      ) {
        if (
          sharedRecords[0][recordIndex].meta.recordId === secretID &&
          sharedRecords[0][recordIndex].meta.writerId !==
            this.storage.config.clientId
        ) {
          secret = sharedRecords[0][recordIndex]
        }
      }
    }
    if (secret === undefined) {
      secret = await this.storage.readRecord(secretID)
    }
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
   * getSharedSecrets returns all the secrets that are currently shared
   *  with the identity
   *
   *
   * @return {Promise<Record>}
   */
  async getSharedSecrets() {
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId
    )
    // no records shared with groups
    if (groupList.groups.length < 1) {
      return []
    }
    let sharedRecordList = []
    for (let index = 0; index < groupList.groups.length; index++) {
      let sharedRecords = await this.storage.listRecordsSharedWithGroup(
        groupList.groups[0].groupID
      )
      for (
        let recordIndex = 0;
        recordIndex < sharedRecords[0].length;
        recordIndex++
      ) {
        if (
          sharedRecords[0][recordIndex].meta.writerId !=
          this.storage.config.clientId
        ) {
          // dont want records written by you
          sharedRecordList.push(sharedRecords[0][recordIndex])
        }
      }
    }
    return sharedRecordList
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
    let clientResponse = await this.searchRealmIdentitiesByUsername([
      usernameToAdd,
    ])
    let usernameLowerCase = usernameToAdd.toLowerCase()
    let clientID
    if (clientResponse.searched_identities_information == null) {
      return null
    }
    for (
      let index = 0;
      index < clientResponse.searched_identities_information.length;
      index++
    ) {
      if (
        clientResponse.searched_identities_information[index].realm_username ==
        usernameLowerCase
      ) {
        clientID =
          clientResponse.searched_identities_information[index].client_id
      }
    }
    if (clientID == null) {
      return null
    }
    // Look up group for our current user sharing to the username
    // The group name is ordered by first clientID is the client who wrote the secret
    // and second clientID is the user that we are sharing with
    // This allows visibility to who owns the secret within a pairing
    const groupName = `tozny.secret.${this.config.realmName}.${this.storage.config.clientId}.${clientID}.${secretName}.${secretType}`
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId,
      [groupName]
    )
    let currentGroup
    if (groupList.groups.length < 1) {
      // Group Does not Exists, create one
      const groupDesciption = `${usernameToAdd}`
      const newGroup = await this.storage.createGroup(
        groupName,
        [],
        groupDesciption
      )
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
   * @return {Object} An Object containing An array of Information for every
   * Username which was passed in. The information passed back contains, ClientID, UserId, and Usernames
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

  /**
   * revokeSecretFromUser takes in a secret type and secret name and a username of the
   * user that you want to revoke reading permissions from
   *
   * @param {String} secretType The secret type, example 'Credential'
   * @param {String} secretName The user given name for the secret stored in the meta data
   * @param {String} userToRevokeShare The username of the user that will have permissions revoked
   *
   * @return {Boolean}
   */
  async revokeSecretFromUser(secretName, secretType, userToRevokeShare) {
    // Validation
    if (userToRevokeShare == '') {
      throw new Error('Username Required')
    }
    // Look Up the ClientID for Username
    let clientResponse = await this.searchRealmIdentitiesByUsername([
      userToRevokeShare,
    ])
    let usernameLowerCase = userToRevokeShare.toLowerCase()
    let clientID
    if (clientResponse.searched_identities_information == null) {
      return null
    }
    for (
      let index = 0;
      index < clientResponse.searched_identities_information.length;
      index++
    ) {
      if (
        clientResponse.searched_identities_information[index].realm_username ==
        usernameLowerCase
      ) {
        clientID =
          clientResponse.searched_identities_information[index].client_id
      }
    }
    if (clientID == null) {
      return null
    }
    // Look up group for our current user sharing to the username
    // The group name is ordered by first clientID is the client who wrote the secret
    // and second clientID is the user that we are sharing with
    // This allows visibility to who owns the secret within a pairing
    const groupName = `tozny.secret.${this.config.realmName}.${this.storage.config.clientId}.${clientID}.${secretName}.${secretType}`
    const groupInfo = await this.storage.groupInfo(
      groupName,
      this.storage.config.clientId
    )
    if (groupInfo === {}) {
      // Group Does not Exists, so record is not shared
      return true
    } else {
      // ushare record with group
      const currentGroup = groupInfo
      let recordType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
      let revokedFromGroup = await this.storage.revokeRecordWithGroup(
        currentGroup.groupID,
        recordType
      )
      return revokedFromGroup
    }
  }

  /**
   * getSecretSharedList returns a list of usernames to which the secret is shared with
   *
   * @param {String} secretType secret type that is being used to see the share list
   * @param {String} secretName secret name that is being used to see the share list
   *
   * @return {Promise<Record>}
   */
  async getSecretSharedList(secretName, secretType) {
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId
    )
    let groupSharedList = []
    for (let index = 0; index < groupList.groups.length; index++) {
      let groupNameSplit = groupList.groups[index].groupName.split('.')
      if (groupNameSplit.length == 7) {
        // check if they have any records shared with them
        const recordsShared = await this.storage.listRecordsSharedWithGroup(
          groupList.groups[index].groupID
        )
        if (recordsShared.length > 1) {
          // this would make the group share name
          if (
            groupNameSplit[3] == this.storage.config.clientId &&
            groupNameSplit[5] == secretName &&
            groupNameSplit[6] == secretType &&
            groupList.groups[index].memberCount > 1
          ) {
            // Check to make sure they are the writer
            // and secret type and secret name are the same
            groupSharedList.push({
              username: groupList.groups[index].description,
              groupMembers: groupList.groups[index].memberCount,
            }) // add their username to the list which is stored in the group description
          }
        }
      }
    }
    return groupSharedList
  }
  /**
   * searchRealmIdentitiesByEmail
   *
   * @param {Array} emailsToSearch
   *
   * @return {Object} An Object containing An array of Information for every
   * Username which was passed in. The information passed back contains, ClientID, UserId, and Usernames
   */
  async searchRealmIdentitiesByEmail(emailsToSearch = []) {
    const SearchRealmIdentitiesRequest = {
      identity_emails: emailsToSearch,
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
  /**
   * privateRealmInfo fetches private information about a realm
   *
   * @return {Object} information about a realm
   */
  async privateRealmInfo() {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/realm/info/${this.config.realmName}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    return await validateResponseAsJSON(response)
  }
  /**
   * searchIdentityByUsername
   *
   * @param {Array} username the username of the identity to get information about
   *
   * @return {Object} containing information about a the user passed in
   */
  async searchIdentityByUsername(username) {
    if (username == '') {
      throw new Error('Username Required')
    }
    let response = await this.searchRealmIdentitiesByUsername([username])
    if (response.searched_identities_information != null) {
      return response.searched_identities_information[0]
    }
    return {}
  }
  /**
   * searchIdentityByEmail
   *
   * @param {Array} email the email of the identity to get information about
   *
   * @return {Object} containing information about a the user passed in
   */
  async searchIdentityByEmail(email) {
    if (email == '') {
      throw new Error('Username Required')
    }
    let response = await this.searchRealmIdentitiesByEmail([email])
    if (response.searched_identities_information != null) {
      return response.searched_identities_information[0]
    }
    return {}
  }
}

module.exports = Client
