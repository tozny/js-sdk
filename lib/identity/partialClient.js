const { deriveNoteCreds, writePasswordNote } = require('./shared')
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
      config: this.config.serialize(),
      storage: this.storage.config.serialize(),
    }
  }

  serializeData() {
    return {
      config: JSON.stringify(this.config.serialize()),
      storage: JSON.stringify(this.storage.config.serialize()),
    }
  }

  stringify() {
    return JSON.stringify(this.serialize())
  }

  async changePassword(newPassword) {
    return writePasswordNote(this, newPassword, true)
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
      const response = await anonAuth.tsv1Fetch(
        `${this.config.apiUrl}/v2/storage/notes/challenge?id_string=${noteName}`,
        {
          method: 'PATCH',
          'Content-Type': 'application/json',
          body: JSON.stringify(body),
        }
      )
      await checkStatus(response)
      return {success: true}
    } catch (e) {
      let ret = {success: false, message: 'Something went wrong.'}
      if (!e.response) {
        return ret
      }
      switch (e.response.status) {
        case 401:
          ret.message = 'Current password is incorrect.'
          break
        case 417:
          ret.message = 'Your Identity is currently locked due to too many failed login attempts. Please try again later.'
      }
      return ret
    }
  }

  async updatePassword(currentPassword, newPassword) {
    const valid = await this.validatePassword(currentPassword)
    if (!valid.success) {
      throw new Error(valid.message)
    }
    return this.changePassword(newPassword)
  }
}

module.exports = PartialClient
