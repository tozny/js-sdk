const Serializable = require('./serializable')
const EACP = require('./eacp')

/**
 * NoteOptions represents optional values that are not required for creating a note,
 * but provide additional functionality. Some features are premium and require a TozStore client to work.
 */
class NoteOptions extends Serializable {
  constructor(
    clientId,
    maxViews,
    idString,
    expiration,
    expires,
    type,
    plain,
    fileMeta,
    eacp,
    recordId,
    isSecret
  ) {
    super()

    // Premium features
    this.clientId = clientId
    this.maxViews = maxViews
    this.idString = idString // User defined id (id_string) available as part of premium features.
    this.expiration = expiration
    this.expires = expires
    this.eacp = eacp

    // Non-premium
    this.type = type
    this.plain = plain
    this.fileMeta = fileMeta
    this.recordId = recordId,
    this.isSecret = isSecret
  }

  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      client_id: this.clientId,
      max_views: this.maxViews,
      id_string: this.idString,
      expiration: this.expiration,
      expires: this.expires,
      type: this.type,
    }
    // Ensure that plainMeta is always an object, even it it's set to null
    if (this.plain === null) {
      toSerialize.plain = {}
    } else {
      toSerialize.plain = this.plain
    }

    // Ensure that fileMeta is always an object, even it it's set to null
    if (this.fileMeta === null) {
      toSerialize.file_meta = {}
    } else {
      toSerialize.file_meta = this.fileMeta
    }
    /* eslint-enabled */

    if (this.eacp instanceof EACP) {
      toSerialize.eacp = this.eacp.serializable()
    }

    if(this.recordId == null || undefined){
      toSerialize.recordId = null
    } else {
      toSerialize.recordId = this.recordId
    }

    if(this.isSecret == null){
      toSerialize.isSecret = false;
    } else {
      toSerialize.isSecret = true;
    }  

   
    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }

  static decode(json) {
    let type = json.type === undefined ? null : json.type
    let plain = json.plain === undefined ? {} : json.plain
    let fileMeta = json.file_meta === undefined ? {} : json.file_meta
    let clientId = json.client_id === undefined ? undefined : json.client_id
    let maxViews = json.max_views === undefined ? null : json.max_views
    let idString = json.id_string === undefined ? null : json.id_string
    let expiration = json.expiration === undefined ? null : json.expiration
    let expires = json.expires === undefined ? null : json.expires
    let eacp = json.eacp === undefined ? null : EACP.decode(json.eacp)

    let recordId = json.record_id === undefined ? null : json.record_id
    let isSecret = json.is_secret === undefined ? false : json.is_secret
    return new NoteOptions(
      clientId,
      maxViews,
      idString,
      expiration,
      expires,
      type,
      plain,
      fileMeta,
      eacp,
      recordId,
      isSecret
    )
  }
}

module.exports = NoteOptions
