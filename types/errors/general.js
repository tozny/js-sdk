/**
 * Makes sure stack traces remain consistent in Chrome.
 */
class GeneralError extends Error {
  constructor(...params) {
    super(...params)

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    this.name = 'GeneralError'
  }
}

class RequestError extends GeneralError {
  constructor(response, ...params) {
    super(...params)

    this.name = 'RequestError'
    this.response = response
  }
}

/**
 * Indicates that too may requests have been sent
 */
class TooManyRequestsError extends RequestError {
  constructor(...params) {
    super(...params)

    this.name = 'TooManyRequestsError'
  }
}

module.exports = {
  GeneralError,
  RequestError,
  TooManyRequestsError,
}
