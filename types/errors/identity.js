const { RequestError, GeneralError } = require('./general')


/**
 * Indicates that the identity is locked
 */
 class IdentityLockedError extends RequestError {
  constructor(...params) {
    super(...params)

    this.name = 'IdentityLockedError'
  }
}

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
 * Indicates an error in realm configuration is present
 */
class RealmConfigurationError extends GeneralError {
  constructor(...params) {
    super(...params)

    this.name = 'RealmConfigurationError'
  }
}

/**
 * Indicates the current session is expired and a new one must be established
 */
class SessionExpiredError extends GeneralError {
  constructor(...params) {
    super(...params)

    this.name = 'SessionExpiredError'
  }
}

module.exports = {
  IdentityLockedError,
  InvalidCredentials,
  CredentialNoteError,
  CredentialDataError,
  RealmConfigurationError,
  SessionExpiredError,
}
