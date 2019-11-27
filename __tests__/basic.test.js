const { runInEnvironment } = global
const Tozny = require('../node')

let tozny
beforeAll(async () => {
  tozny = 'hello world'
})

describe('Tozny', () => {
  it('runs code', async () => {
    const result = await runInEnvironment(function(tozny) {
      var mode = Tozny.crypto.mode()
      return tozny + ': ' + mode
    }, tozny)
    expect(result).toEqual('hello world: Sodium')
  })
})
