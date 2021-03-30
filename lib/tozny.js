const Crypto = require('./crypto/crypto')
const Identity = require('./identity')
const Storage = require('./storage')
const types = require('../types')

class Tozny {
  constructor(cryptoProvider, platform, fileOperations, helpers = {}) {
    this.crypto = new Crypto(cryptoProvider, platform)
    this.storage = new Storage(this.crypto, fileOperations)
    this.identity = new Identity(this.crypto, this.storage)
    this.types = types
    this.helpers = helpers
  }

  /**
   * Extend this Tozny instance with additional functionality defined in an extension class
   *
   * The class constructor will receive the tozny instance and the provided options so that it can
   * set itself up. The extension is available at the 'extensionName' defined by the extension, but
   * can be overridden by when adding the extension by passing in an 'alias' in the options object.
   *
   * If not alias is provided, and the extension does not define an 'extensionName' then the extension
   * is available using the name of the extension class.
   *
   * @param {function} extension The class constructor for the extension
   * @param {object} options Optional. The options to configure the extension
   *
   * @returns Tozny The Tozny instance is returned to allow chaining
   */
  extend(extension, options = {}) {
    if (typeof extension !== 'function') {
      throw new Error(
        'Tozny extensions must be class definitions or constructor functions'
      )
    }
    if (!extension.extensionName && !extension.name) {
      throw new Error(
        'Tozny extensions must have a name or extensionName to get added to the Tozny instance'
      )
    }
    const name = options.alias || extension.extensionName || extension.name
    if (this[name] !== undefined) {
      throw new Error(
        `The name "${name}" is internal or has been used by a different extension, please use an alias or rename the extension`
      )
    }
    this[name] = new extension(this, options)
    // Allow chaining
    return this
  }
}

module.exports = Tozny
