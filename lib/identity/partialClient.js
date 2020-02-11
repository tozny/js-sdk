const { deriveNoteCreds } = require('./shared')
const CryptoConsumer = require('../crypto/cryptoConsumer')

class PartialClient extends CryptoConsumer {
  constructor(config, storage) {
    super()
    // Construct this object.
    this.config = config
    this.storage = storage
    this._tokenInfo = false
  }

  serialize() {
    return {
      config: Object.assign({}, this.config),
      storage: this.storage.config.serialize(),
    }
  }

  serializeData() {
    return {
      config: JSON.stringify(this.config),
      storage: JSON.stringify(this.storage.config),
    }
  }

  stringify() {
    return JSON.stringify(this.serialize())
  }

  async changePassword(newPassword) {
    const newCreds = await deriveNoteCreds(
      this.config.realmName,
      this.crypto,
      this.config.username,
      newPassword
    )
    // Write new credentials (change password)
    /* eslint-disable camelcase */
    await this.storage.replaceNoteByName(
      this.serializeData(),
      newCreds.cryptoKeyPair.publicKey,
      newCreds.signingKeyPair.publicKey,
      {
        id_string: newCreds.noteName,
        max_views: -1,
        expires: false,
        eacp: {
          tozid_eacp: {
            realm_name: this.config.realmName,
          },
        },
      }
    )
    /* eslint-enable */
  }
}

module.exports = PartialClient
