const { base64url } = require('rfc4648')
const Serializable = require('./serializable')

class InitiateWebAuthnChallengeData extends Serializable {
  /**
   * @param {string} tabId a tab id string from the server that corresponds to the session that initiated the challenge
   * @param {object} challengeData the challenge data
   * @param {string} challengeData.challenge
   * @param {string} challengeData.rpId
   * @param {string} challengeData.rpEntityName
   * @param {string} challengeData.signatureAlgorithms
   * @param {string} challengeData.userid
   * @param {string} challengeData.username
   * @param {string} challengeData.attestationConveyancePreference
   * @param {string} challengeData.authenticatorAttachment
   * @param {string} challengeData.requireResidentKey
   * @param {string} challengeData.userVerificationRequirement
   * @param {number} challengeData.createTimeout
   * @param {string} challengeData.excludeCredentialIds
   */
  constructor(tabId, challengeData) {
    super()
    this.tabId = tabId
    this.challengeData = challengeData
  }

  serializable() {
    let login_context = {
      challenge: this.login_context.challenge,
      username: this.login_context.username,
      user_id: this.login_context.userid,
      attestation_conveyance_preference:
        this.login_context.attestationConveyancePreference,
      authenticator_attachment: this.login_context.authenticatorAttachment,
      exclude_credential_ids: this.login_context.excludeCredentialIds,
      require_resident_key: this.login_context.requireResidentKey,
      signature_algorithms: this.login_context.signatureAlgorithms,
      relying_party_id: this.login_context.rpId,
      relying_party_name: this.login_context.rpEntityName,
      user_verification_requirement:
        this.login_context.userVerificationRequirement,
      create_timeout: this.login_context.createTimeout,
    }

    return { tab_id: this.tab_id, login_context }
  }

  /**
   * example json:
   * {
   *   "tab_id": "suXnLMlUbNc",
   *   "login_context": {
   *     "challenge": "P0yk9VBLR6u7ZzpMM6nczg",
   *     "username": "test-emails-group+webauth-init-test@tozny.com",
   *     "user_id": "OTgxNDY0NWMtZDIwMS00MmRiLWFkYzItZjU4Y2EzZTU0MGEy",
   *     "attestation_conveyance_preference": "not specified",
   *     "authenticator_attachment": "not specified",
   *     "exclude_credential_ids": "",
   *     "require_resident_key": "not specified",
   *     "signature_algorithms": "-7",
   *     "relying_party_id": "id.tozny.com",
   *     "relying_party_name": "tozny",
   *     "user_verification_requirement": "not specified",
   *     "create_timeout": 0
   *   }
   * }
   */
  static decode(json) {
    const challengeData = {
      challenge: json.login_context.challenge,
      username: json.login_context.username,
      userid: json.login_context.user_id,
      attestationConveyancePreference:
        json.login_context.attestation_conveyance_preference,
      authenticatorAttachment: json.login_context.authenticator_attachment,
      excludeCredentialIds: json.login_context.exclude_credential_ids,
      requireResidentKey: json.login_context.require_resident_key,
      signatureAlgorithms: json.login_context.signature_algorithms,
      rpId: json.login_context.relying_party_id,
      rpEntityName: json.login_context.relying_party_name,
      userVerificationRequirement:
        json.login_context.user_verification_requirement,
      createTimeout: json.login_context.create_timeout,
    }

    return new InitiateWebAuthnChallengeData(json.tab_id, challengeData)
  }

