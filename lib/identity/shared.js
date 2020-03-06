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

/**
 * Write the note required for a password based login
 *
 * @param {Client} user A partial identity client to write a login note for
 * @param {string} password The password use when fetching the login note
 * @param {*} replace Whether to write a new note, or replace an existing one
 */
async function writePasswordNote(user, password, replace = false) {
  const method = replace ? 'replaceNoteByName' : 'writeNote'
  const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
    user.config.realmName,
    user.crypto,
    user.config.username,
    password
  )
  return user.storage[method](
    user.serializeData(),
    cryptoKeyPair.publicKey,
    signingKeyPair.publicKey,
    {
      id_string: noteName,
      max_views: -1,
      expires: false,
      eacp: {
        tozid_eacp: {
          realm_name: user.config.realmName,
        },
      },
    }
  )
}

/**
 * Write the notes required for a brokered login.
 *
 * @param {Client} user A partial identity client to write broker login notes for
 * @param {string} email The email address for the user, for email recovery
 * @param {string} brokerId The UUID of the broker storage client of this realm
 * @param {boolean} replace Whether to replace the note, or write a new one
 * @param {number} expMinutes The number of minutes before the reset link expires
 */
async function writeBrokerNotes(
  user,
  email,
  brokerId,
  replace = false,
  expMinutes = 60
) {
  // If there is no broker, do not try to write broker notes
  // otherwise, get the broker's info
  if (!brokerId || brokerId === '00000000-0000-0000-0000-000000000000') {
    return
  }
  const brokerInfo = await user.storage.clientInfo(brokerId)
  // Switch the method run to allow writes and updates
  const method = replace ? 'replaceNoteByName' : 'writeNote'
  // Set up meta options
  const emailRecoveryOptions = {
    keyName: 'brokerKey',
    keyType: 'email_otp',
    eacp: {
      email_eacp: {
        email_address: email,
        template: 'claim_account',
        provider_link: user.config.brokerTargetUrl,
        default_expiration_minutes: expMinutes,
      },
    },
  }
  if (
    user.config.firstName !== undefined ||
    user.config.lastName !== undefined
  ) {
    emailRecoveryOptions.eacp.email_eacp.name = [
      user.config.firstName,
      user.config.lastName,
    ]
      .filter(n => n !== undefined)
      .join(' ')
  }
  const toznyOTPOptions = {
    keyName: 'broker_otp',
    keyType: 'tozny_otp',
    eacp: {
      tozny_otp_eacp: {
        include: true,
      },
    },
  }
  // Write the notes
  return Promise.all(
    [emailRecoveryOptions, toznyOTPOptions].map(async options => {
      const keyNoteName = await user.crypto.hash(
        `${options.keyName}:${user.config.username}@realm:${user.config.realmName}`
      )
      const keyBytes = await user.crypto.randomBytes(64)
      const key = await user.crypto.platform.b64URLEncode(keyBytes)
      const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
        user.config.realmName,
        user.crypto,
        user.config.username,
        key,
        options.keyType
      )
      const meta = {
        id_string: keyNoteName,
        max_views: -1,
        expires: false,
        eacp: options.eacp,
      }
      const keyNote = await user.storage[method](
        { broker_key: key, username: user.config.username },
        brokerInfo.publicKey.curve25519,
        brokerInfo.signingKey.ed25519,
        meta
      )
      return user.storage[method](
        user.serializeData(),
        cryptoKeyPair.publicKey,
        signingKeyPair.publicKey,
        {
          id_string: noteName,
          max_views: -1,
          expires: false,
          eacp: {
            last_access_eacp: {
              last_read_note_id: keyNote.noteId,
            },
          },
        }
      )
    })
  )
}

module.exports = {
  deriveNoteCreds,
  writePasswordNote,
  writeBrokerNotes,
}
