const Tozny = require('../node')
const ops = require('./utils/operations')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
let readerClient
let writer
let testRecords = []
const searchType = 'test-search-type'
beforeAll(async () => {
  writerClient = await ops.registerClient()
  readerClient = await ops.registerClient()

  writer = new Tozny.storage.Client(
    Tozny.storage.Config.fromObject(writerClient)
  )
  // share the record type with the reader
  // writer.share(searchType, readerClient.clientId)
  // write test records
  for (let i = 0; i < 10; i++) {
    const data = { secret: `data-${i}` }
    const plain = { searchKey1: `key${i}`, searchKey2: `key${i}` }
    const written = await writer.writeRecord(searchType, data, plain)
    testRecords.push(written)
  }
  // wait for records to be indexed
  for (let i = 0; i < 10; i++) {
    const request = new Tozny.types.Search()
    request.match({ records: testRecords[0].meta.recordId })
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
    const found = await ops.search(writerClient, request)
    expect(found[0].meta).toMatchObject(testRecords[0].meta)
  })
  it('can include data in results', async () => {
    const request = new Tozny.types.Search(true)
    request.match({ records: testRecords[0].meta.recordId })
    const found = await ops.search(writerClient, request)
    expect(found[0].data.secret).toBe('data-0')
  })
  it('can search data it did not write as long as it is shared', async () => {
    const request = new Tozny.types.Search()
    request.match({ records: testRecords[0].meta.recordId })
    const found = await ops.search(readerClient, request)
    expect(found.length).toBe(0)
    const allRequest = new Tozny.types.Search(false, true)
    request.match({ records: testRecords[0].meta.recordId })
    const allFound = await ops.search(readerClient, allRequest)
    expect(allFound.length).toBe(1)
  })
  it('run a query with a next token', async () => {
    const request = new Tozny.types.Search(false, false, 1)
    request.match({ types: searchType })
    const response = await writer.search(request)
    const firstPage = await response.next()
    expect(firstPage.length).toBe(1)
    const envSecondPage = await ops.search(writerClient, response.request)
    expect(envSecondPage.length).toBe(1)
    const secondPage = await response.next()
    expect(envSecondPage).toMatchObject(secondPage)
  })
})
