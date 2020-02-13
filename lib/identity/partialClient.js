const { deriveNoteCreds } = require('./shared')
const CryptoConsumer = require('../crypto/cryptoConsumer')
const AuthenticatedRequest = require('../request/authenticatedRequest')
const { checkStatus } = require('../utils')

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

  async validatePassword(password) {
    try {
      const { noteName, signingKeyPair } = await deriveNoteCreds(
        this.config.realmName,
        this.storage.crypto,
        this.config.username,
        password,
        'password'
      )
      let anonAuth = await AuthenticatedRequest.anonymousAuth(
        this.crypto,
        signingKeyPair.publicKey,
        signingKeyPair.privateKey,
        this.apiUrl
      )
      const body = {
        tozid_eacp: {
          expiry_seconds: 1,
        },
      }
      const request = await anonAuth.tsv1Fetch(
        `${this.config.apiUrl}/v2/storage/notes/challenge?id_string=${noteName}`,
        {
          method: 'PATCH',
          'Content-Type': 'application/json',
          body: JSON.stringify(body),
        }
      )
      await checkStatus(request)
      return true
    } catch (_) {
      return false
    }
  }

  async updatePassword(currentPassword, newPassword) {
    const valid = await this.validatePassword(currentPassword)
    if (!valid) {
      throw new Error('Your current password is not correct.')
    }
    return this.changePassword(newPassword)
  }
}

module.exports = PartialClient
