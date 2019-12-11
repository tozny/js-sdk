/**
 * This runner is specifically to help with browsers running local tests which
 * are unable to run tests in parallel. This currently includes safari and edge.
 *
 * If the tests are not run serially the tests just fail outright because the
 * default runner attempts to open a session and is unable to.
 */

require('dotenv').config()

const TestRunner = require('jest-runner')

const TestBrowser = process.env.TEST_BROWSER
const TestEnvironment = process.env.TEST_ENVIRONMENT

class BrowserRunner extends TestRunner {
  constructor(...attr) {
    super(...attr)
    if (
      TestEnvironment !== 'remote' &&
      (TestBrowser === 'safari' || TestBrowser === 'edge')
    ) {
      this.isSerial = true
    }
  }
}

module.exports = BrowserRunner
