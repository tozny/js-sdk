require('dotenv').config()
const path = require('path')
const NodeEnvironment = require('jest-environment-node')
const testTarget = process.env.TEST_TARGET
const clientRegistrationToken = process.env.CLIENT_REGISTRATION_TOKEN
const idRealmName = process.env.ID_REALM_NAME
const idAppName = process.env.ID_APP_NAME
const apiUrl = process.env.API_URL || 'https://api.e3db.com'
const testGroupID = process.env.TEST_TOZID_GROUP_ID

class Environment extends NodeEnvironment {
  constructor(config, options) {
    super(config, options)
    switch (testTarget) {
      case 'browser':
        this.environment = require('./browser')
        break
      default:
        this.environment = require('./node')
        break
    }
    this.success = true
    this.testPath = path.basename(options.testPath)
  }

  async setup() {
    await super.setup()
    await this.environment.setup(this.testPath)
    // Environment run method
    this.global.runInEnvironment = this.environment.run
    // Configuration the API
    this.global.apiUrl = apiUrl
    this.global.clientRegistrationToken = clientRegistrationToken
    this.global.idRealmName = idRealmName
    this.global.idAppName = idAppName
    this.global.testTozIDGroupName = testGroupID

    // Fix issue where type checks fail on native array buffer types
    // https://github.com/facebook/jest/pull/4423/files
    this.global.ArrayBuffer = ArrayBuffer
    this.global.Uint8Array = Uint8Array
  }

  async teardown() {
    delete this.global.runInEnvironment
    await this.environment.teardown(this.success)
    await super.teardown()
  }

  async handleTestEvent(event) {
    if (event.name === 'test_fn_failure') {
      this.success = false
    }
  }
}

module.exports = Environment
