/*
 * Functions and configuration for Selenium webdriver clients.
 */

const { Builder } = require('selenium-webdriver')
const path = require('path')

/* The webdriver browser configuration to use for the test execution runtime */
const TestBrowser = process.env.TEST_BROWSER
/* Configuration for remote selenium test server */
const TestBrowserPlatform = process.env.TEST_BROWSER_PLATFORM
const TestBrowserVersion = process.env.TEST_BROWSER_VERSION
const TestRemoteUsername = process.env.TEST_REMOTE_USERNAME
const TestRemotePassword = process.env.TEST_REMOTE_PASSWORD
// Support the Travis testing environment
let TestRemoteBranch
if (
  process.env.TRAVIS === 'true' &&
  process.env.TRAVIS_PULL_REQUEST_BRANCH !== 'false'
) {
  TestRemoteBranch = process.env.TRAVIS_PULL_REQUEST_BRANCH
} else if (process.env.TRAVIS === 'true' && process.env.TRAVIS_BRANCH) {
  TestRemoteBranch = process.env.TRAVIS_BRANCH
} else {
  TestRemoteBranch = process.env.TEST_REMOTE_BRANCH
}

/* Max wait between test actions */
const TestIdleTimeoutMilliseconds = parseInt(
  process.env.TEST_IDLE_TIMEOUT_MILLISECONDS,
  10
)
const TestEnvironment = process.env.TEST_ENVIRONMENT
const TestLocalUseProd = process.env.TEST_LOCAL_USE_PROD
const TestLocalUseCDN = process.env.TEST_LOCAL_USE_CDN
/* Continuous Integration / Build Server Execution UID */
const TestBuildNumber = `#${process.env.TRAVIS_JOB_NUMBER}` || 'Local'

/* TestDriver initialize a webdriver client as specified by environment variables
 * and it's session (if a remote client) for use in a Selenium based automated browser test function.
 * @param env {string} - The test environment(remote or local) to construct the webdriver client for use.
 */
async function getDriver() {
  let builder
  if (TestEnvironment === 'remote') {
    /* https://wiki.saucelabs.com/display/DOCS/Node.js+Test+Setup+Example */
    /* https://saucelabs.com/blog/repost-testing-in-a-real-browser-with-sauce-labs-travis-ci */
    let server = 'https://ondemand.saucelabs.com/wd/hub'
    let capabilities = {
      browserName: TestBrowser,
      platformName: TestBrowserPlatform,
      browserVersion: TestBrowserVersion,
      'sauce:options': {
        build: 'JS SDK Test Suite',
        name: `SDK Automated Test From ${TestBuildNumber}`,
        maxDuration: 3600,
        idleTimeout: TestIdleTimeoutMilliseconds,
      },
    }
    if (process.env.TRAVIS) {
      server = `http://${process.env.SAUCE_USERNAME}:${process.env.SAUCE_ACCESS_KEY}@ondemand.saucelabs.com:80/wd/hub`
      capabilities['tunnel-identifier'] = process.env.TRAVIS_JOB_NUMBER
      capabilities.username = process.env.SAUCE_USERNAME
      capabilities.accessKey = process.env.SAUCE_ACCESS_KEY
    } else {
      capabilities['sauce:options'].username = TestRemoteUsername
      capabilities['sauce:options'].accessKey = TestRemotePassword
    }

    builder = await new Builder()
      .withCapabilities(capabilities)
      .usingServer(server)
  } // By default create a webdriver client for use against a local selenium server
  else {
    builder = await new Builder().forBrowser(TestBrowser)
  }
  const server = builder.getServerUrl()
  const driver = builder.build()
  const session = await driver.getSession()
  const sessionId = session.getId()
  const capabilities = session.getCapabilities()
  const browser = capabilities.get('browserName')
  const serializedCapabilities = {}
  const capabilityKeys = capabilities.keys()
  for (let key of capabilityKeys) {
    serializedCapabilities[key] = capabilities.get(key)
  }
  const existingSession = {
    browser: browser,
    server: server,
    id: sessionId,
    capabilities: serializedCapabilities,
  }
  process.env.__EXISTING_SELENIUM_SESSION = JSON.stringify(existingSession)
  return driver
}

async function configure(driver) {
  let testEnvironment
  if (TestEnvironment === 'remote' || TestLocalUseCDN) {
    testEnvironment = `https://raw.githack.com/tozny/js-sdk/${TestRemoteBranch}/dist/test.html`
  } else {
    const suffix = TestLocalUseProd ? 'html' : 'dev.html'
    const filename = path.resolve(__dirname, `../../dist/test.${suffix}`)
    testEnvironment = `file:///${filename}`
  }
  await driver.get(testEnvironment)
}

function executeSeleniumScript(func, args, done) {
  return new Promise(function(resolve) {
    // Wrapping this in an immediately executing function ensures we don't
    // pollute the browser's global scope with intermediate variables.
    ;(function() {
      var executable = new Function(
        'return (' + func + ').apply(null, arguments);'
      )
      resolve(executable.apply(null, args))
    })()
  }).then(done)
}

let driver

module.exports = {
  async setup() {
    driver = await getDriver()
    await configure(driver)
  },
  async teardown() {
    await driver.quit()
  },
  async run(func, ...args) {
    return driver.executeAsyncScript(executeSeleniumScript, func, args)
  },
}
