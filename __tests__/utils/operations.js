const { v4: uuidv4 } = require('uuid')
const { testEmail } = require('.')
const { runInEnvironment, apiUrl, clientRegistrationToken } = global
const Tozny = require('../../node')

// Utilities to help with running things in the configured environment
module.exports = {
  async testExtension(name, options, func, ...args) {
    const receivedValue = await runInEnvironment(
      function (name, options, func, args) {
        const parsedOptions = JSON.parse(options)
        const parsedArgs = JSON.parse(args)
        class Test {
          constructor(tozny, options) {
            this.tozny = tozny
            this.options = options
          }

          run() {
            var context = this
            var args = arguments
            return new Promise(function (resolve) {
              var executable = new Function(
                'return (' + func + ').apply(this, arguments);'
              )
              resolve(executable.apply(context, args))
            })
          }
        }
        Test.extensionName = name
        Tozny.extend(Test, parsedOptions)
        return Tozny[name].run
          .apply(Tozny[name], parsedArgs)
          .then(JSON.stringify)
      },
      name,
      JSON.stringify(options),
      func.toString(),
      JSON.stringify(args)
    )
    return JSON.parse(receivedValue)
  },
  async registerClient() {
    const name = `integration-client-${uuidv4()}`
    const configJSON = await runInEnvironment(
      function (clientRegistrationToken, apiUrl, name) {
        return Promise.all([
          Tozny.crypto.generateKeypair(),
          Tozny.crypto.generateSigningKeypair(),
        ]).then(function (keys) {
          return Tozny.storage
            .register(
              clientRegistrationToken,
              name,
              keys[0],
              keys[1],
              true,
              apiUrl
            )
            .then(function (info) {
              return new Tozny.storage.Config(
                info.clientId,
                info.apiKeyId,
                info.apiSecret,
                keys[0].publicKey,
                keys[0].privateKey,
                keys[1].publicKey,
                keys[1].privateKey,
                apiUrl
              )
            })
            .then(JSON.stringify)
        })
      },
      clientRegistrationToken,
      apiUrl,
      name
    )
    return JSON.parse(configJSON)
  },
  async writeRecord(config, type, data, meta) {
    const recordJSON = await runInEnvironment(
      function (configJSON, type, dataJSON, metaJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var data = JSON.parse(dataJSON)
        var meta = JSON.parse(metaJSON)
        return client.writeRecord(type, data, meta).then(function (record) {
          return record.stringify()
        })
      },
      JSON.stringify(config),
      type,
      JSON.stringify(data),
      JSON.stringify(meta)
    )
    return Tozny.types.Record.decode(JSON.parse(recordJSON))
  },
  async readRecord(config, recordId) {
    const recordJSON = await runInEnvironment(
      function (configJSON, recordId) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.readRecord(recordId).then(function (record) {
          return record.stringify()
        })
      },
      JSON.stringify(config),
      recordId
    )
    return Tozny.types.Record.decode(JSON.parse(recordJSON))
  },
  async updateRecord(config, record) {
    const recordJSON = await runInEnvironment(
      function (configJSON, recordJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var recordObj = JSON.parse(recordJSON)
        return Tozny.types.Record.decode(recordObj)
          .then(function (record) {
            return client.updateRecord(record)
          })
          .then(function (record) {
            return record.stringify()
          })
      },
      JSON.stringify(config),
      record.stringify()
    )
    return Tozny.types.Record.decode(JSON.parse(recordJSON))
  },
  async deleteRecord(config, recordId, version) {
    const result = await runInEnvironment(
      function (configJSON, recordId, version) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.deleteRecord(recordId, version).then(JSON.stringify)
      },
      JSON.stringify(config),
      recordId,
      version
    )
    return JSON.parse(result)
  },
  async deleteBulkRecord(config, recordIds) {
    const result = await runInEnvironment(
      function (configJSON, recordIds) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.deleteRecordsBulk(recordIds).then(JSON.stringify)
      },
      JSON.stringify(config),
      recordIds
    )
    return JSON.parse(result)
  },
  async writeNote(
    config,
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    options = {}
  ) {
    const noteJSON = await runInEnvironment(
      function (
        configJSON,
        dataJSON,
        recipientEncryptionKey,
        recipientSigningKey,
        optionsJSON
      ) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var data = JSON.parse(dataJSON)
        var options = JSON.parse(optionsJSON)
        return client
          .writeNote(data, recipientEncryptionKey, recipientSigningKey, options)
          .then(function (note) {
            return note.stringify()
          })
      },
      JSON.stringify(config),
      JSON.stringify(data),
      recipientEncryptionKey,
      recipientSigningKey,
      JSON.stringify(options)
    )
    return Tozny.types.Note.decode(JSON.parse(noteJSON))
  },
  async writeAnonymousNote(
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    encryptionKeyPair,
    signingKeyPair,
    options = {}
  ) {
    const noteJSON = await runInEnvironment(
      function (
        dataJSON,
        recipientEncryptionKey,
        recipientSigningKey,
        encryptionKeyPairJSON,
        signingKeyPairJSON,
        optionsJSON,
        apiUrl
      ) {
        var data = JSON.parse(dataJSON)
        var encryptionKeyPair = JSON.parse(encryptionKeyPairJSON)
        var signingKeyPair = JSON.parse(signingKeyPairJSON)
        var options = JSON.parse(optionsJSON)
        return Tozny.storage
          .writeNote(
            data,
            recipientEncryptionKey,
            recipientSigningKey,
            encryptionKeyPair,
            signingKeyPair,
            options,
            apiUrl
          )
          .then(function (note) {
            return note.stringify()
          })
      },
      JSON.stringify(data),
      recipientEncryptionKey,
      recipientSigningKey,
      JSON.stringify(encryptionKeyPair),
      JSON.stringify(signingKeyPair),
      JSON.stringify(options),
      apiUrl
    )
    return Tozny.types.Note.decode(JSON.parse(noteJSON))
  },
  async replaceNamedNote(
    config,
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    options
  ) {
    const noteJSON = await runInEnvironment(
      function (
        configJSON,
        dataJSON,
        recipientEncryptionKey,
        recipientSigningKey,
        optionsJSON
      ) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var data = JSON.parse(dataJSON)
        var options = JSON.parse(optionsJSON)
        return client
          .replaceNoteByName(
            data,
            recipientEncryptionKey,
            recipientSigningKey,
            options
          )
          .then(function (note) {
            return note.stringify()
          })
      },
      JSON.stringify(config),
      JSON.stringify(data),
      recipientEncryptionKey,
      recipientSigningKey,
      JSON.stringify(options)
    )
    return Tozny.types.Note.decode(JSON.parse(noteJSON))
  },
  async readNote(config, id, byName = false, authParams = {}) {
    const noteJSON = await runInEnvironment(
      function (configJSON, id, byNameJSON, authParamsJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var byName = JSON.parse(byNameJSON)
        var operation = byName ? 'readNoteByName' : 'readNote'
        var authParams = JSON.parse(authParamsJSON)
        return client[operation](id, authParams).then(function (note) {
          return note.stringify()
        })
      },
      JSON.stringify(config),
      id,
      JSON.stringify(byName),
      JSON.stringify(authParams)
    )
    return Tozny.types.Note.decode(JSON.parse(noteJSON))
  },
  async readAnonymousNote(
    id,
    encryptionKeyPair,
    signingKeyPair,
    byName = false
  ) {
    const noteJSON = await runInEnvironment(
      function (
        id,
        encryptionKeyPairJSON,
        signingKeyPairJSON,
        byNameJSON,
        apiUrl
      ) {
        var byName = JSON.parse(byNameJSON)
        var operation = byName ? 'readNoteByName' : 'readNote'
        var encryptionKeyPair = JSON.parse(encryptionKeyPairJSON)
        var signingKeyPair = JSON.parse(signingKeyPairJSON)
        return Tozny.storage[operation](
          id,
          encryptionKeyPair,
          signingKeyPair,
          {},
          {},
          apiUrl
        ).then(function (note) {
          return note.stringify()
        })
      },
      id,
      JSON.stringify(encryptionKeyPair),
      JSON.stringify(signingKeyPair),
      JSON.stringify(byName),
      apiUrl
    )
    return Tozny.types.Note.decode(JSON.parse(noteJSON))
  },
  async deleteNote(config, noteId) {
    const result = await runInEnvironment(
      function (configJSON, noteId) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.deleteNote(noteId).then(JSON.stringify)
      },
      JSON.stringify(config),
      noteId
    )
    return JSON.parse(result)
  },
  async deleteAnonymousNote(noteId, signingKeyPair) {
    const result = await runInEnvironment(
      function (noteId, signingKeyPairJSON, apiUrl) {
        const signingKeyPair = JSON.parse(signingKeyPairJSON)
        return Tozny.storage.deleteNote(noteId, signingKeyPair, apiUrl)
      },
      noteId,
      JSON.stringify(signingKeyPair),
      apiUrl
    )
    return JSON.parse(result)
  },
  async authOperation(config, method, type, targetId) {
    const result = await runInEnvironment(
      function (configJSON, method, type, targetId) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client[method](type, targetId).then(JSON.stringify)
      },
      JSON.stringify(config),
      method,
      type,
      targetId
    )
    return JSON.parse(result)
  },
  async authOnBehalfOperation(config, method, type, ownerId, targetId) {
    const result = await runInEnvironment(
      function (configJSON, method, type, ownerId, targetId) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client[method](ownerId, type, targetId).then(JSON.stringify)
      },
      JSON.stringify(config),
      method,
      type,
      ownerId,
      targetId
    )
    return JSON.parse(result)
  },
  async search(config, searchRequest) {
    const recordsJSON = await runInEnvironment(
      function (configJSON, searchJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        const serial = JSON.parse(searchJSON)
        var request = new Tozny.types.Search(
          serial.include_data,
          serial.include_all_writers,
          serial.limit,
          serial.next_token
        )
        var i
        function arrangeTerms(terms) {
          var newTerms = {}
          var termKey
          var map = {
            writer_ids: 'writers',
            user_ids: 'users',
            record_ids: 'records',
            content_types: 'type',
            tags: 'plain',
          }
          for (termKey in terms) {
            if (map[termKey]) {
              newTerms[map[termKey]] = terms[termKey]
            } else {
              newTerms[termKey] = terms[termKey]
            }
          }
          return newTerms
        }
        if (serial.match !== undefined && serial.match.length > 0) {
          for (i = 0; i < serial.match.length; i++) {
            request.match(
              arrangeTerms(serial.match[i].terms),
              serial.match[i].condition,
              serial.match[i].strategy
            )
          }
        }
        if (serial.exclude !== undefined && serial.exclude.length > 0) {
          for (i = 0; i < serial.exclude.length; i++) {
            request.exclude(
              arrangeTerms(serial.exclude[i].terms),
              serial.exclude[i].condition,
              serial.exclude[i].strategy
            )
          }
        }
        if (serial.range !== undefined) {
          // Need to convert from serialized ISO8601 strings to JS Date objects
          const start = new Date(serial.range.after)
          const end = new Date(serial.range.before)
          request.range(start, end, serial.range.range_key)
        }
        return client
          .search(request)
          .then(function (r) {
            return r.next()
          })
          .then(function (list) {
            return list.map(function (record) {
              return record.serializable()
            })
          })
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      searchRequest.stringify()
    )
    return Promise.all(JSON.parse(recordsJSON).map(Tozny.types.Record.decode))
  },
  async infoOperation(config, method) {
    const result = await runInEnvironment(
      function (configJSON, method) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client[method]().then(JSON.stringify)
      },
      JSON.stringify(config),
      method
    )
    return JSON.parse(result)
  },
  async registerIdentity(config, realm) {
    const username = testEmail(`integration-user-${uuidv4()}`)
    const password = uuidv4()
    const user = await runInEnvironment(
      function (realmJSON, clientRegistrationToken, username, password) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        return realm
          .register(
            username,
            password,
            clientRegistrationToken,
            testEmail(username)
          )
          .then(function (user) {
            return user.stringify()
          })
      },
      JSON.stringify(config),
      clientRegistrationToken,
      username,
      password
    )
    return realm.fromObject(user)
  },
  async login(config, realm, username, password) {
    const user = await runInEnvironment(
      function (realmJSON, username, password) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        return realm.login(username, password).then(function (user) {
          return user.stringify()
        })
      },
      JSON.stringify(config),
      username,
      password
    )
    return realm.fromObject(user)
  },
  async userMethod(config, user, method) {
    const userConfig = await runInEnvironment(
      function (realmJSON, userJSON, method) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user[method]().then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      method
    )
    return JSON.parse(userConfig)
  },
  async createGroup(config, name, description, capabilities = []) {
    const groupMembership = await runInEnvironment(
      function (configJSON, name, capabilities, description) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        capabilities = new Tozny.types.Capabilities(capabilities)
        return client.createGroup(name, capabilities, description)
      },
      JSON.stringify(config),
      name,
      capabilities,
      description
    )
    return groupMembership
  },
  async deleteGroup(config, groupID) {
    const result = await runInEnvironment(
      async function (configJSON, groupID) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        const value = await client.deleteGroup(groupID)
        return JSON.stringify(value)
      },
      JSON.stringify(config),
      groupID
    )
    return JSON.parse(result)
  },
  async readGroup(config, id) {
    const groupJson = await runInEnvironment(
      function (configJson, id) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.readGroup(id)
      },
      JSON.stringify(config),
      id
    )
    return groupJson
  },
  async listGroups(
    config,
    clientID = null,
    groupNames = [],
    nextToken = null,
    max = null
  ) {
    const groupsJson = await runInEnvironment(
      function (configJSON, clientID, groupNamesJson, nextToken, max) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var groupNames = JSON.parse(groupNamesJson)
        return client.listGroups(clientID, groupNames, nextToken, max)
      },
      JSON.stringify(config),
      clientID,
      JSON.stringify(groupNames),
      nextToken,
      max
    )
    return groupsJson
  },
  async groupInfo(config, clientID = null, groupName) {
    const result = await runInEnvironment(
      function (configJSON, clientID, groupName) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.groupInfo(groupName, clientID)
      },
      JSON.stringify(config),
      clientID,
      groupName
    )
    return result
  },
  async addGroupMembers(config, groupId, groupMembers = []) {
    const result = await runInEnvironment(
      function (configJSON, groupId, groupMembersJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var groupMembersParsed = JSON.parse(groupMembersJSON)
        groupMembers = groupMembersParsed
        return client.addGroupMembers(groupId, groupMembers)
      },
      JSON.stringify(config),
      groupId,
      JSON.stringify(groupMembers)
    )
    return result
  },
  async removeGroupMembers(config, groupId, clientIds = []) {
    const result = await runInEnvironment(
      function (configJSON, groupId, clientIdsJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var clientIDParsed = JSON.parse(clientIdsJSON)
        clientIds = clientIDParsed
        return client.removeGroupMembers(groupId, clientIds)
      },
      JSON.stringify(config),
      groupId,
      JSON.stringify(clientIds)
    )
    return JSON.parse(result)
  },
  async listGroupMembers(config, id) {
    const result = await runInEnvironment(
      function (configJson, id) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.listGroupMembers(id)
      },
      JSON.stringify(config),
      id
    )
    return result
  },
  async bulkListGroupMembers(config, ids) {
    const result = await runInEnvironment(
      function (configJson, ids) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.bulkListGroupMembers(JSON.parse(ids))
      },
      JSON.stringify(config),
      JSON.stringify(ids)
    )
    return result
  },
  async listRecordsSharedWithGroup(
    config,
    groupId,
    writerIds = [],
    nextToken = null,
    max = null
  ) {
    const result = await runInEnvironment(
      function (configJson, groupId, writerIdsJSON, nextToken, max) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        var writerIds = JSON.parse(writerIdsJSON)
        return client.listRecordsSharedWithGroup(
          groupId,
          writerIds,
          nextToken,
          max
        )
      },
      JSON.stringify(config),
      groupId,
      JSON.stringify(writerIds),
      nextToken,
      max
    )
    return result
  },
  async bulkListRecordsSharedWithGroup(config, groupIds = [], nextToken, max) {
    const result = await runInEnvironment(
      function (configJson, groupIds, nextToken, max) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.bulkListRecordsSharedWithGroup(
          JSON.parse(groupIds),
          nextToken,
          max
        )
      },
      JSON.stringify(config),
      JSON.stringify(groupIds),
      nextToken,
      max
    )
    return result
  },
  async listGroupAllowedReads(config, contentTypes = []) {
    const result = await runInEnvironment(
      function (configJson, contentTypes) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.listGroupAllowedReads(JSON.parse(contentTypes))
      },
      JSON.stringify(config),
      JSON.stringify(contentTypes)
    )
    return result
  },
  async listGroupsByID(config, groupIDs = []) {
    const result = await runInEnvironment(
      function (configJson, groupIDs) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.listGroupsByID(JSON.parse(groupIDs))
      },
      JSON.stringify(config),
      JSON.stringify(groupIDs)
    )
    return result
  },
  async updateGroupDescription(config, groupId, updatedDescription) {
    const result = await runInEnvironment(
      function (configJson, groupId) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.updateGroupDescription(groupId, updatedDescription)
      },
      JSON.stringify(config),
      groupId,
      updatedDescription
    )
    return result
  },
  async shareRecordWithGroup(config, groupId, recordType) {
    const result = await runInEnvironment(
      function (configJson, groupId, recordType) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.shareRecordWithGroup(groupId, recordType)
      },
      JSON.stringify(config),
      groupId,
      recordType
    )
    return result
  },
  async revokeRecordWithGroup(config, groupId, recordType) {
    const result = await runInEnvironment(
      function (configJSON, groupId, recordType) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.revokeRecordWithGroup(groupId, recordType)
      },
      JSON.stringify(config),
      groupId,
      recordType
    )
    return result
  },
  async createSecret(config, user, secret) {
    const secretResp = await runInEnvironment(
      function (realmJSON, userJSON, secret) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.createSecret(secret).then(function (secret) {
          return secret.stringify()
        })
      },
      JSON.stringify(config),
      user.stringify(),
      secret
    )
    return Tozny.types.Record.decode(JSON.parse(secretResp))
  },
  async getSecrets(config, user, limit) {
    const secretList = await runInEnvironment(
      function (realmJSON, userJSON, limit) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.getSecrets(limit).then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      limit
    )
    return JSON.parse(secretList)
  },
  async viewSecret(config, user, secretID) {
    const secret = await runInEnvironment(
      function (realmJSON, userJSON, secretID) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.viewSecret(secretID).then(function (secret) {
          return JSON.stringify(secret)
        })
      },
      JSON.stringify(config),
      user.stringify(),
      secretID
    )
    return JSON.parse(secret)
  },
  async updateSecret(config, user, oldSecret, newSecret) {
    const secretResponse = await runInEnvironment(
      function (realmJSON, userJSON, oldSecret, newSecret) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.updateSecret(oldSecret, newSecret).then(function (secret) {
          return secret.stringify()
        })
      },
      JSON.stringify(config),
      user.stringify(),
      oldSecret,
      newSecret
    )
    return Tozny.types.Record.decode(JSON.parse(secretResponse))
  },
  async shareSecretWithUsername(
    config,
    user,
    secretName,
    secretType,
    usernameToAdd
  ) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, secretName, secretType, usernameToAdd) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .shareSecretWithUsername(secretName, secretType, usernameToAdd)
          .then(function (secret) {
            if (secret != null) {
              return JSON.stringify(secret)
            } else {
              return secret
            }
          })
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType,
      usernameToAdd
    )
    return JSON.parse(result)
  },
  async waitForNext(query, test = (f) => f.length > 0) {
    // short circuit for already done queries
    if (query.done) {
      return []
    }
    const originalAfterIndex = query.afterIndex
    // Start with a very short delay as immediate fetch of results right after writing
    // sometimes fails, but even with a very short window of wait it can succeed
    // first try.
    await new Promise((r) => setTimeout(r, 200))
    // 30-second timeout period
    const start = new Date()
    let found
    while (new Date() - start < 30000) {
      query.done = false
      query.afterIndex = originalAfterIndex
      found = await query.next()
      if (test(found)) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise((r) => setTimeout(r, 200))
    }
    return found
  },
  async getLatestSecret(config, user, secretName, secretType) {
    const secret = await runInEnvironment(
      function (realmJSON, userJSON, secretName, secretType) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .getLatestSecret(secretName, secretType)
          .then(function (secret) {
            if (secret.exists == true) {
              return { exists: true, results: JSON.stringify(secret.results) }
            }
            return secret
          })
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType
    )
    if (secret.exists == true) {
      let secretResult = await Tozny.types.Record.decode(
        JSON.parse(secret.results)
      )
      return { exists: true, results: secretResult }
    }
    return secret
  },
  async privateRealmInfo(config, user) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.privateRealmInfo().then(function (info) {
          if (info != null) {
            return JSON.stringify(info)
          } else {
            return info
          }
        })
      },
      JSON.stringify(config),
      user.stringify()
    )
    return JSON.parse(result)
  },
  async revokeSecretFromUser(
    config,
    user,
    secretName,
    secretType,
    userToRevokeShare
  ) {
    const result = await runInEnvironment(
      function (
        realmJSON,
        userJSON,
        secretName,
        secretType,
        userToRevokeShare
      ) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.revokeSecretFromUser(
          secretName,
          secretType,
          userToRevokeShare
        )
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType,
      userToRevokeShare
    )
    return result
  },
  async removeSecretFromNamespace(
    config,
    user,
    secretName,
    secretType,
    namespace
  ) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, secretName, secretType, namespace) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.removeSecretFromNamespace(secretName, secretType, namespace)
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType,
      namespace
    )
    return result
  },
  async removeIdentityFromNamespace(
    config,
    user,
    userToRevokeShare,
    namespace
  ) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, namespace, userToRevokeShare) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.removeIdentityFromNamespace(namespace, userToRevokeShare)
      },
      JSON.stringify(config),
      user.stringify(),
      userToRevokeShare,
      namespace
    )
    return result
  },
  async addIdentityToNamespace(config, user, namespace, usernameToAdd) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, namespace, usernameToAdd) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.addIdentityToNamespace(usernameToAdd, namespace)
      },
      JSON.stringify(config),
      user.stringify(),
      namespace,
      usernameToAdd
    )
    return result
  },
  async addSecretToNamespace(config, user, secretName, secretType, namespace) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, secretName, secretType, namespace) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.addSecretToNamespace(secretName, secretType, namespace)
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType,
      namespace
    )
    return result
  },
  async getSecretSharedList(config, user, secretName, secretType) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, secretName, secretType) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.getSecretSharedList(secretName, secretType)
      },
      JSON.stringify(config),
      user.stringify(),
      secretName,
      secretType
    )
    return result
  },
  /* this works with the node specific file tests, and will be reworked
  to fit with browser compatible tests */
  async getFile(config, user, recordId) {
    const secretResponse = await runInEnvironment(
      function (realmJSON, userJSON, recordId) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.getFile(recordId)
      },
      JSON.stringify(config),
      user.stringify(),
      recordId
    )
    return secretResponse
  },
  async searchRealmIdentitiesByUsername(config, user, usernamesToSearch = []) {
    const results = await runInEnvironment(
      function (realmJSON, userJSON, usernamesToSearchJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        var usernames = JSON.parse(usernamesToSearchJSON)
        const user = realm.fromObject(userJSON)
        return user
          .searchRealmIdentitiesByUsername(usernames)
          .then(function (identityInfo) {
            const returnVal = JSON.stringify(identityInfo)
            return returnVal
          })
      },
      JSON.stringify(config),
      user.stringify(),
      JSON.stringify(usernamesToSearch)
    )
    return JSON.parse(results)
  },
  async searchRealmIdentitiesByEmail(config, user, emailsToSearch = []) {
    const results = await runInEnvironment(
      function (realmJSON, userJSON, emailsToSearchJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        var emails = JSON.parse(emailsToSearchJSON)
        const user = realm.fromObject(userJSON)
        return user
          .searchRealmIdentitiesByEmail(emails)
          .then(function (identityInfo) {
            const returnVal = JSON.stringify(identityInfo)
            return returnVal
          })
      },
      JSON.stringify(config),
      user.stringify(),
      JSON.stringify(emailsToSearch)
    )
    return JSON.parse(results)
  },
  async searchIdentityByEmail(config, user, email) {
    const results = await runInEnvironment(
      function (realmJSON, userJSON, email) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.searchIdentityByEmail(email)
      },
      JSON.stringify(config),
      user.stringify(),
      email
    )
    return results
  },
  async searchIdentityByUsername(config, user, username) {
    const results = await runInEnvironment(
      function (realmJSON, userJSON, username) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.searchIdentityByUsername(username)
      },
      JSON.stringify(config),
      user.stringify(),
      username
    )
    return results
  },
  async getSharedSecrets(config, user) {
    const secretList = await runInEnvironment(
      function (realmJSON, userJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.getSharedSecrets().then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify()
    )
    return JSON.parse(secretList)
  },
  async deleteSecretVersion(config, user, secret) {
    const result = await runInEnvironment(
      function (realmJSON, userJSON, secretJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .deleteSecretVersion(JSON.parse(secretJSON))
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      JSON.stringify(secret)
    )
    return JSON.parse(result)
  },
  async createAccessRequest(
    config,
    user,
    realmName,
    accessControlledGroups,
    reason,
    accessDurationSeconds
  ) {
    const result = await runInEnvironment(
      async function (
        realmJSON,
        userJSON,
        realmNameJSON,
        accessControlledGroupsJSON,
        reasonJSON,
        accessDurationSecondsJSON
      ) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .createAccessRequest(
            realmNameJSON,
            accessControlledGroupsJSON,
            reasonJSON,
            accessDurationSecondsJSON
          )
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      realmName,
      accessControlledGroups,
      reason,
      accessDurationSeconds
    )
    return JSON.parse(result)
  },
  async describeAccessRequest(config, user, accessRequestId) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, accessRequestIdJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .describeAccessRequest(accessRequestIdJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      accessRequestId
    )
    return JSON.parse(result)
  },
  async deleteAccessRequest(config, user, accessRequestId) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, accessRequestIdJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .deleteAccessRequest(accessRequestIdJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      accessRequestId
    )
    return JSON.parse(result)
  },
  async searchAccessRequests(config, user, filters, nextToken, limit) {
    const result = await runInEnvironment(
      async function (
        realmJSON,
        userJSON,
        filtersJSON,
        nextTokenJson,
        limitJSON
      ) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .searchAccessRequests(filtersJSON, nextTokenJson, limitJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      filters,
      nextToken,
      limit
    )
    return JSON.parse(result)
  },
  async approveAccessRequests(config, user, realmName, approvals) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, realmNameJSON, approvalsJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .approveAccessRequests(realmNameJSON, approvalsJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      realmName,
      approvals
    )
    return JSON.parse(result)
  },
  async denyAccessRequests(config, user, realmName, denials) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, realmNameJSON, denialsJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .denyAccessRequests(realmNameJSON, denialsJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      realmName,
      denials
    )
    return JSON.parse(result)
  },
  async availableAccessRequestGroups(config, user, realmName) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, realmNameJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .availableAccessRequestGroups(realmNameJSON)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      realmName
    )
    return JSON.parse(result)
  },
  async initiateWebAuthnChallenge(config, user) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user.initiateWebAuthnChallenge().then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify()
    )
    return JSON.parse(result)
  },
  async fetchSubscriptionsToComputations(config, subscription) {
    const subscriptions = await runInEnvironment(
      function (configJSON, subscription) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.fetchSubscriptionsToComputations(subscription)
      },
      JSON.stringify(config),
      subscription
    )
    return subscriptions
  },
  async fetchAvailableComputations(config) {
    const subscriptions = await runInEnvironment(function (
      configJSON,
      subscription
    ) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client.fetchAvailableComputations(subscription)
    },
    JSON.stringify(config))
    return subscriptions
  },
  async computeAnalysis(config, params) {
    const computations = await runInEnvironment(
      function (configJSON, params) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.computeAnalysis(params)
      },
      JSON.stringify(config),
      params
    )
    return computations
  },
  async subscribeToComputation(config, subscription) {
    const result = await runInEnvironment(
      function (configJSON, subscription) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.subscribeToComputation(subscription)
      },
      JSON.stringify(config),
      subscription
    )
    return result
  },
  async unsubscribeFromComputation(config, unsubscribe) {
    const result = await runInEnvironment(
      function (configJSON, unsubscribe) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.unsubscribeFromComputation(unsubscribe)
      },
      JSON.stringify(config),
      unsubscribe
    )
    return JSON.parse(result)
  },
  async updateSubscriptionToComputation(config, update) {
    const result = await runInEnvironment(
      function (configJSON, update) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.updateSubscriptionToComputation(update)
      },
      JSON.stringify(config),
      update
    )
    return JSON.parse(result)
  },
  async listRealmIdentities(config, user, realmName, max, next) {
    const result = await runInEnvironment(
      async function (realmJSON, userJSON, realmNameJSON) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        const user = realm.fromObject(userJSON)
        return user
          .listIdentities(realmNameJSON, max, next)
          .then(JSON.stringify)
      },
      JSON.stringify(config),
      user.stringify(),
      realmName,
      max,
      next
    )
    return JSON.parse(result)
  },
}
