const errors = require('../../types/errors')

module.exports = {
  checkStatus,
  validateResponseAsJSON,
  credentialedDecodeResponse,
  credentialNoteCall,
  urlEncodeData,
  urlEncodeDataV2,
  trimSlash,
  isValidToznySecretNamespace,
}

/**
 * Check the return status of a fetch request and throw an error if one occurred
 *
 * @param {Response} response
 *
 * @returns {Promise}
 */
async function checkStatus(response) {
  if (response.ok) {
    return Promise.resolve(response)
  }

  const statusTexts = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    // Add more status codes and default texts as needed
  };

  if(response.statusText == ''){
    response.statusText = statusTexts[response.status];
  }

  throw new errors.general.RequestError(response, response.statusText)
}

/**
 * Check the return status of a fetch and then parse return the body parsed as JSON.
 *
 * Throws an error if one has occurred in the fetch or the parse.
 *
 * @param {Response} response the fetch response object to check and parse
 *
 * @returns {Promise<Object>} A promise resolving to the JSON object contained in the response.
 */
async function validateResponseAsJSON(response) {
  await checkStatus(response)
  const json = await response.json()
  return json
}

/**
 * URL encode an object for use as in an x-www-form-urlencoded body
 *
 * @param {Object} data The date to encode as form data
 *
 * @returns {string} The data as a URL encoded string for use in the body
 */
function urlEncodeData(element, key, processed = []) {
  if (typeof element === 'object') {
    for (let i in element) {
      // eslint-disable-next-line no-prototype-builtins
      if (element.hasOwnProperty(i)) {
        urlEncodeData(element[i], key ? `${key}[${i}]` : i, processed)
      }
    }
  } else {
    processed.push(`${key}=${encodeURIComponent(element)}`)
  }
  return processed.join('&')
}

/**
 * URL encode an object for use as in an x-www-form-urlencoded body
 * This properly encodes an array for use as a query param, without including the index.
 *
 * @param {Object} data The date to encode as form data
 *
 * @returns {string} The data as a URL encoded string for use in the body
 */
function urlEncodeDataV2(element, key, processed = []) {
  if (typeof element === 'object') {
    for (let i in element) {
      // eslint-disable-next-line no-prototype-builtins
      if (element.hasOwnProperty(i)) {
        urlEncodeDataV2(element[i], key ? `${key}` : i, processed)
      }
    }
  } else {
    processed.push(`${key}=${encodeURIComponent(element)}`)
  }

  return processed.join('&')
}

/**
 * Trim the trailing slash from a string to help enforce url consistency.
 *
 * @param {string} path The input string to trim the trailing slash from
 *
 * @return {string} The string with any trailing slash removed
 */
function trimSlash(str) {
  return str.replace(/\/$/, '')
}

/**
 * Map a request error to an identity credentials invalid error on 401 status.
 *
 * @param {Response} response The request response to the auth service.
 *
 * @return {Promise<Object>} A promise containing the decoded response if no error.
 */
async function credentialedDecodeResponse(response) {
  try {
    const decoded = await validateResponseAsJSON(response)
    return decoded
  } catch (e) {
    switch (e.response.status) {
      case 401:
        // If we received unauthorized, map it to an invalid credentials error.
        throw new errors.identity.InvalidCredentials(e.response, e.message)
      case 417:
        // If we received expectation failed, map it to an identity locked error.
        throw new errors.identity.IdentityLockedError(e.response, e.message)
      case 406:
        throw new errors.identity.ClockDriftError(e.response, e.message)
      case 429:
        throw new errors.general.TooManyRequestsError(e.response, e.message)
      default:
        throw e
    }
  }
}

/**
 * If a credential note fetch fails, map it to a credential note error.
 *
 * @param {Promise<Note>} note The promise returned from the read not call.
 *
 * @return {Promise<Note>} The note promise, returned only if it doesn't throw.
 */
async function credentialNoteCall(note) {
  try {
    const fetched = await note
    return fetched
  } catch (e) {
    if (e instanceof errors.general.RequestError) {
      throw new errors.identity.CredentialNoteError(e.response, e.message)
    }
    throw e
  }
}

/**
 * isValidToznySecretNamespace
 * @param {Object} groupName
 * @return {Boolean} returns true if the secret was successfully removed
 */
async function isValidToznySecretNamespace(groupName) {
  var groupNameSplit = groupName.split('.')
  if (
    groupNameSplit.length < 2 ||
    groupNameSplit[0] != 'tozny' ||
    groupNameSplit[1] != 'secret'
  ) {
    return false
  }
  return true
}
