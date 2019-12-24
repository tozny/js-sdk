const { DEFAULT_API_URL } = require('../utils/constants')

/**
 * Configuration for communicating with the Tozny Identity service.
 */
class Config {
  /**
   * Create a new config object from a JSON string or JS object.
   *
   * If a string is passed, it is first parsed as JSON into an object.
   *
   * Camel case version of object keys are checked first. If the camel case version
   * of the configuration key is undefined, this method falls back to the snake case
   * version of the supported keys.
   *
   * @param {Object|string} obj A JSON string or javascript object containing identity configuration.
   *
   * @returns {Config} A new Config object based on the passed JS object or JSON string.
   */
  static fromObject(obj) {
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj)
      } catch (err) {
        throw new Error(
          'Config.fromObject param JSON string could not be parsed.'
        )
      }
    }
    const realmName = obj.realmName || obj.realm_name
    const appName = obj.appName || obj.app_name
    const username = obj.username
    const userId = obj.userId || obj.user_id
    const apiUrl = obj.apiUrl || obj.api_url
    const brokerTargetUrl = obj.brokerTargetUrl || obj.broker_target_url
    const firstName = obj.firstName || obj.first_name
    const lastName = obj.lastName || obj.last_name
    return new this(
      realmName,
      appName,
      apiUrl,
      username,
      userId,
      brokerTargetUrl,
      firstName,
      lastName
    )
  }

  /**
   * Create a new instance of Config
   *
   * @param {string} realmName       The realms globally unique name
   * @param {string} appName         The app identity will interact with.
   * @param {string} [apiUrl]        Optional base URL for the Tozny Platform API
   * @param {string} username        The user defined identifier for the user
   * @param {string} userId          A specific realm user's unique identifier
   * @param {string} brokerTargetUrl The URL which will process broker-based login flows.
   * @param {string} firstName       The user defined first name for the identity
   * @param {string} lastName        The user defined last name for the identity
   *
   * @returns {Config} The constructed Config object.
   */
  constructor(
    realmName,
    appName,
    apiUrl = DEFAULT_API_URL,
    username,
    userId,
    brokerTargetUrl,
    firstName,
    lastName
  ) {
    if (!realmName) {
      throw new Error(
        'Realm name is required to use Tozny Identity services. If you need to create a realm, visit the Tozny Dashboard.'
      )
    }
    if (!appName) {
      throw new Error(
        'App name is required to use Tozny Identity services. If you need to create an app, visit realm admin.'
      )
    }
    this.realmName = realmName
    this.appName = appName
    this.username = username
    this.userId = userId
    this.apiUrl = apiUrl
    this.brokerTargetUrl = brokerTargetUrl
    this.firstName = firstName
    this.lastName = lastName
  }
}

module.exports = Config
