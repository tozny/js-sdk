const {
  credentialedDecodeResponse,
  validateResponseAsJSON,
  urlEncodeData,
  checkStatus,
  isValidToznySecretNamespace,
} = require('../utils')
const fetch = require('cross-fetch')
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
const {
  AccessRequest,
  AccessRequestSearchResponse,
  GroupMember,
  InitiateWebAuthnChallengeData,
  Search,
  errors,
  IdentityMFADevices,
  ListIdentitiesResult,
  IdentityDetails
} = require('../../types')

async function fetchToken(client, appName) {
  /* eslint-disable camelcase */
  const bodyData = {
    grant_type: 'password',
    client_id: appName,
    scope: 'openid'
  }
  /* eslint-enable */

  const sessionToken = await client.agentToken()

  const request = await client.storage.authenticator.tsv1Fetch(
    client.config.apiUrl +
    `/auth/realms/${client.config.realmDomain}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Tozny-Session': sessionToken,
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
/**
 * getNamespace
 * @param {Client} client
 * @param {Object} namespace
 * @param {Boolean} createIfMissing
 * @return {Object} returns the group based on namespace
 */
async function getNamespace(client, namespace, createIfMissing) {
  const groupName = `tozny.secret.${client.config.realmName}.${namespace}`
  const groupList = await client.storage.listGroups(
    client.storage.config.clientId,
    [groupName]
  )
  let currentGroup
  if (groupList.groups.length < 1 && !createIfMissing) {
    return {}
  }
  if (groupList.groups.length < 1 && createIfMissing) {
    const capabilities = {
      read: true,
      share: true,
      manage: true,
    }
    // Namespace Does not Exists, create one
    const newGroup = await client.storage.createGroup(groupName, capabilities, '')
    currentGroup = newGroup.group
    let groupMembers = []
    const owner = new GroupMember(client.storage.config.clientId, capabilities)
    groupMembers.push(owner)
    await client.storage.addGroupMembers(currentGroup.groupID, groupMembers)
  } else {
    // Group Exists, save the group object
    currentGroup = groupList.groups[0]
  }
  return currentGroup
}
/**
 * Use the OIDC refresh flow to get a new session token for provided identity.
 *
 * @param client {Client} The identity client to refresh the session for
 * @return {Object} The new _agentToken information with absolute expiry dates
 */
async function refreshAgentToken(client) {
  const now = Math.floor(Date.now() / 1000)
  if (!client._agentToken || client._agentToken.refresh_expiry < now) {
    throw new errors.identity.SessionExpiredError(
      'Agent refresh token has expired'
    )
  }
  const bodyData = {
    refresh_token: client._agentToken.refresh_token,
  }
  const request = await client.storage.authenticator.tsv1Fetch(
    client.config.apiUrl +
    `/v1/identity/auth/realm/${client.config.realmDomain}/refresh`,
    {
      method: 'POST',
      body: JSON.stringify(bodyData),
    }
  )
  const agentToken = await credentialedDecodeResponse(request)
  return convertExpiry(agentToken)
}

/**
 * Convert expiry dates in agent tokens to Date objects
 *
 * @param {object} agentToken The agent token with string based expiry dates
 * @returns {objects} The agent token with expiry as parsed Date objects
 */
function convertExpiry(agentToken) {
  agentToken.expiry = new Date(agentToken.expiry)
  if (agentToken.refresh_expiry) {
    agentToken.refresh_expiry = new Date(agentToken.refresh_expiry)
  }
  return agentToken
}

class Client extends PartialClient {
  constructor(config, storage, agentToken) {
    super(config, storage)
    this._agentToken = convertExpiry(agentToken)
  }

  serialize() {
    return {
      config: Object.assign({}, this.config),
      storage: this.storage.config.serialize(),
      agent: this._agentToken,
    }
  }

  /**
   * Get the current session JWT for this identity.
   *
   * @returns {Promise<string>} The JWT string of the current session token
   */
  async agentToken() {
    const info = await this.agentInfo()
    return info.access_token
  }

  /**
   * Get the full session token info object.
   *
   * The returned object is a copy to help prevent unintended mutation of the data.
   *
   * @returns {object} the full token info object for the TozID session token.
   */
  async agentInfo() {
    const now = Math.floor(Date.now() / 1000)
    if (!this._agentToken || this._agentToken.expires < now) {
      this._agentToken = await refreshAgentToken(this)
    }
    return Object.assign({}, this._agentToken)
  }

  async token() {
    const info = await this.tokenInfo()
    return info.access_token
  }

  async tokenInfo() {
    const now = Math.floor(Date.now() / 1000)
    if (!this._tokenInfo || this._tokenInfo.expires < now) {
      this._tokenInfo = await fetchToken(this, this.config.appName)
    }
    return Object.assign({}, this._tokenInfo)
  }

  async fetch(url, options) {
    const token = await this.token()
    options.headers = options.headers || {}
    options.headers.Authorization = `Bearer ${token}`
    return fetch(url, options)
  }

  async logout() {
    const sessionToken = await this.agentToken()
    const request = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/auth/realm/${this.config.realmDomain}/logout`,
      {
        method: 'POST',
        body: JSON.stringify({
          session_token: sessionToken,
        }),
      }
    )
    try {
      await checkStatus(request)
    } catch (e) {
      return false
    }
    return true
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
    let cred = credential.split('{').pop().split('}')[0].split(',')
    let keys = {}
    cred.forEach((pair) => {
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
    REQUIRED_CLIENT_KEYS.forEach((key) => {
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
   * @param {boolean} update true if this is a secret update, false otherwise
   *
   * @return {Promise<Record>}
   */
  async createSecret(secret, update = false) {
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
    let group = await getNamespace(this, this.storage.config.clientId, true)
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
    // if the secret is new (not a version of a current secret), share the record type with the group
    if (!update) {
      // share record type with the group
      await this.storage.shareRecordWithGroup(group.groupID, recordType)
    }
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
    const groupLength = groupList.groups.length
    let processingErrors = []
    for (var index = 0; index < groupLength; index++) {
      let sharedRecords = []
      try {
        sharedRecords = await this.storage.listRecordsSharedWithGroup(
          groupList.groups[index].groupID
        )
      } catch (e) {
        let error = `viewSecret: could not access group ${groupList.groups[index].groupName} error: ${e.message}`
        processingErrors.push(error)
        continue
      }
      if (sharedRecords[0] !== undefined) {
        for (
          var recordIndex = 0;
          recordIndex < sharedRecords[0].length;
          recordIndex++
        ) {
          if (
            sharedRecords[0][recordIndex].meta.recordId == secretID &&
            sharedRecords[0][recordIndex].meta.writerId !=
            this.storage.config.clientId
          ) {
            secret = sharedRecords[0][recordIndex]
          }
        }
      }
    }
    if (secret === undefined) {
      secret = await this.storage.readRecord(secretID)
    }
    return { secret: secret, processingErrors: processingErrors }
  }
  /**
   * getSecrets
   *
   * @param {number} limit   The maximum number of secrets to list per request.
   *
   * @return {Promise<Record>}
   */
  async getSecrets(limit, nextToken) {
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId,
      [],
      nextToken,
      limit
    )
    // no records
    if (groupList.groups.length < 1) {
      return { list: [], nextToken: 0 }
    }
    let sharedRecordList = []
    let processingErrors = []
    const lengthGroup = groupList.groups.length
    for (var index = lengthGroup - 1; index >= 0; index--) {
      if (await !isValidToznySecretNamespace(groupList.groups[0].groupName)) {
        continue
      }
      let sharedRecords = []
      // try to list all the records shared with this group
      // add a processing error and skip the group if this request fails
      try {
        sharedRecords = await this.storage.listRecordsSharedWithGroup(
          groupList.groups[index].groupID
        )
      } catch (e) {
        let errMessage =
          'getSecrets: could not access group ' +
          groupList.groups[index].groupName +
          ' with error ' +
          e.message
        processingErrors.push(errMessage)
        continue
      }
      if (sharedRecords[0] !== undefined) {
        for (
          var recordIndex = 0;
          recordIndex < sharedRecords[0].length;
          recordIndex++
        ) {
          var found = false
          for (
            var recordsListed = 0;
            recordsListed < sharedRecordList.length;
            recordsListed++
          ) {
            // no repeats
            if (
              sharedRecords[0][recordIndex].meta.recordId ==
              sharedRecordList[recordsListed].meta.recordId
            ) {
              found = true
            }
          }
          if (found == false) {
            var shared = 'No'
            var username
            // Check if it is shared
            if (groupList.groups[index].memberCount > 1) {
              shared = 'Yes'
            }
            // Find out Usernames for Users that are not the writer
            if (
              sharedRecords[0][recordIndex].meta.writerId !=
              this.storage.config.clientId
            ) {
              // try to find the username for this clientID
              // if this fails, add a processing error but still add the secret to the list of secrets
              try {
                let response = await this.searchRealmIdentitiesByClientID([
                  sharedRecords[0][recordIndex].meta.writerId,
                ])
                username =
                  response.searched_identities_information[0].realm_username
              } catch (e) {
                let errMessage =
                  'getSecrets: Error while searching for identity with clientID ' +
                  sharedRecords[0][recordIndex].meta.writerId +
                  '. Error: ' +
                  e.message
                processingErrors.push(errMessage)
              }
            }
            sharedRecords[0][recordIndex].meta['username'] = username
            sharedRecords[0][recordIndex].meta['shared'] = shared
            sharedRecordList.push(sharedRecords[0][recordIndex])
          }
        }
      }
    }
    return {
      list: sharedRecordList,
      nextToken: groupList.nextToken,
      processingErrors: processingErrors,
    }
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
    let processingErrors = []
    for (var index = 0; index < groupList.groups.length; index++) {
      if (
        await !isValidToznySecretNamespace(groupList.groups[index].groupName)
      ) {
        continue
      }
      let sharedRecords
      try {
        sharedRecords = await this.storage.listRecordsSharedWithGroup(
          groupList.groups[index].groupID
        )
      } catch (e) {
        let error = `getSharedSecrets: could not access group ${groupList.groups[index].groupName} with error: ${e.message}`
        processingErrors.push(error)
        continue
      }
      if (sharedRecords.length !== 0) {
        for (
          var recordIndex = 0;
          recordIndex < sharedRecords[0].length;
          recordIndex++
        ) {
          if (
            sharedRecords[0][recordIndex].meta.writerId !=
            this.storage.config.clientId
          ) {
            var found = false
            for (
              var recordsListed = 0;
              recordsListed < sharedRecordList.length;
              recordsListed++
            ) {
              if (
                sharedRecords[0][recordIndex].meta.recordId ==
                sharedRecordList[recordsListed].meta.recordId
              ) {
                found = true
              }
            }
            // don't want records written by you
            if (found === false) {
              sharedRecordList.push(sharedRecords[0][recordIndex])
            }
          }
        }
      }
    }
    return { sharedList: sharedRecordList, processingErrors: processingErrors }
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
    return this.createSecret(newSecret, true)
  }
  /**
   * getFile
   *
   * @param {Object} record the record that contains the file info or the recordId
   *
   * @return {Object} a File object
   */
  async getFile(record) {
    return await this.storage.getFile(record)
  }
  /**
   * shareSecretWithUsername
   *
   * @param {String} secretType
   * @param {String} secretName
   * @param {String} usernameToAdd
   *
   * @return {Boolean}
   */
  async shareSecretWithUsername(secretName, secretType, usernameToAdd) {
    // Validation
    if (usernameToAdd == '') {
      throw new Error('Username Required')
    }
    // Look Up the ClientID for Username
    let clientID = await this.clientIDLookUpByUsername(usernameToAdd)
    if (clientID == null) {
      return null
    }
    // This is the user namespace
    const groupName = `tozny.secret.${this.config.realmName}.${this.storage.config.clientId}.${clientID}.${secretName}.${secretType}`
    const groupList = await this.storage.listGroups(
      this.storage.config.clientId,
      [groupName]
    )
    let currentGroup
    if (groupList.groups.length < 1) {
      // Group Does not Exists, create one
      const groupDescription = `${usernameToAdd}`
      const newGroup = await this.storage.createGroup(
        groupName,
        [],
        groupDescription
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
        share: true,
      }
      const newMember = new GroupMember(clientID, capabilitiesForNewMember)
      groupMembers.push(newMember)
      await this.storage.addGroupMembers(currentGroup.groupID, groupMembers)
    } else {
      // Group Exists, save the group object
      currentGroup = groupList.groups[0]
    }
    // Generate the Record Type to share
    const recordType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
    let sharedWithGroup = await this.storage.shareRecordWithGroup(
      currentGroup.groupID,
      recordType
    )
    return sharedWithGroup.record_type
  }
  /**
   * addSecretToNamespace takes a user defined namespace name and a secret to add to the namespace
   *
   * @param {String} namespace The user given name for the secret stored in the meta data
   * @param {String} secretType The secret type, example 'Credential'
   * @param {String} secretName The user given name for the secret stored in the meta data
   *
   * @return {Boolean}
   */
  async addSecretToNamespace(secretName, secretType, namespace) {
    // Check if the namespace exists
    let currentGroup = await getNamespace(this, namespace, true)
    // Generate the Record Type to share
    const recordType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
    let sharedWithGroup = await this.storage.shareRecordWithGroup(
      currentGroup.groupID,
      recordType
    )
    return sharedWithGroup.record_type
  }
  /**
   * addIdentityToNamespace takes a user defined namespace name and a username for an identity and gives access to the given namespace for the identity
   *
   * @param {String} namespace The user given name for the secret stored in the meta data
   * @param {String} usernameToAdd The username of the user that will have permissions added
   *
   * @return {Boolean}
   */
  async addIdentityToNamespace(usernameToAdd, namespace) {
    // Validation
    if (usernameToAdd == '') {
      throw new Error('Username Required')
    }
    // Look Up the ClientID for Username
    let clientID = await this.clientIDLookUpByUsername(usernameToAdd)
    if (clientID === null) {
      return null
    }
    // Check if namespace exists
    const currentGroup = await getNamespace(this, namespace, true)
    if (currentGroup.groupID === undefined) {
      return false
    }
    let groupMembers = []
    const capabilitiesForNewMember = {
      read: true,
      share: true,
    }
    // If the namespace exists add the identity
    const newMember = new GroupMember(clientID, capabilitiesForNewMember)
    groupMembers.push(newMember)
    await this.storage.addGroupMembers(currentGroup.groupID, groupMembers)
    return true
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
      `${this.storage.config.apiUrl
      }/v1/identity/search/realm/${this.config.realmName.toLowerCase()}/identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(SearchRealmIdentitiesRequest),
      }
    )
    return credentialedDecodeResponse(response)
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
    let clientID = await this.clientIDLookUpByUsername(userToRevokeShare)
    if (clientID === null) {
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
      // unshare record with group
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
   * removeIdentityFromNamespace takes a user defined namespace name and a username for an identity and removes access to the given namespace for the identity
   *
   * @param {String} namespace The user given name for the secret stored in the meta data
   * @param {String} userToRevokeShare The username of the user that will have permissions revoked
   *
   * @return {Promise<>}
   */
  async removeIdentityFromNamespace(userToRevokeShare, namespace) {
    // Validation
    if (userToRevokeShare == '') {
      throw new Error('Username Required')
    }
    // Look Up the ClientID for Username
    let clientID = await this.clientIDLookUpByUsername(userToRevokeShare)
    if (clientID === null) {
      return null
    }
    // Look up group for our current namespace
    const currentGroup = await getNamespace(this, namespace, false)
    if (currentGroup.groupID === undefined) {
      return true
    }
    // Remove identity from namespace
    return await this.storage.removeGroupMembers(currentGroup.groupID, [
      clientID,
    ])
  }

  /**
   * removeSecretFromNamespace takes a user defined namespace name and a secret to remove from to the namespace
   *
   * @param {String} namespace The user given name for the secret stored in the meta data
   * @param {String} secretType The secret type, example 'Credential'
   * @param {String} secretName The user given name for the secret stored in the meta data
   *
   * @return {Boolean}
   */
  async removeSecretFromNamespace(secretName, secretType, namespace) {
    // Look up group for our current namespace
    const currentGroup = await getNamespace(this, namespace, false)
    if (currentGroup.groupID === undefined) {
      return true
    }
    // unshare record with group
    let recordType = `tozny.secret.${SECRET_UUID}.${secretType}.${secretName}`
    return await this.storage.revokeRecordWithGroup(
      currentGroup.groupID,
      recordType
    )
  }

  /**
   * validGroupForSecretSharedList checks if the username from this group should be added to the list of usernames
   *
   * @param {object} group
   * @param {string} secretName
   * @param {string} secretType
   *
   * @return {Boolean}
   */
  validGroupForSecretSharedList(group, secretName, secretType) {
    if (group.memberCount < 2) {
      return false
    }
    let groupNameSplit = group.groupName.split('.')
    if (groupNameSplit.length != 7) {
      return false
    }
    if (groupNameSplit[3] !== this.storage.config.clientId) {
      return false
    }
    if (groupNameSplit[5] !== secretName || groupNameSplit[6] !== secretType) {
      return false
    }
    return true
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
    let processingErrors = []
    for (let index = 0; index < groupList.groups.length; index++) {
      if (
        await isValidToznySecretNamespace(groupList.groups[index].groupName)
      ) {
        // check if they have any records shared with them
        let recordsShared
        try {
          recordsShared = await this.storage.listRecordsSharedWithGroup(
            groupList.groups[index].groupID
          )
        } catch (e) {
          let error = `getSecretSharedList: could not access group ${groupList.groups[index].groupName} with error: ${e.message}`
          processingErrors.push(error)
          continue
        }
        if (recordsShared.length > 0) {
          // Check to make sure they are the writer
          // and secret type and secret name are the same
          if (
            this.validGroupForSecretSharedList(
              groupList.groups[index],
              secretName,
              secretType
            )
          ) {
            groupSharedList.push({
              username: groupList.groups[index].description,
              groupMembers: groupList.groups[index].memberCount,
            }) // add their username to the list which is stored in the group description
          }
        }
      }
    }
    return { list: groupSharedList, processingErrors: processingErrors }
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
      `${this.storage.config.apiUrl
      }/v1/identity/search/realm/${this.config.realmName.toLowerCase()}/identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(SearchRealmIdentitiesRequest),
      }
    )
    return await credentialedDecodeResponse(response)
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
    return await credentialedDecodeResponse(response)
  }
  /**
   * getRealmToken fetches private information registration token of a realm. Requesting user should have realm-admin role.
   *
   * @return {Object} contains registration token.
   */
  async getRealmToken() {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/realm/info/${this.config.realmName}/token`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    return await credentialedDecodeResponse(response)
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
  /**
   * searchRealmIdentitiesByClientID
   *
   * @param {Array} clientIdsToSearch
   *
   * @return {Object} An Object containing An array of Information for every
   * Username which was passed in. The information passed back contains, ClientID, UserId, and Usernames
   */
  async searchRealmIdentitiesByClientID(clientIdsToSearch = []) {
    const SearchRealmIdentitiesRequest = {
      identity_client_ids: clientIdsToSearch,
    }
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl
      }/v1/identity/search/realm/${this.config.realmName.toLowerCase()}/identity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(SearchRealmIdentitiesRequest),
      }
    )
    return await credentialedDecodeResponse(response)
  }
  /**
   * onlyVersionOfSecretInGroup compares the recordType against the records in the list & returns
   * true if secretId is the only version of that secret
   *
   * @param {array} records  a list of records
   * @param {string} recordType  the record type for compare with each record
   * @param {string} secretId  the ID of the secret that is going to be deleted
   * @return {boolean}
   */
  async onlyVersionOfSecretInGroup(records, recordType, secretId) {
    return records.every((record) => {
      if (
        record.meta.writerId === this.storage.config.clientId &&
        record.meta.type === recordType &&
        record.meta.recordId !== secretId
      ) {
        return false
      }
      return true
    })
  }
  /**
   * revokeShareBeforeDeleteSecret
   * @param {object} group
   * @param {String} recordType
   * @param {String} secretId
   *
   * @returns {String}
   */
  async revokeShareBeforeDeleteSecret(group, recordType, secretId) {
    // Group does not exist
    if (group.groupID === undefined) {
      return null
    }
    let processingError
    let sharedRecords
    try {
      sharedRecords = await this.storage.listRecordsSharedWithGroup(
        group.groupID
      )
    } catch (e) {
      processingError = `revokeShareBeforeDeleteSecret: could not access group ${group.groupName} with error: ${e.message}`
      return processingError
    }
    if (sharedRecords.length === 0) {
      return null
    }
    // delete the group when only 1 secret version is shared with the group
    if (sharedRecords[0].length < 2) {
      try {
        await this.storage.revokeRecordWithGroup(group.groupID, recordType)
      } catch (e) {
        processingError = `revokeShareBeforeDeleteSecret: unable to unshare ${recordType} from group ${group.groupName}: ${e.message}`
        return processingError
      }
      try {
        await this.storage.deleteGroup(group.groupID)
      } catch (e) {
        processingError = `revokeShareBeforeDeleteSecret: unable to delete group ${group.groupName}: ${e.message}`
        return processingError
      }
    } else if (
      await this.onlyVersionOfSecretInGroup(
        sharedRecords[0],
        recordType,
        secretId
      )
    ) {
      // if this is the only version of the secret in the group, revoke the share
      try {
        await this.storage.revokeRecordWithGroup(group.groupID, recordType)
      } catch (e) {
        processingError = `revokeShareBeforeDeleteSecret: unable to delete group ${group.groupName}: ${e.message}`
        return processingError
      }
    }
    return null
  }
  /**
   * removeSingleSecret
   * @param {Object} secret
   * @return {Object} returns true and any processing errors if the secret was successfully removed
   */
  async deleteSecretVersion(secret) {
    let listedGroups = await this.storage.listGroups(
      this.storage.config.clientId
    )
    let processingErrors = []
    // unshare the secret from the groups it's shared with
    for (let group of listedGroups.groups) {
      let error = await this.revokeShareBeforeDeleteSecret(
        group,
        secret.meta.type,
        secret.meta.recordId
      )
      if (error !== null) {
        processingErrors.push(error)
      }
    }
    // delete the secret
    let deleteSuccess = await this.storage.deleteRecord(
      secret.meta.recordId,
      secret.meta.version
    )
    return { success: deleteSuccess, processingErrors: processingErrors }
  }
  /**
   * clientIDLookUpByUsername returns the clientID for the username passed in
   * @param {Object} username
   * @return {Object} returns the clientID if it exists
   */
  async clientIDLookUpByUsername(username) {
    let clientResponse = await this.searchRealmIdentitiesByUsername([username])
    let usernameLowerCase = username.toLowerCase()
    let clientID
    if (clientResponse.searched_identities_information === null) {
      return clientID
    }
    for (
      let index = 0;
      index < clientResponse.searched_identities_information.length;
      index++
    ) {
      if (
        clientResponse.searched_identities_information[index].realm_username ===
        usernameLowerCase
      ) {
        clientID =
          clientResponse.searched_identities_information[index].client_id
      }
    }
    return clientID
  }

  /**
   * createAccessRequest creates an access request
   *
   * @param {Object} accessRequest
   *
   * @param {string} realmName - name of realm
   * @param {Object} groups - object containing `id` of group
   * @param {string} reason - user's explanation for why they are requesting access
   * @param {number} accessDurationSeconds - desired number of seconds approval should last
   * @return {AccessRequest} The created access request
   */
  async createAccessRequest(realmName, groups, reason, accessDurationSeconds) {
    const requestorId = this.storage.config.clientId
    const accessRequest = new AccessRequest(
      reason,
      requestorId,
      realmName,
      groups,
      accessDurationSeconds
    )
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/open`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: accessRequest.stringify(),
      }
    )
    await checkStatus(response)
    return AccessRequest.decode(await response.json())
  }

  /**
   * searchAccessRequests allows for searching for all access requests associated or authorizable
   * by the searcher, allowing for filtering based off group id to access or requestor id
   *
   * @param {Object} filters Information about filters by which to search access requests.
   * @param {string[]} [filters.groupIds] List of ids of which group the access request is for
   * @param {string[]} [filters.requestorIds] List of ids of who created the access request
   * @param {number} [nextToken] Pagination token of the search results
   * @param {number} [limit] Maximum number of responses per search page. Defaults to 1000.
   *
   * @return {Object} Access requests matching the search filter
   */
  async searchAccessRequests(filters = {}, nextToken = 0, limit = 1000) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_request_search_filters: {
            access_controlled_group_ids: filters.groupIds,
            requestor_ids: filters.requestorIds,
          },
          next_token: nextToken,
          limit,
        }),
      }
    )
    await checkStatus(response)
    return AccessRequestSearchResponse.decode(await response.json())
  }


  
  async getAccessRequestHistory(filters = {}, nextToken = 0, limit = 1000) {
      let response = await this.storage.authenticator.tsv1Fetch(
        `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/history`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_request_search_filters: {
              access_controlled_group_ids: filters.groupIds,
              requestor_ids: filters.requestorIds,
            },
            next_token: nextToken,
            limit,
          }),
        }
      )
      await checkStatus(response)
      return AccessRequestSearchResponse.decode(await response.json())
  }

    
  async getOpenAccessRequest(filters, nextToken = 0, limit = 1000) {
      let response = await this.storage.authenticator.tsv1Fetch(
        `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/items/open`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_request_search_filters: {
              access_controlled_group_ids: filters.groupIds,
              requestor_ids: filters.requestorIds,
            },
            next_token: nextToken,
            limit,
          }),
        }
      )
      await checkStatus(response)
      return AccessRequestSearchResponse.decode(await response.json())
  }
    
  async getAccessRequestAction(filters = {}, nextToken = 0, limit = 1000) {
      let response = await this.storage.authenticator.tsv1Fetch(
        `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/items/pending`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_request_search_filters: {
              access_controlled_group_ids: filters.groupIds,
              requestor_ids: filters.requestorIds,
            },
            next_token: nextToken,
            limit,
          }),
        }
      )
      await checkStatus(response)
      return AccessRequestSearchResponse.decode(await response.json())
  }


  /**
   * describeAccessRequest fetches the current state of a single access request
   *
   * @param {Object} accessRequestID The id of the access request to describe
   *
   * @return {Object} An access request
   */
  async describeAccessRequest(accessRequestID) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/resource/${accessRequestID}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    return AccessRequest.decode(await response.json())
  }

  /**
   * deleteAccessRequest deletes a single access request
   *
   * @param {Object} accessRequestID The id of the access request to delete
   *
   * @return {Object} No content if deleted / non existant
   */
  async deleteAccessRequest(accessRequestID) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/resource/${accessRequestID}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    return { success: true }
  }

  /**
   * approveAccessRequests approves one or more access requests
   *
   * @param {string} realmName - name of realm
   * @param {Array} approvals an array of objects containing info about the approvals
   * @param {number} approvals[].accessRequestId id of request to approve
   * @param {string} [approvals[].comment] user-entered comment on the approval
   *
   * @return {Array} The updated access requests
   */
  async approveAccessRequests(realmName, approvals) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realm_name: realmName,
          approvals: approvals.map(({ accessRequestId, comment }) => ({
            access_request_id: accessRequestId,
            comment,
          })),
        }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data.access_requests.map(AccessRequest.decode)
  }

  async approveAccessRequestsWithDuration(realmName, approvals, timeToAccess) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/admin/access_requests/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realm_name: realmName,
          approvals: approvals.map(({ accessRequestId, comment }) => ({
            access_request_id: accessRequestId,
            comment,
          })),
          ttl: timeToAccess,
        }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data.access_requests.map(AccessRequest.decode)
  }
  /**
   * denyAccessRequests denies one or more access requests
   *
   * @param {string} realmName - name of realm
   * @param {Array} denials an array of objects containing info about the denials
   * @param {number} denials[].accessRequestId id of request to deny
   * @param {string} [denials[].comment] user-entered comment on the denial
   *
   * @return {Array} The updated access requests
   */
  async denyAccessRequests(realmName, denials) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/access_requests/deny`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realm_name: realmName,
          denials: denials.map(({ accessRequestId, comment }) => ({
            access_request_id: accessRequestId,
            comment,
          })),
        }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data.access_requests.map(AccessRequest.decode)
  }

  /**
   * availableAccessRequestGroups returns Realm Groups with MPC Enabled
   *
   * @param {string} realmName - name of realm
   *
   * @return {Array} list of groups available for access requesting
   */
  async availableAccessRequestGroups(realmName) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ realm_name: realmName }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data.groups.map(({ group_id, group_name, access_policies }) => ({
      id: group_id,
      groupName: group_name,
      accessPolicies: (access_policies || []).map(
        ({ id, max_access_duration_seconds, required_approvals }) => ({
          id,
          requiredApprovals: required_approvals,
          maxAccessDurationSeconds: max_access_duration_seconds,
        })
      ),
    }))
  }

  /**
   * Initiates the challenge for registering a WebAuthn MFA device for this identity.
   * @returns {Promise<InitiateWebAuthnChallengeData>}
   */
  // Note: extending for use w/ different tozny id? make the prop optional with a fallback to this client.
  async initiateWebAuthnChallenge() {
    const sessionToken = await this.agentToken()
    const toznyId = this.storage.config.clientId
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/mfa/webauthn-challenge`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tozny-Session': sessionToken,
        },
        body: JSON.stringify({ tozny_id: toznyId }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return InitiateWebAuthnChallengeData.decode(data)
  }

  /**
   * `registerWebAuthnDevice` finalizes the registration of a WebAuthn MFA device for this identity.
   * @param {PublicKeyCredential} publicKeyCredential this is the response from a call to `navigator.credentials.create`
   * @param {string} deviceName a name for this device.
   * @param {string} tabId the id from the initiation challenge call. used to track session across api calls.
   * @returns {IdentityMFADevices}
   */
  // Note: Supporting cross identity registration? Add an optional tozny id arg w/ fallback to this client.
  async registerWebAuthnDevice(publicKeyCredential, deviceName, tabId) {
    const sessionToken = await this.agentToken()
    const toznyId = this.storage.config.clientId
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/mfa`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tozny-Session': sessionToken,
        },
        body: JSON.stringify({
          tozny_id: toznyId,
          tab_id: tabId,
          mfa_devices: {
            webauthn:
              InitiateWebAuthnChallengeData.convertPublicKeyCredentialToRegistrationData(
                publicKeyCredential,
                deviceName
              ),
          },
        }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return IdentityMFADevices.decode(data)
  }

  /**
   * `searchIdentityMFADeviceCredentials` finds details of MFA devices for the identities matching the `searchParams`.
   * If no `searchParams` are provided, it will query for the current identity's MFA devices.
   * Only realm admins have permission to query the details of other identities' MFA devices.
   * @param {string} realmName Name of realm
   * @param {object} [searchParams] Data containing info on which users to find MFA devices for. defaults to this client's identity.
   *                                All search parameters are taken as to be an OR query.
   * @param {string[]} [searchParams.toznyIds] List of Tozny client ids to search over
   * @param {string[]} [searchParams.userIds] List of user ids to search over
   * @returns {IdentityMFADevices}
   */
  async searchIdentityMFADeviceCredentials(realmName, searchParams) {
    const toznyIds = (searchParams && searchParams.toznyIds) || []
    const userIds = (searchParams && searchParams.userIds) || []
    const searchIsEmpty =
      !searchParams || (toznyIds.length === 0 && userIds.length === 0)
    if (searchIsEmpty) {
      // fallback to this client's identity if search is empty.
      toznyIds.push(this.storage.config.clientId)
    }
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/mfa/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realm_name: realmName,
          tozny_ids: toznyIds,
          user_ids: userIds,
        }),
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data.identities_credentials.map(IdentityMFADevices.decode)
  }

  /**
   * `removeMFADevice` removes an MFA device that is registered to an Identity
   * @param {string} mfaID the ID of the MFA device
   * @returns {boolean} true if removing the MFA device was successful
   */
  async removeMFADevice(mfaID) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/mfa/${mfaID}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    return true
  }

  /**
   * `updateIdentityAttributes` updates identities attributes
   * @param {string} toznyId the ID of the storage client
   * @param {Record<string, string[]>} attributes the attributes being updated for the user
   * @returns {boolean} true if removing the MFA device was successful
   */
  async updateIdentityAttributes(toznyId, attributes) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${toznyId}/attributes`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attributes: attributes,
        }),
      }
    )
    await checkStatus(response)
    return true
  }

  /**
    * Set up the pagination result for listing identities
    *
    * Each page is returned when the next() function is invoked on the
    * ListIdentitiesResult object.

    *
    * @example
    * ```js
    * const realmName = 'westeros'
    * // list identities in westeros 10 at a time
    * const idList = accountClient.listIdentities(realmName, 10)
    * // Must call idList.next() to receive results
    * while (!idList.done) {
    *    const identities = await idList.next()
    *    for (let identity of identities) {
    *        console.log(identity.username)
    *    }
    * }
    * ```
    * Note: If the value of max is higher than the maximum allowed by
    * the server, idList.next() will only return up to the number of
    * identities allowed by the server
    *
    * @param {string} realmName            Name of realm.
    * @param {Array} usernames             The list of usernames to filter by.
    * @param {Array} emails                The list of emails to filter by.
    * @param {Array} clientIds              The list of clientIDs to filter by.
    * @param {number} max                  The maximum number of identities per page. Up to the max allowed by the server.
    * @param {number} next                 The next token, used for paging. Default is 0.
    * @return {ListIdentitiesResult}       A object usable for making paginated queries.
    */
  async listIdentities(realmName, usernames, emails, clientIds, max, next) {
    return new ListIdentitiesResult(this, realmName, usernames, emails, clientIds, max, next)
  }
  /**
   * Internal method which queries to get a specific page of basic identities
   *
   * @return {Promise<Array<BasicIdentity>>} A list of basic identity info.
   */
  async _listIdentities(realmName, usernames, emails, clientIds, max, next) {
    const response = await this.listRealmIdentities(
      this,
      realmName,
      usernames,
      emails,
      clientIds,
      max,
      next
    )
    // Make sure that identities has come back as an array
    if (!Array.isArray(response.identities)) {
      response.identities = []
    }
    // Do this async to speed it up just slightly.
    response.identities = await Promise.all(
      response.identities.map(async (i) => IdentityDetails.decode(i))
    )
    return response
  }

  async _searchIdentites(realmName, searchParam, max, next) {
    const response = await this.searchRealmIdentities(
      this,
      realmName,
      searchParam,
      max,
      next
    )
    // Make sure that identities has come back as an array
    if (!Array.isArray(response.identities)) {
      response.identities = []
    }
    // Do this async to speed it up just slightly.
    response.identities = await Promise.all(
      response.identities.map(async (i) => IdentityDetails.decode(i))
    )
    return response
  }

  async searchRealmIdentities(queenClient, realmName, searchParam, max, first) {
    const url = [`${this.storage.config.apiUrl}/v1/identity/search/realm/${realmName}/identity`]
    const query = { first, max }
    const queryString = Object.keys(query)
      .filter((k) => !!query[k])
      .map((k) => `${k}=${encodeURIComponent(query[k])}`)
      .join('&')
    
    if (queryString) {
      url.push(queryString)
    }

    let fullUrl = url.join('?')

    const urlData = {
      searchParam: searchParam,
    }
    let current = urlEncodeData(urlData)
    if (fullUrl === '') {
      fullUrl = current
    } else {
      fullUrl += '&' + current
    }

    const response = await this.storage.authenticator.tsv1Fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    await checkStatus(response)
    const data = await response.json()
    return data
  }

  /**
     * listIdentities queries the API to fetch a list of basic identity information
     * @param  {object} queenClient The queen client for the account.
     * @param  {string} realmName   The name of the realm to register the broker identity with.
     * @param {Array} usernames             The list of usernames to filter by.
     * @param {Array} emails                The list of emails to filter by.
     * @param {Array} clientIds              The list of clientIDs to filter by.
     * @param  {number} max         The maximum number of identities to fetch at once, min 1, max 1000. Default 100.
     * @param  {number} first       The first (0-indexed) identity to fetch after offset. Default 0.
     * @return {Promise<Array<object>>} The list of basic identity information.
     */
  async listRealmIdentities(queenClient, realmName, usernames, emails, clientIds, max, first) {
    const url = [`${this.storage.config.apiUrl}/v1/identity/realm/info/${realmName}/identity/list`]
    const query = { first, max }
    const queryString = Object.keys(query)
      .filter((k) => !!query[k])
      .map((k) => `${k}=${encodeURIComponent(query[k])}`)
      .join('&')
    if (queryString) {
      url.push(queryString)
    }
    let fullUrl = url.join('?')

    usernames.forEach((name) => {
      const urlData = {
        username: name,
      }
      let current = urlEncodeData(urlData)
      if (fullUrl === '') {
        fullUrl = current
      } else {
        fullUrl += '&' + current
      }
    })
    emails.forEach((name) => {
      const urlData = {
        email: name,
      }
      let current = urlEncodeData(urlData)
      if (fullUrl === '') {
        fullUrl = current
      } else {
        fullUrl += '&' + current
      }
    })
    clientIds.forEach((name) => {
      const urlData = {
        client_id: name,
      }
      let current = urlEncodeData(urlData)
      if (fullUrl === '') {
        fullUrl = current
      } else {
        fullUrl += '&' + current
      }
    })

    const response = await this.storage.authenticator.tsv1Fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    await checkStatus(response)
    const data = await response.json()
    return data
  }

  /**
   * `updateRealmSettings` updates realm settings.
   * @param {object} data realm settings.
   * @returns {boolean} true if settings updated.
   */
  async updateRealmSettings(data) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/realm/info/${this.config.realmName}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    )
    await checkStatus(response)
    return true
  }

  /**
   * `resetIdentityMFA` updates realm settings.
   * @param {string} username identity username to reset MFA.
   * @returns {boolean} true if MFA is removed.
   */
  async resetIdentityMFA(userName) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/device/${userName}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    return true
  }

  /**
   * `getIdentityDetails` updates realm settings.
   * @param {string} username tozny id of the user.
   * @returns {object} user details object.
  */
  async getIdentityDetails(username) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${username}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data
  }

  /**
   * `addRolesToIdentity` updates realm settings.
   * @param {string} identityId tozny id of the user.
   * @param {Array} roles array of string, role names.
   * @returns {boolean} true if roles assigned.
  */
  async addRolesToIdentity(identityId, roles) {
    const payload = {
      roles,
    }
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${identityId}/role`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
    checkStatus(response)
    return true
  }

  /**
   * `removeRolesFromIdentity` updates realm settings.
   * @param {string} identityId tozny id of the user.
   * @param {Array} roles array of string, role names.
   * @returns {boolean} true if roles removed.
  */
  async removeRolesFromIdentity(identityId, roles) {
    const payload = {
      roles,
    }
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${identityId}/role/remove`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
    checkStatus(response)
    return true
  }

  /**
   * `updateIdentityDetails` updates realm settings.
   * @param {string} identityId tozny id of the user.
   * @param {object} details object contains details.
   * @returns {boolean} true if details updated.
  */
  async updateIdentityDetails(identityId, data) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${identityId}/details`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    )
    await checkStatus(response)
    return true
  }

  async createRealmGroup(realmName, groupName) {

    const payload = {
      name: groupName
    }

    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/realm/info/${realmName}/group`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    )

    return validateResponseAsJSON(response)
  }

  async updateRealmGroup(realmName, tozId, attributes) {

    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/realm/info/${realmName}/group/${tozId}`,
      {
        method: 'PUT',
        body: JSON.stringify(attributes)
      }
    )


    return validateResponseAsJSON(response)
  }


  async deleteRealmGroup(realmName, tozGroupId) {
    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/group/${tozGroupId}`,
      {
        method: 'DELETE'
      }
    )
    return response;
  }
  async joinRealmGroup(payload) {


    const realmName = payload.realmName;
    const memberId = payload.newMember;
    const groupId = payload.tozId
    const group = {
      groups: [groupId],
    }

    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/realm/info/${realmName}/identity/${memberId}/groups`,
      {
        method: 'PATCH',
        body: JSON.stringify(group)
      }

    )
    return response;

  }
  async removeRealmGroupMember(payload) {


    const realmName = payload.realmName;
    const memberId = payload.newMember;
    const groupId = payload.tozId
    const group = {
      groups: [groupId],
    }

    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/realm/info/${realmName}/identity/${memberId}/groups`,
      {
        method: 'DELETE',
        body: JSON.stringify(group)
      }

    )
    return response;

  }

  async getUserRealmGroupMembership(realmName, memberId) {

    let response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/identity/${memberId}/groups`,
      {
        method: 'GET',
      }

    )
    return validateResponseAsJSON(response);

  }

  async listAllRealmRoles(realmName) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role`,
      {
        method: 'GET'
      }
    )
    return await validateResponseAsJSON(response);
  }

  async listAllRealmGroup(realmName) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/group`,
      {
        method: 'GET'
      }
    )
    return await validateResponseAsJSON(response);
  }

  async createRealmRole(realmName, attributes) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role`,
      {
        method: 'POST',
        body: JSON.stringify(attributes),
      }
    )
    return validateResponseAsJSON(response)
  }

  async getRoleUsersMembership(realmName, roleId) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role/${roleId}/users`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    return await validateResponseAsJSON(response);

  }

  async deleteRealmRole(realmName, roleId) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role/${roleId}`,
      {
        method: 'DELETE',

      }
    )

    return response;

  }

  async updateRealmRole(realmName, payload) {

    const roleId = payload.roleId;

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role/${roleId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),

      }
    )

    return await validateResponseAsJSON(response);

  }

  async updateAccessPolicyForGroup(payload) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/pam/policies`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    return await validateResponseAsJSON(response)
  }

  async listAccessPolicyForGroup(realmName, groupId) {

    const query = new URLSearchParams()

    query.set('realm_name', realmName)

    query.append('group_ids', groupId);


    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/pam/policies?${query.toString()}`,
      {
        method: 'GET',
      }
    )
    return await validateResponseAsJSON(response)

  }

  async getRealmRoleDetails(realmName, roleId) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/role/${roleId}`,
      {
        method: 'GET',

      }
    )

    return await validateResponseAsJSON(response);

  }

  async addGroupRoleMappings(realmName, groupId, groupRoleMapping) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/group/${groupId}/role_mapping`,
      {
        method: 'POST',
        body: JSON.stringify(groupRoleMapping),
      }
    )
    checkStatus(response)
    return true
  }

  async getGroupRoleMappings(realmName, groupId) {

    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/group/${groupId}/role_mapping`,
      {
        method: 'GET',

      }
    )

    return await validateResponseAsJSON(response);
  }


  async removeGroupRoleMappings(realmName, groupId, groupRoleMapping) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/identity/admin/realm/${realmName}/group/${groupId}/role_mapping`,
      {
        method: 'DELETE',
        body: JSON.stringify(groupRoleMapping),
      }
    )
    checkStatus(response)
    return true
  }

  async updateRealmAttributes(attributes) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/attributes`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attributes),
      }
    )
    return response;
  }

  async getCompanyName() {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/realm/info/${this.config.realmName}/companyname`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    await checkStatus(response)
    const data = await response.json()
    return data;
  }


  /**
  * getUsersWithDuration gets list of users with expires_At
  *
  * @param {groupID} groupID -get list of users under the group based on group ID
  *
  * @return {Object} list of users with expires_At
  */
  async getUsersWithDuration(groupID, realmName) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/pam/realm/${realmName}/group/${groupID}`,

      {
        method: 'GET'

      }
    )
    await checkStatus(response)
    let res = await response.json()
    return res;
  }

  async deleteIdentity(identityId, data) {
    const response = await this.storage.authenticator.tsv1Fetch(
      `${this.storage.config.apiUrl}/v1/identity/admin/realm/${this.config.realmName}/identity/${identityId}/delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    )
    await checkStatus(response)
    return true;
  }

}

module.exports = Client
