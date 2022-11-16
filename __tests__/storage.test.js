const { v4: uuidv4 } = require('uuid')
const Tozny = require('../node')
const { GroupMember } = require('../types')
const ops = require('./utils/operations')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
let readerClient
let authorizerClient
beforeAll(async () => {
  writerClient = await ops.registerClient()
  readerClient = await ops.registerClient()
  authorizerClient = await ops.registerClient()
})

describe('Tozny', () => {
  it('can register a client', async () => {
    const config = await ops.registerClient('registration-test')
    // Basic exist check to ensure we got back a full Config object.
    expect(config.clientId).toBeTruthy()
    expect(config.apiKeyId).toBeTruthy()
    expect(config.apiSecret).toBeTruthy()
    expect(config.publicKey).toBeTruthy()
    expect(config.privateKey).toBeTruthy()
    expect(config.apiUrl).toBeTruthy()
    expect(config.publicSigningKey).toBeTruthy()
    expect(config.privateSigningKey).toBeTruthy()
  })

  it('can perform CRUD on records', async () => {
    const type = 'say-hello'
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    const updatedData = { hello: 'updated' }
    const updatedMeta = { hola: 'updated' }
    const test = {
      meta: { plain: meta },
      data: data,
    }
    const updatedTest = {
      meta: { plain: updatedMeta },
      data: updatedData,
    }
    const record = await ops.writeRecord(writerClient, type, data, meta)
    expect(record).toMatchObject(test)
    expect(record.meta.recordId).toBeTruthy()
    const read = await ops.readRecord(writerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    read.meta.plain = updatedMeta
    read.data = new Tozny.types.RecordData(updatedData)
    const updated = await ops.updateRecord(writerClient, read)
    expect(updated).toMatchObject(updatedTest)
    const readUpdated = await ops.readRecord(writerClient, record.meta.recordId)
    expect(readUpdated).toMatchObject(updatedTest)
    const removed = await ops.deleteRecord(
      writerClient,
      updated.meta.recordId,
      updated.meta.version
    )
    expect(removed).toBe(true)
  })

  it('allows sharing of records', async () => {
    const type = 'to-share'
    const data = { secret: 'only for special readers' }
    const test = { data }
    const shared = await ops.authOperation(
      writerClient,
      'share',
      type,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const record = await ops.writeRecord(writerClient, type, data, {})
    const read = await ops.readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await ops.authOperation(
      writerClient,
      'revoke',
      type,
      readerClient.clientId
    )
    expect(revoked).toBe(true)
    expect(ops.readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
  })

  it('allows authorization of record sharing', async () => {
    const type = 'authorized'
    const data = { secret: 'shared with authorized readers' }
    const test = { data }
    const authorized = await ops.authOperation(
      writerClient,
      'addAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(authorized).toBe(true)
    const record = await ops.writeRecord(writerClient, type, data, {})
    const shared = await ops.authOnBehalfOperation(
      authorizerClient,
      'shareOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const read = await ops.readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await ops.authOnBehalfOperation(
      authorizerClient,
      'revokeOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(ops.readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
    expect(revoked).toBe(true)
    const deauthorized = await ops.authOperation(
      writerClient,
      'removeAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(deauthorized).toBe(true)
    expect(
      ops.authOnBehalfOperation(
        authorizerClient,
        'shareOnBehalfOf',
        type,
        writerClient.clientId,
        readerClient.clientId
      )
    ).rejects.toThrow()
  })

  it('can write, read, update by name, and delete basic notes', async () => {
    const data = { secret: 'data' }
    const updatedData = { secret: 'updated data' }
    const noteName = `globalNoteName-${uuidv4()}`
    const options = { id_string: noteName }
    const writeTest = {
      mode: 'Sodium',
      recipientSigningKey: readerClient.publicSigningKey,
      writerEncryptionKey: writerClient.publicKey,
      writerSigningKey: writerClient.publicSigningKey,
      options: {
        clientId: writerClient.clientId,
        idString: noteName,
      },
    }
    const updatedWriteTest = Object.assign({}, writeTest, {
      recipientSigningKey: authorizerClient.publicSigningKey,
    })
    const readTest = Object.assign({ data }, writeTest)
    const updatedReadTest = Object.assign(
      { data: updatedData },
      updatedWriteTest
    )
    const written = await ops.writeNote(
      writerClient,
      data,
      readerClient.publicKey,
      readerClient.publicSigningKey,
      options
    )
    expect(written).toMatchObject(writeTest)
    const readById = await ops.readNote(readerClient, written.noteId)
    expect(readById).toMatchObject(readTest)
    const readByName = await ops.readNote(readerClient, noteName, true)
    expect(readByName).toMatchObject(readTest)
    const updated = await ops.replaceNamedNote(
      writerClient,
      updatedData,
      authorizerClient.publicKey,
      authorizerClient.publicSigningKey,
      options
    )
    expect(updated).toMatchObject(updatedWriteTest)
    const updatedRead = await ops.readNote(authorizerClient, updated.noteId)
    expect(updatedRead).toMatchObject(updatedReadTest)
    const deleted = await ops.deleteNote(writerClient, updated.noteId)
    expect(deleted).toBe(true)
  })

  it('can write, read, and delete anonymous notes', async () => {
    const data = { secret: 'data' }
    const options = { max_views: 2 }
    const keyPair = await Tozny.crypto.generateKeypair()
    const signingPair = await Tozny.crypto.generateSigningKeypair()
    const writeTest = {
      mode: 'Sodium',
      recipientSigningKey: signingPair.publicKey,
      writerEncryptionKey: keyPair.publicKey,
      writerSigningKey: signingPair.publicKey,
    }
    const readTest = Object.assign({ data }, writeTest)
    const written = await ops.writeAnonymousNote(
      data,
      keyPair.publicKey,
      signingPair.publicKey,
      keyPair,
      signingPair,
      options
    )
    expect(written).toMatchObject(writeTest)
    const read = await ops.readAnonymousNote(
      written.noteId,
      keyPair,
      signingPair
    )
    expect(read).toMatchObject(readTest)
    const deleted = await ops.deleteAnonymousNote(written.noteId, signingPair)
    expect(deleted).toBe(true)
  })
  it('can handle list groups when no groups are returned', async () => {
    const list = await ops.listGroups(
      writerClient,
      writerClient.clientId,
      [],
      0,
      10
    )
    const listTest = {
      groups: [],
      nextToken: 0,
    }
    expect(list).toMatchObject(listTest)
  })
  it('can create groups', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const createTest = {
      group: {
        groupName: groupName,
        description: groupDesciption,
      },
      capabilities: {
        manage: true,
      },
    }
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    expect(created).toMatchObject(createTest)
  })
  it('can delete a group', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const deleted = await ops.deleteGroup(writerClient, created.group.groupID)
    expect(deleted).toBe(true)
  })
  it('can read a group by groupID', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const readTest = {
      groupName: created.group.groupName,
      publicKey: created.group.publicKey,
      groupID: created.group.groupID,
      accountID: created.group.accountID,
    }
    const read = await ops.readGroup(readerClient, created.group.groupID)
    expect(read).toMatchObject(readTest)
  })
  it('can list groups', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const listTest = {
      groups: [
        {
          accountID: created.group.accountID,
        },
        {
          accountID: created.group.accountID,
        },
        {
          groupName: created.group.groupName,
          groupID: created.group.groupID,
          accountID: created.group.accountID,
        },
      ],
      nextToken: 0,
    }
    const list = await ops.listGroups(
      writerClient,
      writerClient.clientId,
      [],
      0,
      10
    )
    expect(list).toMatchObject(listTest)
  })
  it('can list groups with specific names', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const created = await ops.createGroup(writerClient, groupName)
    const listTest = {
      groups: [
        {
          groupName: created.group.groupName,
          groupID: created.group.groupID,
          accountID: created.group.accountID,
        },
      ],
      nextToken: 0,
    }
    const list = await ops.listGroups(
      writerClient,
      writerClient.clientId,
      [groupName],
      0,
      10
    )
    expect(list).toMatchObject(listTest)
  })
  it('can create groups with specified capabilities', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const capabilities = {
      read: true,
    }
    const createTest = {
      group: {
        groupName: groupName,
      },
      capabilities: {
        manage: true,
        read: true,
      },
    }
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption,
      capabilities
    )
    expect(created).toMatchObject(createTest)
  })
  it('can add a group member to a group', async () => {
    // Make a group to be able to add members to
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, { read: true })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    const addGroupMembers = await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    const addGroupResultExpected = [
      {
        client_id: readerClient.clientId,
        membership_key: addGroupMembers[0].membership_key,
        capability_names: ['READ_CONTENT'],
      },
    ]
    expect(addGroupMembers).toMatchObject(addGroupResultExpected)
  })
  it('can remove a group member from a group', async () => {
    // Make a group, add a group member, and now remove that group member
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, { read: true })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    let clientID = []
    clientID.push(readerClient.clientId)
    clientID.push(readerClient.clientId)
    const removeGroupMembers = await ops.removeGroupMembers(
      writerClient,
      created.group.groupID,
      clientID
    )
    expect(removeGroupMembers).toBe(true)
  })
  it('can list group members from a group', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, { read: true })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    await ops.listGroupMembers(writerClient, created.group.groupID)
  })
  it('can list records shared with groups', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, { read: true })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    await new Promise((r) => setTimeout(r, 5000))
    let sharedWithGroup = await ops.listRecordsSharedWithGroup(
      readerClient,
      created.group.groupID,
      [],
      0,
      10
    )
    let sharedWithGroupExpected = []
    expect(sharedWithGroup).toMatchObject(sharedWithGroupExpected)
  })
  it('can share records with a group and list the record', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a group meant to list'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    const groupMember2 = new GroupMember(authorizerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    groupMembersToAdd.push(groupMember2)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    const type = 'say-hello'
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    let recordInfo = await ops.writeRecord(readerClient, type, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)
    await new Promise((r) => setTimeout(r, 5000))
    let sharedWithGroup = await ops.listRecordsSharedWithGroup(
      authorizerClient,
      created.group.groupID,
      [],
      0,
      1
    )
    expect(sharedWithGroup[0][0].meta.recordId).toBe(recordInfo.meta.recordId)
  })
  it('can paginate through records shared with group', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDesciption = 'this is a test group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    const groupMember2 = new GroupMember(authorizerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    groupMembersToAdd.push(groupMember2)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    const type = `say-hello-${uuidv4()}`
    const data1 = { hi: 'world' }
    const meta1 = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data1, meta1)
    const data2 = { hello: 'realWorld' }
    const meta2 = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data2, meta2)
    const data3 = { hola: 'toznyAmazing!' }
    const meta3 = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data3, meta3)
    const data4 = { commo: 'toznygreat' }
    const meta4 = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data4, meta4)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)
    await new Promise((r) => setTimeout(r, 5000))
    let sharedWithGroup = await ops.listRecordsSharedWithGroup(
      authorizerClient,
      created.group.groupID,
      [],
      0,
      3
    )
    expect(sharedWithGroup[0].length).toBe(3)
    let sharedWithGroup2 = await ops.listRecordsSharedWithGroup(
      authorizerClient,
      created.group.groupID,
      [],
      0,
      10
    )
    expect(sharedWithGroup2[0].length).toBe(4)
  })
  it('It can share and unshare a record with a group', async () => {
    const groupName = `testGroup-updated-${uuidv4()}`
    const groupDesciption = 'this is a group meant to list'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    const groupMember2 = new GroupMember(authorizerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    groupMembersToAdd.push(groupMember2)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    let recordInfo = await ops.writeRecord(readerClient, type, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)
    await new Promise((r) => setTimeout(r, 5000))
    let sharedWithGroup = await ops.listRecordsSharedWithGroup(
      authorizerClient,
      created.group.groupID,
      [],
      0,
      10
    )
    expect(sharedWithGroup[0][0].meta.recordId).toBe(recordInfo.meta.recordId)
    await ops.revokeRecordWithGroup(readerClient, created.group.groupID, type)
    let sharedWithGroupUpdated = await ops.listRecordsSharedWithGroup(
      authorizerClient,
      created.group.groupID,
      [],
      0,
      10
    )
    expect(JSON.stringify(sharedWithGroupUpdated)).toBe(JSON.stringify([]))
  })
  it('can return a group based on group name', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const created = await ops.createGroup(writerClient, groupName)
    const listTest = {
      groupName: created.group.groupName,
      groupID: created.group.groupID,
      accountID: created.group.accountID,
    }
    const list = await ops.groupInfo(
      writerClient,
      writerClient.clientId,
      groupName
    )

    expect(list).toMatchObject(listTest)
  })
  it('can return an empty group', async () => {
    const listTest = {}
    const list = await ops.groupInfo(
      writerClient,
      writerClient.clientId,
      `fakeName-${uuidv4()}`
    )
    expect(list).toMatchObject(listTest)
  })
  it('Can fetch subscriptions to computations', async () => {
    const fetchSubscriptionsRequest = {
      ToznyClientID: readerClient.clientId,
    }
    const subscriptions = await ops.fetchSubscriptionsToComputations(
      readerClient,
      fetchSubscriptionsRequest
    )
    expect(subscriptions.computations).toMatchObject([])
  })
  it('Can fetch all subscriptions to computations', async () => {
    await ops.fetchAvailableComputations(readerClient)
  })
  it('Can run a computation analysis', async () => {
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [],
    }
    await ops.subscribeToComputation(readerClient, subscriptionRequest)

    let params = {
      ComputationID: computations.computations[0].computation_id,
      ToznyClientID: readerClient.clientId,
      DataStartTimestamp: '2012-11-01T22:08:41+00:00',
      DataEndTimestamp: '2012-11-01T22:08:41+00:00',
    }
    await ops.computeAnalysis(readerClient, params)
  })
  it('can subscribe to a computation', async () => {
    let managerUUID = uuidv4()
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [managerUUID],
    }
    const subscription = await ops.subscribeToComputation(
      readerClient,
      subscriptionRequest
    )
    expect(typeof subscription.computationID).toBe('string')
  })
  it('can subscribe to a computation with no manager ', async () => {
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
    }
    const subscription = await ops.subscribeToComputation(
      readerClient,
      subscriptionRequest
    )
    expect(typeof subscription.computationID).toBe('string')
  })
  it('can unsubscribe from a computation', async () => {
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [],
    }
    const subscriptions = await ops.subscribeToComputation(
      readerClient,
      subscriptionRequest
    )
    expect(typeof subscriptions.computationID).toBe('string')

    // Subscribe before unsubscribing

    const unsubscribeRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: subscriptions.computationID,
    }
    const unsubscribe = await ops.unsubscribeFromComputation(
      readerClient,
      unsubscribeRequest
    )
    expect(unsubscribe).toBe(true)
  })
  it('can update subscription to a computation', async () => {
    let managerUUID = uuidv4()
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [managerUUID],
    }
    await ops.subscribeToComputation(readerClient, subscriptionRequest)

    const updateSubscriptionRequest = {
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [],
    }
    const update = await ops.updateSubscriptionToComputation(
      readerClient,
      updateSubscriptionRequest
    )
    expect(update).toBe(true)
  })
  it('can update subscription to a computation with no manager', async () => {
    const computations = await ops.fetchAvailableComputations(readerClient)
    const subscriptionRequest = {
      ToznyClientID: readerClient.clientId,
      ComputationID: computations.computations[0].computation_id,
    }
    await ops.subscribeToComputation(readerClient, subscriptionRequest)

    const updateSubscriptionRequest = {
      ComputationID: computations.computations[0].computation_id,
      SubscriptionManagers: [],
    }
    const update = await ops.updateSubscriptionToComputation(
      readerClient,
      updateSubscriptionRequest
    )
    expect(update).toBe(true)
  })
  it('It can search for a record shared with a group', async () => {
    const groupName = `testGroup-updated-${uuidv4()}`
    const groupDesciption = 'this is a group meant to search'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    const groupMember2 = new GroupMember(authorizerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    groupMembersToAdd.push(groupMember2)
    await ops.addGroupMembers(
      writerClient,
      created.group.groupID,
      groupMembersToAdd
    )
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data, meta)

    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)

    // Wait for indexer
    const delay = ms => new Promise(res => setTimeout(res, ms));
    await delay(5000);

    const request = new Tozny.types.Search(true, true)
    request.match({ type: type })
    const found = await ops.search(authorizerClient, request)

    let match = false
    for (let record of found)
      if (record.data.hello == "world")
        match = true

    expect(match).toBe(true)
  })
})
