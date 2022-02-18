const Serializable = require('./serializable')

/**
 * @typedef MFADevice
 * @type {object}
 * @property {string} id id of the MFA device
 * @property {string} type they type of MFA device ("totp" or "webauthn")
 * @property {string} userLabel the user-friendly name given to the device
 * @property {string} createdAt a string representation of the creation time of the MFA device.
 */

/**
 * @typedef MFADevices
 * @type {object}
 * @property {MFADevice[]} totp The timed one-time password device(s) registered to the identity.
 * @property {MFADevice[]} webauthn The WebAuthn/FIDO2 devices registered to the identity.
 */

class IdentityMFADevices extends Serializable {
  /**
   * @param {string} toznyId The identity's Tozny storage client ID
   * @param {string} userId The identity's user ID
   * @param {MFADevices} mfaDevices An object containing the different types of MFA devices the of the user.
   */
  constructor(toznyId, userId, mfaDevices) {
    super()
    /** @type {string} The identity's Tozny storage client ID */
    this.toznyId = toznyId
    /** @type {string} The identity's user ID */
    this.userId = userId
    /** @type {MFADevices} An object containing the different types of MFA devices the of the user. */
    this.mfaDevices = mfaDevices
  }

  serializable() {
    return {
      tozny_id: this.toznyId,
      user_id: this.userId,
      totp_device: this.mfaDevices.totp.map(
        IdentityMFADevices._serializeMFADevice
      ),
      webauthn_devices: this.mfaDevices.webauthn.map(
        IdentityMFADevices._serializeMFADevice
      ),
    }
  }

  /** @returns {IdentityMFADevices} */
  static decode(json) {
    const mfaDevices = {
      totp: (json.totp_device || []).map(IdentityMFADevices._decodeMFADevice),
      webauthn: (json.webauthn_devices || []).map(
        IdentityMFADevices._decodeMFADevice
      ),
    }
    return new IdentityMFADevices(json.tozny_id, json.user_id, mfaDevices)
  }

  /**
   * serializes our sdk's `MFADevice` object to the API representation
   * @param {MFADevice} data
   * @private
   */
  static _serializeMFADevice(data) {
    return {
      id: data.id,
      type: data.type,
      user_label: data.userLabel,
      created_at: data.createdAt,
    }
  }

  /**
   * converts API MFADevice object to our sdk's `MFADevice` structure
   * @returns {MFADevice}
   * @private
   */
  static _decodeMFADevice(json) {
    return {
      id: json.id,
      type: json.type,
      userLabel: json.user_label,
      createdAt: json.created_at,
    }
  }
}

module.exports = IdentityMFADevices
