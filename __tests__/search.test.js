const Tozny = require('../node')
const ops = require('./utils/operations')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
// let readerClient
let writer
let testRecords = []
const searchType = 'test-search-type'
beforeAll(async () => {
  writerClient = await ops.registerClient()
  // readerClient = await ops.registerClient()

  writer = new Tozny.storage.Client(
    Tozny.storage.Config.fromObject(writerClient)
  )
  // write test records
  for (let i = 0; i < 10; i++) {
    const data = { secret: `data-${i}` }
    const plain = { searchKey1: `key${i}`, searchKey2: `key${i}` }
    testRecords.push(await writer.writeRecord(searchType, data, plain))
  }
  // wait for records to be indexed
  for (let i = 0; i < 5; i++) {
    const request = new Tozny.types.Search()
    request.match({ type: searchType })
    const resultQuery = await writer.search(request)
    const found = await resultQuery.next()
    if (found.length < 1) {
      await new Promise(r => setTimeout(r, i * 1000))
      continue
    }
    break
  }
})

afterAll(async () => {
  // Clean up test records
  for (let record of testRecords) {
    await writer.deleteRecord(record.meta.recordId, record.meta.version)
  }
})

describe('Tozny storage clients', () => {
  it('can search for records they have written', async () => {
    const request = new Tozny.types.Search()
    request.match({ records: testRecords[0].meta.recordId })
    // const resultQuery = await ops.search(writerClient, request)
    // expect(found[0].meta).toMatchObject(testRecords[0].meta)
  })
})
