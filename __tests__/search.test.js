const Tozny = require('../node')
const ops = require('./utils/operations')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
let readerClient
let writer
let testRecords = []
const searchType = 'test-search-type'
const testExecutionStartDatetime = new Date()
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
  const request = new Tozny.types.Search()
  request.match({ records: testRecords[0].meta.recordId })
  const resultQuery = await writer.search(request)
  await ops.waitForNext(resultQuery, (f) => f.length === 10)
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
  it('can search for records using plain search term', async () => {
    const request = new Tozny.types.Search()
    request.match({ plain: { searchKey1: 'key1' } })
    const found = await ops.search(writerClient, request)
    expect(found.length).toBe(1)
  })
  it('returns no results using a non existent plain search term', async () => {
    const request = new Tozny.types.Search()
    request.match({ plain: { x: 'q' } })
    const found = await ops.search(writerClient, request)
    expect(found.length).toBe(0)
  })
  it('can search for records using time ranges', async () => {
    let request = new Tozny.types.Search()
    request.match({ type: [searchType] })
    let end_time = new Date()
    request.range(testExecutionStartDatetime, end_time, 'CREATED')
    const found = await ops.search(writerClient, request)
    expect(found.length).toBe(testRecords.length)
  })
  it('returns no records for time range with no records', async () => {
    let request = new Tozny.types.Search()
    request.match({ type: [searchType] })
    // Calculate start time = now + 5 minutes
    let start_time = new Date()
    start_time = new Date(start_time.getTime() + 5 * 60000)
    // Calculate end time = start time + 5 minutes
    const end_time = new Date(start_time.getTime() + 5 * 60000)
    // Search for records created in the future
    request.range(start_time, end_time, 'CREATED')
    const found = await ops.search(writerClient, request)
    // Unless we added pre-cognition to search....
    expect(found.length).toBe(0)
  })
})
