/**
 * Creates an email address to use in the test environment.
 * @param {string} suffix
 * @returns {string}
 */
function testEmail(suffix) {
  return `test-emails-group+${suffix}@tozny.com`
}

module.exports = {
  testEmail,
}