  /**
   * converts the challenge data into the object passed to `navigator.credentials.create` API
   * inspired by https://github.com/keycloak/keycloak/blob/e23969/themes/src/main/resources/theme/base/login/webauthn-register.ftl#L24
   */
  toPublicKeyCredentialCreationOptions() {
    const {
      challenge,
      rpEntityName,
      rpId,
      signatureAlgorithms,
      userid,
      username,
      // optional parameters
      attestationConveyancePreference,
      authenticatorAttachment,
      requireResidentKey,
      userVerificationRequirement,
      createTimeout,
      excludeCredentialIds,
    } = this.challengeData

    const publicKey = {
      challenge: base64url.parse(challenge, { loose: true }),
      rp: { id: rpId, name: rpEntityName },
      user: {
        id: base64url.parse(userid, { loose: true }),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: getPubKeyCredParams(signatureAlgorithms),
    }

    // handle optional parameters for future-proofing webauthn policy changes
    if (attestationConveyancePreference !== 'not specified')
      publicKey.attestation = attestationConveyancePreference

    let authenticatorSelection = {}
    let isAuthenticatorSelectionSpecified = false

    if (authenticatorAttachment !== 'not specified') {
      authenticatorSelection.authenticatorAttachment = authenticatorAttachment
      isAuthenticatorSelectionSpecified = true
    }

    if (requireResidentKey !== 'not specified') {
      if (requireResidentKey === 'Yes')
        authenticatorSelection.requireResidentKey = true
      else authenticatorSelection.requireResidentKey = false
      isAuthenticatorSelectionSpecified = true
    }

    if (userVerificationRequirement !== 'not specified') {
      authenticatorSelection.userVerification = userVerificationRequirement
      isAuthenticatorSelectionSpecified = true
    }

    if (isAuthenticatorSelectionSpecified)
      publicKey.authenticatorSelection = authenticatorSelection

    if (createTimeout != 0) publicKey.timeout = createTimeout * 1000

    const excludeCredentials = getExcludeCredentials(excludeCredentialIds)
    if (excludeCredentials.length > 0)
      publicKey.excludeCredentials = excludeCredentials

    return publicKey
  }

  /**
   * This helper function is used to convert the registration data from a hardware security key into
   * the structure & encoding used by Tozny's WebAuthn registration API.
   * @param {PublicKeyCredential} publicKeyCredential this is the response from a call to `navigator.credentials.create`
   * @param {string} deviceName a name for this device.
   */
  static convertPublicKeyCredentialToRegistrationData(
    publicKeyCredential,
    deviceName
  ) {
    return {
      client_data_json: b64urlEncode(
        publicKeyCredential.response.clientDataJSON
      ),
      attestation_object: b64urlEncode(
        publicKeyCredential.response.attestationObject
      ),
      public_key_credential_id: b64urlEncode(publicKeyCredential.rawId),
      authenticator_label: deviceName,
    }
  }
}

// https://github.com/keycloak/keycloak/blob/e23969/themes/src/main/resources/theme/base/login/webauthn-register.ftl#L113
function getPubKeyCredParams(signatureAlgorithms) {
  const pubKeyCredParams = []
  if (signatureAlgorithms === '') {
    pubKeyCredParams.push({ type: 'public-key', alg: -7 })
    return pubKeyCredParams
  }
  const signatureAlgorithmsList = signatureAlgorithms.split(',')

  for (let i = 0; i < signatureAlgorithmsList.length; i++) {
    pubKeyCredParams.push({
      type: 'public-key',
      alg: signatureAlgorithmsList[i],
    })
  }
  return pubKeyCredParams
}

// https://github.com/keycloak/keycloak/blob/e23969/themes/src/main/resources/theme/base/login/webauthn-register.ftl#L130
function getExcludeCredentials(excludeCredentialIds) {
  let excludeCredentials = []
  if (excludeCredentialIds === '') return excludeCredentials

  let excludeCredentialIdsList = excludeCredentialIds.split(',')

  for (let i = 0; i < excludeCredentialIdsList.length; i++) {
    excludeCredentials.push({
      type: 'public-key',
      id: Buffer.from(excludeCredentialIdsList[i], 'base64'),
    })
  }
  return excludeCredentials
}

/**
 * converts a string to a base64url encoded string of the byte array
 * a helper func for webauthn registration data construction.
 */
function b64urlEncode(str) {
  const bytes = new Uint8Array(str)
  return base64url.stringify(bytes)
}

module.exports = InitiateWebAuthnChallengeData
