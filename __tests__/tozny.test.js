const ops = require('./utils/operations')
const { v4: uuidv4 } = require('uuid')

// Set really high for slower browser runs.
jest.setTimeout(100000)

describe('Tozny instances', () => {
  it('can add a basic extension', async () => {
    const name = uuidv4()
    const testValue = { option: uuidv4() }
    const testMethod = function () {
      return this.options
    }
    const receivedValue = await ops.testExtension(name, testValue, testMethod)
    expect(receivedValue.option).toBe(testValue.option)
  })
})
