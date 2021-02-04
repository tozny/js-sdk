const { credentialedDecodeResponse, urlEncodeData } = require('../utils')
const fetch = require('isomorphic-fetch')
const PartialClient = require('./partialClient')
const { GroupMember } = require('../../types')

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

  async createSecret(secret) {
    const trimmedName = secret.secretName.trim()
    const trimmedValue = secret.secretValue.trim()
    if (trimmedName === '') {
      throw { message: 'Name cannot be empty' }
    }
    const re = new RegExp('^[a-zA-Z0-9-_]{1,30}$')
    if (!re.test(trimmedName)) {
      throw {
        message: 'Secret name must contain alphanumeric characters, -, or _',
      }
    }
    if (trimmedValue === '') {
      throw { message: 'Value cannot be empty' }
    }
    const groupName = [`tozny.secret.${this.storage.config.clientId}`]
    // check if the clients secret group already exists
    let groups = await this.storage.listGroups(
      this.storage.config.clientId,
      groupName
    )
    let group
    let groupMembers = []
    if (groups.groups.length < 1) {
      // create the group if it doesn't exist
      let newGroup = await this.storage.createGroup(groupName[0])
      group = newGroup.group
      let capabilities = {
        read: true,
        share: true,
      }
      var member = new GroupMember(this.storage.config.clientId, capabilities)
      groupMembers.push(member)
      // add read and share capabilities for the client
      await this.storage.addGroupMembers(group.groupID, groupMembers)
    } else {
      group = groups.groups[0]
    }
    // create the record
    const recordType = `tozny.secret.ae41d9cc-cd5c-4a90-8efe-0046784e195c.${secret.secretType}.${secret.secretName}`
    const data = {
      secretValue: secret.secretValue,
    }
    const meta = {
      secretType: secret.secretType,
      secretName: secret.secretName,
      description: secret.description,
    }
    let secretMade = await this.storage.writeRecord(recordType, data, meta)
    // share record type with the group
    await this.storage.shareRecordWithGroup(group.groupID, recordType)
    return secretMade
  }
}

module.exports = Client
