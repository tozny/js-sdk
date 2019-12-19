const { IDENTITY_DERIVATION_ROUNDS } = require('../utils/constants')

/**
 * Derive the note name, crypto, and signing keys for an note containing identity credentials.
 *
 * @param {string} realmName The identity realm name.
 * @param {Crypto} crypto The concrete Tozny crypto implementation.
 * @param {string} username The username credentials are being derived for.
 * @param {string} password The secret password for the user.
 * @param {string} credType The type of derived credentials for the note,
 *                          options are `password`, `email_otp`, and `tozny_otp`.
 */
async function deriveNoteCreds(
  realmName,
  crypto,
  username,
  password,
  credType = 'password'
) {
  username = username.toLowerCase()
  let nameSeed = `${username}@realm:${realmName}`
  switch (credType) {
    case 'email_otp':
      nameSeed = `broker:${nameSeed}`
      break
    case 'tozny_otp':
      nameSeed = `tozny_otp:${nameSeed}`
      break
    case 'password':
      break
    default:
      throw new Error(`An invalid credential type was provided ${credType}`)
  }
  const noteName = await crypto.hash(nameSeed)
  const cryptoKeyPair = await crypto.deriveCryptoKey(
    password,
    nameSeed,
    IDENTITY_DERIVATION_ROUNDS
  )
  const signingKeyPair = await crypto.deriveSigningKey(
    password,
    cryptoKeyPair.publicKey + cryptoKeyPair.privateKey,
    IDENTITY_DERIVATION_ROUNDS
  )
  return { noteName, cryptoKeyPair, signingKeyPair }
}

module.exports = {
  deriveNoteCreds,
}
