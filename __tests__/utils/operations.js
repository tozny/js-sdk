const { v4: uuidv4 } = require('uuid')
// const { listGroups } = require('../../lib/storage/shared')
const { runInEnvironment, apiUrl, clientRegistrationToken } = global
const Tozny = require('../../node')

// Utilities to help with running things in the configured environment
module.exports = {
  async registerClient() {
    const name = `integration-client-${uuidv4()}`
    const configJSON = await runInEnvironment(
      function(clientRegistrationToken, apiUrl, name) {
        return Promise.all([
          Tozny.crypto.generateKeypair(),
          Tozny.crypto.generateSigningKeypair(),
        ]).then(function(keys) {
          return Tozny.storage
            .register(
              clientRegistrationToken,
              name,
              keys[0],
              keys[1],
              true,
              apiUrl
            )
            .then(function(info) {
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
      function(configJSON, type, dataJSON, metaJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var data = JSON.parse(dataJSON)
        var meta = JSON.parse(metaJSON)
        return client.writeRecord(type, data, meta).then(function(record) {
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
      function(configJSON, recordId) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        return client.readRecord(recordId).then(function(record) {
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
      function(configJSON, recordJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var recordObj = JSON.parse(recordJSON)
        return Tozny.types.Record.decode(recordObj)
          .then(function(record) {
            return client.updateRecord(record)
          })
          .then(function(record) {
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
      function(configJSON, recordId, version) {
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
  async writeNote(
    config,
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    options = {}
  ) {
    const noteJSON = await runInEnvironment(
      function(
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
          .then(function(note) {
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
      function(
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
          .then(function(note) {
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
      function(
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
          .then(function(note) {
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
      function(configJSON, id, byNameJSON, authParamsJSON) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var byName = JSON.parse(byNameJSON)
        var operation = byName ? 'readNoteByName' : 'readNote'
        var authParams = JSON.parse(authParamsJSON)
        return client[operation](id, authParams).then(function(note) {
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
      function(
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
        ).then(function(note) {
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
      function(configJSON, noteId) {
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
      function(noteId, signingKeyPairJSON, apiUrl) {
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
      function(configJSON, method, type, targetId) {
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
      function(configJSON, method, type, ownerId, targetId) {
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
      function(configJSON, searchJSON) {
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
          request.range(serial.range.start, serial.range.end, serial.range.key)
        }
        return client
          .search(request)
          .then(function(r) {
            return r.next()
          })
          .then(function(list) {
            return list.map(function(record) {
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
      function(configJSON, method) {
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
    const username = `integration-user-${uuidv4()}@example.com`
    const password = uuidv4()
    const user = await runInEnvironment(
      function(realmJSON, clientRegistrationToken, username, password) {
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
            `${username}@example.com`
          )
          .then(function(user) {
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
      function(realmJSON, username, password) {
        const realmConfig = JSON.parse(realmJSON)
        const realm = new Tozny.identity.Realm(
          realmConfig.realmName,
          realmConfig.appName,
          realmConfig.brokerTargetUrl,
          realmConfig.apiUrl
        )
        return realm.login(username, password).then(function(user) {
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
      function(realmJSON, userJSON, method) {
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
  async createGroup(config, name, capabilities = []) {
    const groupJSON = await runInEnvironment(
      function(configJSON, name, capabilitiesJson) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var capabilities = JSON.parse(capabilitiesJson)
        return client.createGroup(name, capabilities).then(function(group) {
          return group.stringify()
        })
      },
      JSON.stringify(config),
      name,
      JSON.stringify(capabilities)
    )
    return Tozny.types.Group.decode(JSON.parse(groupJSON))
  },
  async readGroup(config, id) {
    const groupJson = await runInEnvironment(
      function(configJson, id) {
        var config = Tozny.storage.Config.fromObject(configJson)
        var client = new Tozny.storage.Client(config)
        return client.readGroup(id).then(function(group) {
          return group.stringify()
        })
      },
      JSON.stringify(config),
      id
    )
    return Tozny.types.Group.decode(JSON.parse(groupJson))
  },
  async listGroups(
    config,
    clientID = null,
    groupNames = null,
    nextToken = null,
    max = null
  ) {
    const groupsJson = await runInEnvironment(
      function(configJSON, clientID, groupNamesJson, nextToken, max) {
        var config = Tozny.storage.Config.fromObject(configJSON)
        var client = new Tozny.storage.Client(config)
        var groupNames = JSON.parse(groupNamesJson)
        return client
          .listGroups(clientID, groupNames, nextToken, max)
          .then(function(groups) {
            // maybe this needs to be done differently
            return groups.stringify()
          })
      },
      JSON.stringify(config),
      clientID,
      JSON.stringify(groupNames),
      nextToken,
      max
    )
    // maybe create another type for listGroups & call this from within that.
    return Tozny.types.Group.decode(JSON.parse(groupsJson))
  },
}
