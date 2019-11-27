module.exports = {
  checkStatus,
  validateResponseAsJSON,
  urlEncodeData,
  trimSlash,
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

  const error = new Error(response.statusText)
  error.response = response
  throw error
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
 * Trim the trailing slash from a string to help enforce url consistency.
 *
 * @param {string} path The input string to trim the trailing slash from
 *
 * @return {string} The string with any trailing slash removed
 */
function trimSlash(str) {
  return str.replace(/\/$/, '')
}
