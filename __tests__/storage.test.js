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
  it('can write and bulk delete', async () => {
    const type = 'say-hello'
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    const test = {
      meta: { plain: meta },
      data: data,
    }
    let fakeRecordID = uuidv4()
    const testBulk = {
      record_delete_error: {
        'N/A': [
          {
            error: 'Not Found',
            record_id: fakeRecordID,
          },
        ],
      },
    }
    const record = await ops.writeRecord(writerClient, type, data, meta)
    expect(record.meta.recordId).toBeTruthy()
    const read = await ops.readRecord(writerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const bulkDelete = await ops.deleteBulkRecord(writerClient, [
      record.meta.recordId,
      fakeRecordID,
    ])
    expect(bulkDelete).toMatchObject(testBulk)
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
    const delay = (ms) => new Promise((res) => setTimeout(res, ms))
    await delay(5000)

    const request = new Tozny.types.Search(true, true)
    request.match({ type: type })
    const found = await ops.search(authorizerClient, request)

    let match = false
    for (let record of found) if (record.data.hello == 'world') match = true

    expect(match).toBe(true)
  })

  it('can share records with two groups and list the records shared with each', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const group2Name = `testGroup2-${uuidv4()}`

    const groupDesciption = 'this is a group meant to list'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const created2 = await ops.createGroup(
      writerClient,
      group2Name,
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
    await ops.addGroupMembers(
      writerClient,
      created2.group.groupID,
      groupMembersToAdd
    )

    // Create a record and share it with the first group
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    let recordInfo = await ops.writeRecord(readerClient, type, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)

    // Create a second record and share it with the second group
    const type2 = `say-hello2-${uuidv4()}`
    const data2 = { hello2: 'world2' }
    const meta2 = { hola2: 'mundo2' }
    let recordInfo2 = await ops.writeRecord(readerClient, type2, data2, meta2)
    await ops.shareRecordWithGroup(readerClient, created2.group.groupID, type2)
    let sharedWithGroup = await ops.bulkListRecordsSharedWithGroup(
      authorizerClient,
      [created.group.groupID, created2.group.groupID],
      '',
      2
    )

    let group1Records = null
    let group2Records = null

    for (let groupRecords of sharedWithGroup.records) {
      if (groupRecords.groupID == created.group.groupID) {
        group1Records = groupRecords
      }
      if (groupRecords.groupID == created2.group.groupID) {
        group2Records = groupRecords
      }
    }

    // Make sure both records are found
    let foundFirstRecord = false
    let foundSecondRecord = false

    // Look through first group
    for (let record of group1Records.records) {
      if (record.meta.recordId == recordInfo.meta.recordId) {
        foundFirstRecord = true
      }
    }

    // Look through second group
    for (let record of group2Records.records) {
      if (record.meta.recordId == recordInfo2.meta.recordId) {
        foundSecondRecord = true
      }
    }

    expect(foundFirstRecord).toBe(true)
    expect(foundSecondRecord).toBe(true)
    expect(sharedWithGroup.nextToken).toBe('0')
  })

  it('can share records with two groups and list the records shared with each and paginate', async () => {
    const groupName = `testGroupA-${uuidv4()}`
    const group2Name = `testGroupA2-${uuidv4()}`

    const groupDesciption = 'this is a group meant to list'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const created2 = await ops.createGroup(
      writerClient,
      group2Name,
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
    await ops.addGroupMembers(
      writerClient,
      created2.group.groupID,
      groupMembersToAdd
    )

    // Create a record and share it with the first group
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    let recordInfo = await ops.writeRecord(readerClient, type, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)

    // Create a second record and share it with the second group
    const type2 = `say-hello2-${uuidv4()}`
    const data2 = { hello2: 'world2' }
    const meta2 = { hola2: 'mundo2' }
    let recordInfo2 = await ops.writeRecord(readerClient, type2, data2, meta2)
    await ops.shareRecordWithGroup(readerClient, created2.group.groupID, type2)
    await new Promise((r) => setTimeout(r, 5000))
    let sharedWithGroup = await ops.bulkListRecordsSharedWithGroup(
      authorizerClient,
      [created.group.groupID, created2.group.groupID],
      '',
      1
    )

    let sharedWithGroup2 = await ops.bulkListRecordsSharedWithGroup(
      authorizerClient,
      [created.group.groupID, created2.group.groupID],
      sharedWithGroup.nextToken,
      1
    )

    // Make sure both records are found
    let group1Records = sharedWithGroup.records[0]
    let group2Records = sharedWithGroup2.records[0]

    // Make sure both records are found
    let foundFirstRecord = false
    let foundSecondRecord = false

    // Look through first group
    for (let record of group1Records.records) {
      if (record.meta.recordId == recordInfo.meta.recordId) {
        foundFirstRecord = true
      }
    }

    // Look through second group
    for (let record of group2Records.records) {
      if (record.meta.recordId == recordInfo2.meta.recordId) {
        foundSecondRecord = true
      }
    }

    expect(foundFirstRecord).toBe(true)
    expect(foundSecondRecord).toBe(true)
    expect(sharedWithGroup2.nextToken).toBe('0')
  })
  it('can bulk list group members from a group', async () => {
    // Create group 1
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

    // Create group 2
    const group2Name = `testGroup2-${uuidv4()}`
    const created2 = await ops.createGroup(
      writerClient,
      group2Name,
      groupDesciption
    )
    const groupMember2 = new GroupMember(authorizerClient.clientId, {
      share: true,
    })
    let groupMembersToAdd2 = []
    groupMembersToAdd2.push(groupMember2)
    await ops.addGroupMembers(
      writerClient,
      created2.group.groupID,
      groupMembersToAdd2
    )

    let members = await ops.bulkListGroupMembers(writerClient, [
      created.group.groupID,
      created2.group.groupID,
    ])

    // // Find members in group 1
    let foundCreator1 = false
    let foundMember1 = false
    for (let groupMember of members.results[created.group.groupID]) {
      if (groupMember.client_id == writerClient.clientId) foundCreator1 = true
      if (groupMember.client_id == readerClient.clientId) foundMember1 = true
    }

    // Find members in group 2
    let foundCreator2 = false
    let foundMember2 = false
    for (let groupMember of members.results[created2.group.groupID]) {
      if (groupMember.client_id == writerClient.clientId) foundCreator2 = true
      if (groupMember.client_id == authorizerClient.clientId)
        foundMember2 = true
    }

    expect(foundCreator1).toBe(true)
    expect(foundMember1).toBe(true)
    expect(foundCreator2).toBe(true)
    expect(foundMember2).toBe(true)
  })
  it('can share records with two groups and list the groups as allowed readers', async () => {
    const groupName = `testGroupA-${uuidv4()}`
    const group2Name = `testGroupA2-${uuidv4()}`

    const groupDesciption = 'testing group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const created2 = await ops.createGroup(
      writerClient,
      group2Name,
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
    await ops.addGroupMembers(
      writerClient,
      created2.group.groupID,
      groupMembersToAdd
    )

    // Create a record and share it with both groups
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    await ops.writeRecord(readerClient, type, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type)
    await ops.shareRecordWithGroup(readerClient, created2.group.groupID, type)

    // Create a second record and share it with one group
    const type2 = `say-hello2-${uuidv4()}`
    await ops.writeRecord(readerClient, type2, data, meta)
    await ops.shareRecordWithGroup(readerClient, created.group.groupID, type2)
    await new Promise((r) => setTimeout(r, 5000))
    let allowedGroups = await ops.listGroupAllowedReads(readerClient, [
      type,
      type2,
    ])

    let group1FoundForType1 = false
    let group2FoundForType1 = false
    let group1FoundForType2 = false

    for (let groupID of allowedGroups[type]) {
      if (groupID == created.group.groupID) group1FoundForType1 = true
      else if (groupID == created2.group.groupID) group2FoundForType1 = true
    }

    for (let groupID of allowedGroups[type2]) {
      if (groupID == created.group.groupID) group1FoundForType2 = true
    }

    expect(allowedGroups[type].length).toBe(2)
    expect(allowedGroups[type2].length).toBe(1)
    expect(group1FoundForType1).toBe(true)
    expect(group2FoundForType1).toBe(true)
    expect(group1FoundForType2).toBe(true)
  })

  it('can add a member to two groups and list both group info by ID', async () => {
    const groupName = `testGroupA-${uuidv4()}`
    const group2Name = `testGroupA2-${uuidv4()}`

    const groupDesciption = 'testing group'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDesciption
    )
    const created2 = await ops.createGroup(
      writerClient,
      group2Name,
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
    let group1ID = created.group.groupID
    let group2ID = created2.group.groupID
    let groupMembersToAdd = []
    groupMembersToAdd.push(groupMember)
    groupMembersToAdd.push(groupMember2)
    await ops.addGroupMembers(writerClient, group1ID, groupMembersToAdd)
    await ops.addGroupMembers(writerClient, group2ID, groupMembersToAdd)

    let groupsInfo = await ops.listGroupsByID(readerClient, [
      created.group.groupID,
      created2.group.groupID,
    ])

    expect(
      Object.prototype.hasOwnProperty.call(groupsInfo.results, group1ID)
    ).toBe(true)
    expect(
      Object.prototype.hasOwnProperty.call(groupsInfo.results, group2ID)
    ).toBe(true)
    expect(groupsInfo.results[group1ID].group_name).toBe(groupName)
    expect(groupsInfo.results[group2ID].group_name).toBe(group2Name)
  })

  it('can update a description of a group', async () => {
    const groupName = `testGroup-${uuidv4()}`
    const groupDescription = 'testGroup Description'
    const created = await ops.createGroup(
      writerClient,
      groupName,
      groupDescription
    )
    const groupDescriptionUpdated = 'testGroup Description Updated'
    let groupID = created.group.groupID

    let result = await ops.updateGroupDescription(
      writerClient,
      groupID,
      groupDescriptionUpdated
    )
    expect(result.description).toBe(groupDescriptionUpdated)

    let groupsInfo = await ops.listGroupsByID(writerClient, [
      created.group.groupID,
    ])
    expect(
      Object.prototype.hasOwnProperty.call(groupsInfo.results, groupID)
    ).toBe(true)
    expect(groupsInfo.results[groupID].group_name).toBe(groupName)
    expect(groupsInfo.results[groupID].description).toBe(
      groupDescriptionUpdated
    )
  })
  it('It can exclude records received via a group', async () => {
    const groupName = `testGroup-${uuidv4()}`
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

    const type2 = `say-hello2-${uuidv4()}`
    await ops.writeRecord(authorizerClient, type2, data, meta)

    // Wait for indexer
    const delay = (ms) => new Promise((res) => setTimeout(res, ms))
    await delay(10000)

    // Make sure both records have been indexed
    const request = new Tozny.types.Search(
      true,
      true,
      null,
      null,
      [],
      false,
      false,
      false
    )
    request.match({ plain: { hola: 'mundo' } }, 'AND', 'EXACT')
    let found = await ops.search(authorizerClient, request)

    let firstSearchFoundRecord1 = false
    let firstSearchFoundRecord2 = false
    for (let record of found) {
      if (record.meta.type == type) firstSearchFoundRecord1 = true
      if (record.meta.type == type2) firstSearchFoundRecord2 = true
    }

    // Exclude group records
    const request2 = new Tozny.types.Search(
      true,
      true,
      null,
      null,
      [],
      false,
      true,
      false
    )
    request2.match({ plain: { hola: 'mundo' } }, 'AND', 'EXACT')

    let found2 = await ops.search(authorizerClient, request2)
    let secondSearchFoundRecord1 = false
    let secondSearchFoundRecord2 = false
    // This time we should not receive type2
    for (let record of found2) {
      if (record.meta.type == type) secondSearchFoundRecord1 = true
      if (record.meta.type == type2) secondSearchFoundRecord2 = true
    }

    expect(firstSearchFoundRecord1).toBe(true)
    expect(firstSearchFoundRecord2).toBe(true)
    expect(secondSearchFoundRecord1).toBe(false)
    expect(secondSearchFoundRecord2).toBe(true)
  })
  it('It can search for only directly shared records', async () => {
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    await ops.writeRecord(writerClient, type, data, meta)
    await ops.share(writerClient, type, readerClient.clientId)

    const type2 = `say-hello2-${uuidv4()}`
    await ops.writeRecord(writerClient, type2, data, meta)

    // Wait for indexer
    const delay = (ms) => new Promise((res) => setTimeout(res, ms))
    await delay(10000)

    // Make sure both records have been indexed
    const request = new Tozny.types.Search(
      true,
      true,
      null,
      null,
      [],
      false,
      false,
      false
    )
    request.match({ plain: { hola: 'mundo' } }, 'AND', 'EXACT')
    let found = await ops.search(writerClient, request)

    let firstSearchFoundRecord1 = false
    let firstSearchFoundRecord2 = false
    for (let record of found) {
      if (record.meta.type == type) firstSearchFoundRecord1 = true
      if (record.meta.type == type2) firstSearchFoundRecord2 = true
    }

    // Include only direct shares
    const request2 = new Tozny.types.Search(
      true,
      false,
      null,
      null,
      [],
      false,
      false,
      true
    )
    request2.match({ plain: { hola: 'mundo' } }, 'AND', 'EXACT')

    let found2 = await ops.search(writerClient, request2)
    let secondSearchFoundRecord1 = false
    let secondSearchFoundRecord2 = false
    // This time we should not receive type2
    for (let record of found2) {
      if (record.meta.type == type) secondSearchFoundRecord1 = true
      if (record.meta.type == type2) secondSearchFoundRecord2 = true
    }

    expect(firstSearchFoundRecord1).toBe(true)
    expect(firstSearchFoundRecord2).toBe(true)
    expect(secondSearchFoundRecord1).toBe(true)
    expect(secondSearchFoundRecord2).toBe(false)
  })
  it('It can get outgoing shares by record type', async () => {
    const type = `say-hello-${uuidv4()}`
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    await ops.writeRecord(writerClient, type, data, meta)
    await ops.share(writerClient, type, readerClient.clientId)
    await ops.share(writerClient, type, authorizerClient.clientId)

    let outgoingShares = await ops.outgoingSharingByRecordType(
      writerClient,
      type
    )
    let foundReaderClient = false
    let foundAuthClient = false
    for (let share of outgoingShares.shares) {
      if (share.reader_id == readerClient.clientId) foundReaderClient = true
      if (share.reader_id == authorizerClient.clientId) foundAuthClient = true
    }
    expect(foundReaderClient).toBe(true)
    expect(foundAuthClient).toBe(true)
  })

  // Test fetchGroupIDsByCapabilities endpoint: v2/storage/groups/client/${params.clientId}
  it('can fetch group IDs by capabilities', async () => {
    // Re-register clients
    writerClient = await ops.registerClient()
    readerClient = await ops.registerClient()

    // Create two groups
    const groupName1 = `testGroup1-${uuidv4()}`
    const groupName2 = `testGroup2-${uuidv4()}`
    const groupDescription =
      'this is a group meant to test fetchGroupIDsByCapabilities'

    const created1 = await ops.createGroup(
      writerClient,
      groupName1,
      groupDescription
    )
    const created2 = await ops.createGroup(
      writerClient,
      groupName2,
      groupDescription
    )

    // Add a member with specific capabilities to each group
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = [groupMember]

    await ops.addGroupMembers(
      writerClient,
      created1.group.groupID,
      groupMembersToAdd
    )
    await ops.addGroupMembers(
      writerClient,
      created2.group.groupID,
      groupMembersToAdd
    )

    // Call fetchGroupIDsByCapabilities
    const params = {
      clientId: readerClient.clientId,
      capabilities: ['READ_CONTENT', 'SHARE_CONTENT'],
      max: 10,
      nextToken: 0,
    }
    const result = await ops.fetchGroupIDsByCapabilities(writerClient, params)

    // Check the result
    expect(result).toHaveProperty('groups')
    expect(result.groups).toHaveLength(2)

    // Check the first group
    expect(result.groups[0]).toHaveProperty('capability', 'SHARE_CONTENT')
    expect(result.groups[0]).toHaveProperty('group_ids')
    expect(result.groups[0].group_ids).toHaveLength(2)
    expect(result.groups[0].group_ids).toContainEqual(created1.group.groupID)
    expect(result.groups[0].group_ids).toContainEqual(created2.group.groupID)

    // Check the second group
    expect(result.groups[1]).toHaveProperty('capability', 'READ_CONTENT')
    expect(result.groups[1]).toHaveProperty('group_ids')
    expect(result.groups[1].group_ids).toHaveLength(2)
    expect(result.groups[1].group_ids).toContainEqual(created1.group.groupID)
    expect(result.groups[1].group_ids).toContainEqual(created2.group.groupID)

    // Check next_token
    expect(result).toHaveProperty('next_token', 0)
  })

  // Test fetchClientGroupCapabilities endpoint: v2/storage/groups/capabilities/${params.clientID}
  it('can fetch client group capabilities as member in all groups', async () => {
    // Create three groups
    const groupName1 = `testGroup1-${uuidv4()}`
    const groupName2 = `testGroup2-${uuidv4()}`
    const groupName3 = `testGroup3-${uuidv4()}`
    const groupDescription =
      'this is a group meant to test fetchClientGroupCapabilities'

    const createdGroup1 = await ops.createGroup(
      writerClient,
      groupName1,
      groupDescription
    )
    const createdGroup2 = await ops.createGroup(
      writerClient,
      groupName2,
      groupDescription
    )
    const createdGroup3 = await ops.createGroup(
      readerClient, // create using reader client
      groupName3,
      groupDescription
    )

    // Add a member with specific capabilities to only groups 1 and 2
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = [groupMember]

    await ops.addGroupMembers(
      writerClient,
      createdGroup1.group.groupID,
      groupMembersToAdd
    )
    await ops.addGroupMembers(
      writerClient,
      createdGroup2.group.groupID,
      groupMembersToAdd
    )

    const params = {
      clientID: readerClient.clientId,
      groupIDs: [
        createdGroup1.group.groupID,
        createdGroup2.group.groupID,
        createdGroup3.group.groupID,
      ],
      max: 10,
      nextToken: 0,
    }

    // Call fetchClientGroupCapabilities using READER CLIENT
    const result = await ops.fetchClientGroupCapabilities(readerClient, params)

    // Validate results
    expect(result).toBeDefined()
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('next_token', 0)
    expect(Object.keys(result.results)).toHaveLength(3)

    // Group 1
    expect(result.results[createdGroup1.group.groupID]).toBeDefined()
    expect(result.results[createdGroup1.group.groupID]).toHaveLength(2)
    expect(result.results[createdGroup1.group.groupID]).toEqual(
      expect.arrayContaining(['READ_CONTENT', 'SHARE_CONTENT'])
    )
    // Group 3
    expect(result.results[createdGroup2.group.groupID]).toBeDefined()
    expect(result.results[createdGroup2.group.groupID]).toHaveLength(2)
    expect(result.results[createdGroup2.group.groupID]).toEqual(
      expect.arrayContaining(['READ_CONTENT', 'SHARE_CONTENT'])
    )
    // Group 3 
    expect(result.results[createdGroup3.group.groupID]).toBeDefined()
    expect(result.results[createdGroup3.group.groupID]).toHaveLength(1)
    expect(result.results[createdGroup3.group.groupID]).toEqual(
      expect.arrayContaining(['MANAGE_MEMBERSHIP'])
    )
  })

  // Test fetchClientGroupCapabilities endpoint: v2/storage/groups/capabilities/${params.clientID}
  it('can fetch client group capabilities as member in some groups', async () => {
    // Create 3 groups
    const groupName1 = `testGroup1-${uuidv4()}`
    const groupName2 = `testGroup2-${uuidv4()}`
    const groupName3 = `testGroup3-${uuidv4()}`
    const groupDescription =
      'this is a group meant to test fetchClientGroupCapabilities'

    const createdGroup1 = await ops.createGroup(
      writerClient,
      groupName1,
      groupDescription
    )
    const createdGroup2 = await ops.createGroup(
      writerClient,
      groupName2,
      groupDescription
    )
    const createdGroup3 = await ops.createGroup(
      readerClient, // create using reader client 
      groupName3,
      groupDescription
    )

    // Add a member with specific capabilities to only groups 1 and 2
    const groupMember = new GroupMember(readerClient.clientId, {
      read: true,
      share: true,
    })
    let groupMembersToAdd = [groupMember]

    await ops.addGroupMembers(
      writerClient,
      createdGroup1.group.groupID,
      groupMembersToAdd
    )
    await ops.addGroupMembers(
      writerClient,
      createdGroup2.group.groupID,
      groupMembersToAdd
    )

    // Call fetchGroupIDsByCapabilities
    const params = {
      clientID: readerClient.clientId,
      groupIDs: [
        createdGroup1.group.groupID,
        createdGroup2.group.groupID,
        createdGroup3.group.groupID,
      ],
      max: 10,
      nextToken: 0,
    }

    // Call fetchClientGroupCapabilities using WRITER CLIENT
    const result = await ops.fetchClientGroupCapabilities(writerClient, params)

    // Validate results
    expect(result).toBeDefined()
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('next_token', 0)
    expect(Object.keys(result.results)).toHaveLength(3)

    // Group 1
    expect(result.results[createdGroup1.group.groupID]).toBeDefined()
    expect(result.results[createdGroup1.group.groupID]).toHaveLength(2)
    expect(result.results[createdGroup1.group.groupID]).toEqual(
      expect.arrayContaining(['READ_CONTENT', 'SHARE_CONTENT'])
    )
    // Group 2
    expect(result.results[createdGroup2.group.groupID]).toBeDefined()
    expect(result.results[createdGroup2.group.groupID]).toHaveLength(2)
    expect(result.results[createdGroup2.group.groupID]).toEqual(
      expect.arrayContaining(['READ_CONTENT', 'SHARE_CONTENT'])
    )
    // Group 3, no result as writerClient is NOT a member of this group
    expect(result.results[createdGroup3.group.groupID]).toBeDefined()
    expect(result.results[createdGroup3.group.groupID]).toHaveLength(0)
    expect(result.results[createdGroup3.group.groupID]).toEqual([])
  })
})
