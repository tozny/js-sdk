const { IDENTITY_DERIVATION_ROUNDS } = require('./constants')

module.exports = {
  deriveNoteCreds,
}

/**
 * Derive the note name, crypto, and signing keys for an note containing identity credentials.
 *
 * @param {string} realmName The identity realm name.
 * @param {Crypto} crypto The concrete Tozny crypto implementation.
 * @param {string} username The username credentials are being derived for.
 * @param {*} password The secret password for the user.
 * @param {*} broker Whether the credentials are for a brokered note.
 */
async function deriveNoteCreds(
  realmName,
  crypto,
  username,
  password,
  broker = false
) {
  const nameSeed = broker
    ? `broker:${username}@realm:${realmName}`
    : `${username}@realm:${realmName}`
  const noteID = await crypto.hash(nameSeed)
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
  return { noteID, cryptoKeyPair, signingKeyPair }
}
