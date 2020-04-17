const { RequestError, GeneralError } = require('./general')

/**
 * Indicates the provided credentials were invalid
 */
class InvalidCredentials extends RequestError {
  constructor(...params) {
    super(...params)

    this.name = 'InvalidCredentials'
  }
}

/**
 * Surrounding requests worked, but the credential note was not fetched.
 */
class CredentialNoteError extends RequestError {
  constructor(...params) {
    super(...params)

    this.name = 'CredentialNoteError'
  }
}

/**
 * Wraps an error in decoding serialized identity data stored in a note
 */
class CredentialDataError extends GeneralError {
  constructor(...params) {
    super(...params)

    this.name = 'CredentialDataError'
  }
}

/**
 * Wraps an error in decoding serialized identity data stored in a note
 */
class RealmConfigurationError extends GeneralError {
  constructor(...params) {
    super(...params)

    this.name = 'RealmConfigurationError'
  }
}

module.exports = {
  InvalidCredentials,
  CredentialNoteError,
  CredentialDataError,
  RealmConfigurationError,
}
