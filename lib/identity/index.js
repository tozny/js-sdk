const RealmBase = require('./realm')
const PartialClientBase = require('./paritalClient')
const ClientBase = require('./client')
const Config = require('./config')
const Crypto = require('../crypto/crypto')
const Storage = require('../storage')

/**
 * Identity represents a connection to the Tozny Identity service on behalf of a realm.
 *
 * Before registration, login, or other client creation methods are possible, the configuration
 * for a Tozny Identity realm is needed. Identity holds this configuration and provides methods
 * for all pre-client operations. In other words, the methods this object make identity clients
 * for users that belong to the configured realm. It helps authenticate users.
 */
class Identity {
  constructor(crypto, storage) {
    if (!(crypto instanceof Crypto)) {
      throw new Error(
        'To create an identity object you must provide a valid crypto instance.'
      )
    }
    if (!(storage instanceof Storage)) {
      throw new Error(
        'To create an identity object you must provide a valid storage instance.'
      )
    }
    const clientConstructor = class Client extends ClientBase {
      static get crypto() {
        return crypto
      }
    }

    const partialClientConstructor = class PartialClient extends PartialClientBase {
      static get crypto() {
        return crypto
      }
    }
    this.Realm = class Realm extends RealmBase {
      static get crypto() {
        return crypto
      }
      static get Client() {
        return clientConstructor
      }
      static get PartialClient() {
        return partialClientConstructor
      }
      static get storage() {
        return storage
      }
    }
    this.Client = clientConstructor
    this.Config = Config
    this.crypto = crypto
  }
}

module.exports = Identity
