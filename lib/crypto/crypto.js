const { v4: uuidv4 } = require('uuid')
const types = require('../../types')
const CryptoProvider = require('./cryptoProvider')
const Platform = require('./platform')
const DefaultEncryptionKeyType = 'curve25519'
const {
  DEFAULT_KDF_ITERATIONS,
  FILE_VERSION,
  FILE_BLOCK_SIZE,
} = require('../utils/constants')
const StreamTransformer = require('../utils/streamTransformer')
const {
  versionAndKeys,
  streamCipher,
  decryptBlocks,
  decryptLastBlock,
  errorEOF,
} = require('./fileHelpers')

/**
 * Provide Tozny specific cryptographic operations give an basic crypto provider.
 */
class Crypto {
  /**
   * Creates a new Crypto object, providing Tozny cryptographic methods.
   *
   * @param {CryptoProvider} cryptoProvider The specific cryptography providing implementation.
   * @param {Platform}       platform       Platform provided/specific functionality
   */
  constructor(cryptoProvider, platform) {
    if (!CryptoProvider.isExtension(cryptoProvider)) {
      throw new Error(
        'A valid crypto provider is required to create a crypto instance'
      )
    }
    if (!Platform.isExtension(platform)) {
      throw new Error(
        'Valid platform functionality is required to create a crypto instance'
      )
    }
    this.provider = cryptoProvider
    this.platform = platform
  }
  /**
   * Mode returns a string denoting which crypto library this implementation uses under the hood.
   */
  mode() {
    return this.provider.mode()
  }

  /**
   * Gets the signature version currently supported by this crypto object.
   *
   * @return {string} The current signature version in UUID-v5 format.
   */
  get signatureVersion() {
    // UUIDv5 TFSP1;ED25519;BLAKE2B
    return 'e7737e7c-1637-511e-8bab-93c4f3e26fd9'
  }

  /**
   * Symmetrically encrypt and serialize a string with the given key
   *
   * @param {string} plain The plain text string to encrypt
   * @param {string} key   Base64 encoded key used to encrypt the string.
   *
   * @return {Promise<string>} The encrypted string base64URL encoded with a serialized nonce.
   */
  async encryptString(plain, key) {
    const rawKey = await this.platform.b64URLDecode(key)
    const nonce = await this.randomNonce()
    const encrypted = await this.provider.encryptSymmetric(plain, nonce, rawKey)
    return [nonce, encrypted]
      .map(this.platform.b64URLEncode.bind(this.platform))
      .join(':')
  }

  /**
   * Decrypt a symmetrically encrypted string
   *
   * @param {string} encrypted Base64 encoded string in nonce:cipherText format.
   * @param {string} key       Base64 encoded key used to encrypt the string.
   *
   * @return {Promise<string>} The decrypted UTF-8 string.
   */
  async decryptString(encrypted, key) {
    const rawKey = this.platform.b64URLDecode(key)
    const [nonce, cipher] = encrypted
      .split(':')
      .map(this.platform.b64URLDecode.bind(this.platform))
    const decrypted = await this.provider.decryptSymmetric(
      cipher,
      nonce,
      rawKey
    )

    return this.platform.byteToUTF8String(decrypted)
  }

  /**
   * Encrypt a string into the standard Tozny quad format using Libsodium's secretbox.
   *
   * @param {string} field The string of data to encrypt as a data field.
   * @param {Uint8Array} accessKey The access key bytes to encrypt the field with.
   *
   * @returns {Promise<String>} The Tozny dotted quad encrypted field.
   */
  async encryptField(field, accessKey) {
    const dk = await this.randomKey()
    const efN = await this.randomNonce()
    const ef = await this.provider.encryptSymmetric(field, efN, dk)
    const edkN = await this.randomNonce()
    const edk = await this.provider.encryptSymmetric(dk, edkN, accessKey)
    const encryptedField = [edk, edkN, ef, efN]
      .map(this.platform.b64URLEncode.bind(this.platform))
      .join('.')

    return encryptedField
  }

  /**
   * Decrypt a standard Tozny dotted quad using Libsodium's secretbox into a string.
   *
   * @param {string}     encryptedField A standard Tozny dotted quad string.
   * @param {Uint8Array} accessKey      The access key bytes to use as the decryption key.
   *
   * @return {Promise<string>} The decrypted data field as a UTF-8 string.
   */
  async decryptField(encryptedField, accessKey) {
    const [edk, edkN, ef, efN] = encryptedField
      .split('.')
      .map(this.platform.b64URLDecode.bind(this.platform))

    const dk = await this.provider.decryptSymmetric(edk, edkN, accessKey)
    const field = await this.provider.decryptSymmetric(ef, efN, dk)

    return this.platform.byteToUTF8String(field)
  }

  /**
   * Sign a key value pair for use in a data object with optional object nonce.
   *
   * @param {string} key The object key which will be used for this field.
   * @param {string} value The plain text string value of the field.
   * @param {string} signingKey A base64url encoded private signing key
   * @param {string} objectSalt A determined UUID to sign the field with. If not supplied a random one is generated.
   *
   * @return {string} field prefixed with the field signature header and signature.
   */
  async signField(key, value, signingKey, objectSalt) {
    const salt = objectSalt || uuidv4()
    const message = await this.hash(`${salt}${key}${value}`)
    const rawKey = this.platform.b64URLDecode(signingKey)
    const rawSignature = await this.provider.sign(message, rawKey)
    const signature = this.platform.b64URLEncode(rawSignature)
    const length = signature.length
    const prefix = [this.signatureVersion, salt, length, signature].join(';')
    return `${prefix}${value}`
  }

  /**
   * Verify the key, value, and optionally salt in a field signature.
   *
   * @param {string} key The Key associated with the field.
   * @param {string} value The fully signed string to validate.
   * @param {string} verifyingKey A base64url encoded public signing key
   * @param {string} objectSalt A UUID verified as the salt used in the signature.
   *                            If not sent, the salt contained in the value is used instead.
   *
   * @return {Promise<string>} The field plain text if validated. Throws if validation fails.
   */
  async verifyField(key, value, verifyingKey, objectSalt) {
    const parts = value.split(';', 3)
    // If this field is not prefixed with the signature version, assume it is
    // not a signed field.
    if (parts[0] !== this.signatureVersion) {
      return value
    }
    // If a salt was sent, validate the included salt matches
    if (objectSalt && parts[1] !== objectSalt) {
      throw new Error(`Invalid salt on field signature for ${key}`)
    }
    // Header is each part, plus the three semicolons
    const headerLength = parts.reduce((acc, part) => acc + part.length, 3)
    const signatureLength = parseInt(parts[2], 10)
    const signatureIndex = headerLength
    const plainTextIndex = headerLength + signatureLength
    const signature = value.substring(signatureIndex, plainTextIndex)
    const plainText = value.substring(plainTextIndex)
    const message = await this.hash(`${parts[1]}${key}${plainText}`)
    const rawSignature = this.platform.b64URLDecode(signature)
    const rawKey = this.platform.b64URLDecode(verifyingKey)

    const valid = await this.provider.verify(rawSignature, message, rawKey)
    if (!valid) {
      throw new Error(`Invalid field signature for "${key}"`)
    }

    return plainText
  }

  /**
   * Decrypt the access key provided for a specific reader so it can be used
   * to further decrypt a protected record.
   *
   * @param {string} readerKey   Base64url-encoded private key for the reader (current client)
   * @param {EAKInfo} encryptedAk Encrypted access key
   *
   * @return {Promise<string>} Raw binary string of the access key
   */
  async decryptEak(readerKey, encryptedAk) {
    let encodedEak = encryptedAk.eak
    let publicKey = this.platform.b64URLDecode(
      encryptedAk.authorizerPublicKey.curve25519
    )
    let privateKey = this.platform.b64URLDecode(readerKey)

    let [eak, nonce] = encodedEak
      .split('.')
      .map(this.platform.b64URLDecode.bind(this.platform))
    return this.provider.decryptAsymmetric(eak, nonce, publicKey, privateKey)
  }
  /**
   * Decrypt the group membership key provided for a specific group member so it can be used
   * to further decrypt assets, or create new keys.
   *
   * @param {string} privKey   Base64url-encoded private key for the current group member
   * @param {EAKInfo} encryptedAk Encrypted access key
   *
   * @return {Promise<string>} Raw binary string of the membership key
   */
  async decryptEakGroup(privKey, encryptedAk, pubKey) {
    let encodedEak = encryptedAk
    let publicKey = this.platform.b64URLDecode(pubKey)
    let privateKey = this.platform.b64URLDecode(privKey)
    let [eak, nonce] = encodedEak
      .split('.')
      .map(this.platform.b64URLDecode.bind(this.platform))
    return await this.provider.decryptAsymmetric(
      eak,
      nonce,
      publicKey,
      privateKey
    )
  }

  async decryptNoteEak(readerKey, encryptedAk, writerKey) {
    let encodedEak = encryptedAk.eak
    let publicKey = this.platform.b64URLDecode(writerKey)
    let privateKey = this.platform.b64URLDecode(readerKey)

    let [eak, nonce] = encodedEak
      .split('.')
      .map(this.platform.b64URLDecode.bind(this.platform))
    return this.provider.decryptAsymmetric(eak, nonce, publicKey, privateKey)
  }

  /**
   * Encrypt an access key for a given reader.
   *
   * @param {string} writerKey Base64url-encoded private key of the writer
   * @param {string} ak        Raw binary string of the access key
   * @param {string} readerKey Base64url-encoded public key of the reader
   *
   * @return {Promise<string>} Encrypted and encoded access key.
   */
  async encryptAk(writerKey, ak, readerKey) {
    let publicKey = this.platform.b64URLDecode(readerKey)
    let privateKey = this.platform.b64URLDecode(writerKey)

    let nonce = await this.randomNonce()
    let eak = await this.provider.encryptAsymmetric(
      ak,
      nonce,
      publicKey,
      privateKey
    )

    return [eak, nonce]
      .map(this.platform.b64URLEncode.bind(this.platform))
      .join('.')
  }

  /**
   * Encrypt a private key using a public and private key.
   *
   * @param {string} privateKey
   * @param {string} writerPrivateKey
   * @param {string} readerPublicKey
   *
   * @return {Promise<string>}
   */
  async encryptPrivateKey(privateKey, writerPrivateKey, readerPublicKey) {
    let rawPrivateKey = this.platform.b64URLDecode(privateKey)
    let publicEncKey = this.platform.b64URLDecode(readerPublicKey)
    let privateEncKey = this.platform.b64URLDecode(writerPrivateKey)

    let nonce = await this.randomNonce()
    let pk = await this.provider.encryptAsymmetric(
      rawPrivateKey,
      nonce,
      publicEncKey,
      privateEncKey
    )

    return [pk, nonce]
      .map(this.platform.b64URLEncode.bind(this.platform))
      .join('.')
  }

  /**
   * Create a clone of a given record, but decrypting each field in turn based on
   * the provided access key.
   *
   * @param {Record} encrypted Record to be unwrapped
   * @param {string} accessKey Access key to use for decrypting each data key.
   *
   * @return {Promise<Record>}
   */
  async decryptRecord(encrypted, accessKey) {
    // Clone the record meta
    let meta = new types.Meta(
      encrypted.meta.writerId,
      encrypted.meta.userId,
      encrypted.meta.type,
      encrypted.meta.plain
    )
    meta.recordId = encrypted.meta.recordId
    meta.created = encrypted.meta.created
    meta.lastModified = encrypted.meta.lastModified
    meta.version = encrypted.meta.version
    // Decrypt the record data
    let data = new types.RecordData({})
    for (let key in encrypted.data) {
      // eslint-disable-next-line no-prototype-builtins
      if (encrypted.data.hasOwnProperty(key)) {
        data[key] = await this.decryptField(encrypted.data[key], accessKey)
      }
    }
    // Return a full record object
    let decrypted = new types.Record(meta, data, encrypted.signature)
    return decrypted
  }

  /**
   * Create a clone of a plaintext record, encrypting each field in turn with a random
   * data key and protecting the data key with a set access key.
   *
   * @param {Record} record    Record to be encrypted.
   * @param {string} accessKey Access key to use for decrypting each data key.
   *
   * @return {Promise<Record>}
   */
  async encryptRecord(record, accessKey) {
    // Clone the record meta
    let meta = new types.Meta(
      record.meta.writerId,
      record.meta.userId,
      record.meta.type,
      record.meta.plain
    )
    let encrypted = new types.Record(meta, {}, record.signature)

    // Encrypt the record data
    for (let key in record.data) {
      // eslint-disable-next-line no-prototype-builtins
      if (record.data.hasOwnProperty(key)) {
        encrypted.data[key] = await this.encryptField(
          record.data[key],
          accessKey
        )
      }
    }

    return encrypted
  }

  /**
   * Verify the signature on a given JSON document, given a specific public signing key.
   *
   * @param {Serializable} document     Document to be verified
   * @param {string}       signature    Base64URL-encoded signature
   * @param {string}       verifyingKey Base64URL-encoded signing key
   *
   * @returns {Promise<bool>}
   */
  async verifyDocumentSignature(document, signature, verifyingKey) {
    let message = document.stringify()
    let rawSignature = this.platform.b64URLDecode(signature)
    let rawKey = this.platform.b64URLDecode(verifyingKey)

    return this.provider.verify(rawSignature, message, rawKey)
  }

  /**
   * Sign a document and return the signature
   *
   * @param {Signable} document   Serializable object to be signed
   * @param {string}   signingKey Key to use to sign the document
   *
   * @returns {Promise<string>}
   */
  async signDocument(document, signingKey) {
    let message = document.stringify()
    let rawKey = this.platform.b64URLDecode(signingKey)

    let signature = await this.provider.sign(message, rawKey)
    return this.platform.b64URLEncode(signature)
  }

  /**
   * Generate a random key for use with Libsodium's secretbox interface
   *
   * @returns {Uint8Array} An array of random bytes the default key length
   */
  async randomKey() {
    return this.provider.randomBytes(await this.provider.keyBytes())
  }

  /**
   * Generate a random key for use with Libsodium's secret stream interface
   *
   * @returns {Uint8Array} An array of random bytes the default stream key length
   */
  async randomStreamKey() {
    return this.provider.randomBytes(await this.provider.streamKeyBytes())
  }

  /**
   * Generate a random nonce for use with Libsodium's secretbox interface
   *
   * @returns {Uint8Array} An array of random bytes the default nonce length
   */
  async randomNonce() {
    return this.provider.randomBytes(await this.provider.nonceBytes())
  }

  /**
   * Generate random bytes `length` long.
   *
   * @param {number} length The number of random bytes to generate
   *
   * @returns {Uint8Array} An array of random bytes
   */
  async randomBytes(length) {
    return this.provider.randomBytes(length)
  }

  /**
   * Derive an Ed25519 keypair from a password and a random salt
   *
   * @param {string} seed         User-specified derivation seed
   * @param {string} salt         User-specified salt (should be random)
   * @param {number} [iterations] Option number of hash iterations to create the seed.
   *
   * @returns {KeyPair} Object containing publicKey and privateKey fields
   */
  async deriveSigningKey(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    const keypair = await this.provider.seedSigningKeyPair(
      seed,
      salt,
      iterations
    )

    return new types.KeyPair(
      this.platform.b64URLEncode(keypair.publicKey),
      this.platform.b64URLEncode(keypair.privateKey)
    )
  }

  /**
   * Derive a Curve25519 keypair from a password and a random salt
   *
   * @param {string} seed         User-specified derivation seed
   * @param {string} salt         User-specified salt (should be random)
   * @param {number} [iterations] Option number of hash iterations to create the seed.
   *
   * @returns {KeyPair} Object containing publicKey and privateKey fields
   */
  async deriveCryptoKey(seed, salt, iterations = DEFAULT_KDF_ITERATIONS) {
    const keypair = await this.provider.seedCryptoKeyPair(
      seed,
      salt,
      iterations
    )

    return new types.KeyPair(
      this.platform.b64URLEncode(keypair.publicKey),
      this.platform.b64URLEncode(keypair.privateKey)
    )
  }

  /**
   * Derive a symmetric encryption key from a password and a random salt
   *
   * @param {string} password User-specified password
   * @param {string} salt     User-specified salt (should be random)
   * @param {number} [iterations] Option number of hash iterations to create the seed.
   *
   * @returns {string} base64Url encoded string
   */
  async deriveSymmetricKey(
    password,
    salt,
    iterations = DEFAULT_KDF_ITERATIONS
  ) {
    const buffer = await this.provider.seedSymmetricKey(
      password,
      salt,
      iterations
    )
    return this.platform.b64URLEncode(buffer)
  }

  /**
   * Dynamically generate a Curve25519 keypair for use with registration and cryptographic operations
   *
   * @returns {KeyPair} Base64URL-encoded representation of the new keypair
   */
  async generateKeypair() {
    const keypair = await this.provider.generateKeypair()
    const ret = new types.KeyPair(
      this.platform.b64URLEncode(keypair.publicKey),
      this.platform.b64URLEncode(keypair.privateKey)
    )
    return ret
  }

  /**
   * Dynamically generate an Ed25519 keypair for use with registration and signing operations
   *
   * @returns {KeyPair} Base64URL-encoded representation of the new keypair
   */
  async generateSigningKeypair() {
    const keypair = await this.provider.generateSigningKeypair()
    return new types.KeyPair(
      this.platform.b64URLEncode(keypair.publicKey),
      this.platform.b64URLEncode(keypair.privateKey)
    )
  }

  /**
   * Encrypt and sign all of the data fields in a note object.
   *
   * @param {Note} note The note object that has un-encrypted data.
   * @param {Uint8Array} accessKey The raw access key to use in encryption
   * @param {string} signingKey The base64url encoded singing key used to sign each field.
   *
   * @return {Note} a new note object with all the data fields encrypted and signed.
   */
  async encryptNote(note, accessKey, signingKey) {
    const encryptedNote = types.Note.clone(note)
    const encryptedData = {}
    const signatureSalt = uuidv4()
    const noteSignature = await this.signField(
      'signature',
      signatureSalt,
      signingKey
    )
    encryptedNote.signature = noteSignature
    for (let key in note.data) {
      // eslint-disable-next-line no-prototype-builtins
      if (note.data.hasOwnProperty(key)) {
        const signedField = await this.signField(
          key,
          note.data[key],
          signingKey,
          signatureSalt
        )
        encryptedData[key] = await this.encryptField(signedField, accessKey)
      }
    }
    encryptedNote.data = encryptedData
    return encryptedNote
  }

  /**
   * Decrypt and validate all fields in a note object.
   *
   * @param {Note} encrypted The note object with encrypted and signed data.
   * @param {Uint8Array} accessKey The raw access key to use in decrypting the data.
   * @param {string} verifyingKey The base64url encoded public signing key used to verify field signatures
   *
   * @return {Promise<Note>} A new note object with plain text data.
   */
  async decryptNote(encrypted, accessKey, verifyingKey) {
    const verifiedSalt = await this.verifyField(
      'signature',
      encrypted.signature,
      verifyingKey
    )
    const signatureSalt =
      verifiedSalt === encrypted.signature ? undefined : verifiedSalt
    const decrypted = types.Note.clone(encrypted)
    const decryptedData = {}
    for (let key in encrypted.data) {
      // eslint-disable-next-line no-prototype-builtins
      if (encrypted.data.hasOwnProperty(key)) {
        const rawField = await this.decryptField(encrypted.data[key], accessKey)
        decryptedData[key] = await this.verifyField(
          key,
          rawField,
          verifyingKey,
          signatureSalt
        )
      }
    }
    decrypted.data = decryptedData
    return decrypted
  }

  /**
   * Creates a generic hash of the message based on the available provider algorithm
   *
   * @param {string} message The message to hash
   * @returns {string} a base64url encoded digest of the message
   */
  async hash(message) {
    const genericHash = await this.provider.hash(message)
    return this.platform.b64URLEncode(genericHash)
  }

  /**
   * Cryptographically signs a message with the given private key.
   *
   * @param {string} message The message to sign
   * @param {string} privateKey The base64url encoded private key to sign with.
   * @returns {string} base64url encoded signature
   */
  async sign(message, privateKey) {
    let rawKey = this.platform.b64URLDecode(privateKey)
    let rawString = this.platform.b64URLDecode(message)
    let signature = await this.provider.sign(rawString, rawKey)
    return this.platform.b64URLEncode(signature)
  }

  /**
   * Verifies a cryptographically signed message given a signature and public key.
   *
   * @param {string} signature The base64url encoded signature over the message
   * @param {string} message The message that was signed over
   * @param {string} publicKey The base64url encoded public key from the pair used to sign the message.
   * @return {boolean} Whether or not the signature is valid.
   */
  async verify(signature, message, publicKey) {
    let rawKey = this.platform.b64URLDecode(publicKey)
    let rawString = this.platform.b64URLDecode(signature)
    return this.provider.verify(rawString, message, rawKey)
  }

  /**
   * Encrypts a file from the given handle with the given access key.
   *
   * The handle and operations performed on that handle are platform specific.
   * The Crypto object is responsible for organizing the encryption process, but
   * FileOperations provides the platform specific parts of the process. This
   * allows platforms to utilize available stream primitives and prevent too
   * many bytes from being held in memory at one time.
   *
   * @param {any} handle A platform specific file handle.
   * @param {Uint8Array} accessKey The raw access key to encrypt with.
   * @param {FileOperations} ops The platform specific file operations to use.
   * @return {any} A platform specific encrypted file object.
   */
  async encryptFile(handle, accessKey, ops) {
    // Create temp file, checksum, and keys
    const tempFile = ops.encryptDestination()
    const md5 = this.provider.checksum()
    const dk = await this.randomStreamKey()
    const edkN = await this.randomNonce()
    const edk = await this.provider.encryptSymmetric(dk, edkN, accessKey)
    const headerText = [
      FILE_VERSION,
      this.platform.b64URLEncode(edk),
      this.platform.b64URLEncode(edkN),
    ].join('.')
    // Tozny file header
    const header = this.platform.UTF8StringToByte(`${headerText}.`)
    md5.update(header)
    tempFile.write(header)
    let size = header.length
    // Create the encryption stream and write that header
    const stream = await this.provider.encryptStream(dk)
    md5.update(stream.header)
    tempFile.write(stream.header)
    size += stream.header.length
    // Encrypt the file
    const reader = ops.sourceReader(handle, FILE_BLOCK_SIZE)
    let readBlock
    do {
      readBlock = await reader.read()
      const block = stream.encrypt(readBlock.value, readBlock.done)
      md5.update(block)
      tempFile.write(block)
      size += block.length
    } while (!readBlock.done)
    // Results
    const checksum = await this.platform.b64encode(md5.digest())
    return { size, checksum, tempFile }
  }

  /**
   * Decrypts a file from the given source with the given access key.
   *
   * The source and operations performed on that source are platform specific.
   * The Crypto object is responsible for organizing the decryption process, but
   * FileOperations provides the platform specific parts of the process. This
   * allows platforms to utilize available stream primitives and prevent too
   * many bytes from being held in memory at one time.
   *
   * @param {any} source A platform specific file source.
   * @param {Uint8Array} accessKey The raw access key to decrypt with.
   * @param {FileOperations} ops The platform specific file operations to use.
   * @return {any} A platform specific decrypted file object.
   */
  async decryptFile(source, accessKey, ops) {
    const extraHeaderSize = await this.provider.streamHeaderBytes()
    const blockSize =
      (await this.provider.streamOverheadBytes()) + FILE_BLOCK_SIZE
    const destination = ops.decryptDestination()
    const context = {
      crypto: this,
      accessKey,
      destination,
      extraHeaderSize,
      blockSize,
      block: new Uint8Array(blockSize),
      pointer: 0,
      supportedVersion: FILE_VERSION,
    }
    const transformer = new StreamTransformer(
      versionAndKeys,
      errorEOF('Tozny header not found in file.'),
      context
    )
    transformer
      .then(streamCipher, errorEOF('Stream cipher header not found in file'))
      .then(decryptBlocks, decryptLastBlock)
    // Begin transformation, but don't await it so the reader can get to the
    // destination stream immediately
    transformer.transform(source)
    return destination.getReader()
  }
  /**
   * createGroupMembershipKey takes the encrypted membership key of the current group member
   * and decrypts it, in order to encrypt it for the new group member.
   *
   * @param {string} groupMemberClientID
   * @param {string} groupMemberPublicKey
   * @param {string} encryptedMembershipKey
   * @param {string} newMemberClientID
   *
   * @return {string} New members encrypted group key
   */
  async createGroupMembershipKey(
    groupMemberPrivateKey,
    encryptedMembershipKey,
    newMemberPublicKey,
    authorizerPublicKey
  ) {
    let groupKey = await this.decryptEakGroup(
      groupMemberPrivateKey,
      encryptedMembershipKey,
      authorizerPublicKey
    )
    const groupkeyEncode = this.platform.b64URLEncode(groupKey)
    let eak = await this.encryptPrivateKey(
      groupkeyEncode,
      groupMemberPrivateKey,
      newMemberPublicKey
    )
    return eak
  }
  /**
   * decryptGroupRecord decrypts a record wrapped for group members
   *
   * @param {Record} encrypted Record to be unwrapped
   * @param {EAKInfo} accessKeyInfo Access key to use for decrypting the record shared with group
   * @param {string} groupMemberPrivateKey the private key for the member decrypting the records
   *
   * @return {Promise<Record>}
   */
  async decryptGroupRecord(encrypted, groupMemberPrivateKey, accessKeyInfo) {
    let encryptedAccessKey = accessKeyInfo.eak
    var rawGroupPrivateKey
    var writerPublicKey
    var groupAccessKey
    var fileMeta
    // Unwrap the Access Key Wrappers To get the rawPrivateKey
    for (var i = 0; i < accessKeyInfo.access_key_wrappers.length; i++) {
      rawGroupPrivateKey = await this.decryptEakGroup(
        groupMemberPrivateKey,
        accessKeyInfo.access_key_wrappers[i].membership_key,
        accessKeyInfo.authorizer_public_key[DefaultEncryptionKeyType]
      )
      writerPublicKey = accessKeyInfo.access_key_wrappers[i].public_key
    }
    let groupPrivateKey = this.platform.b64URLEncode(rawGroupPrivateKey)
    groupAccessKey = await this.decryptEakGroup(
      groupPrivateKey,
      encryptedAccessKey,
      writerPublicKey
    )
    // Clone the record meta
    let meta = new types.Meta(
      encrypted.meta.writerId,
      encrypted.meta.userId,
      encrypted.meta.type,
      encrypted.meta.plain
    )
    // if the Record has File Meta
    if (encrypted.meta.fileMeta != null) {
      fileMeta = encrypted.meta.fileMeta
    }
    meta.recordId = encrypted.meta.recordId
    meta.created = encrypted.meta.created
    meta.lastModified = encrypted.meta.lastModified
    meta.version = encrypted.meta.version
    meta.fileMeta = fileMeta
    // Decrypt the record data
    let data = new types.RecordData({})
    for (let key in encrypted.data) {
      // eslint-disable-next-line no-prototype-builtins
      if (encrypted.data.hasOwnProperty(key)) {
        data[key] = await this.decryptField(encrypted.data[key], groupAccessKey)
      }
    }
    // Return a full record object
    let decrypted = new types.Record(meta, data, encrypted.signature)

    // If its a file make sure to b
    if (encrypted.meta.fileMeta.checksum !== null) {
      let file = await this.storage.getFile(decrypted.meta.recordId)
      let fileDecrypted = await file.read()
      return fileDecrypted
    }
    return decrypted
  }
  /**
   * createGroupAccessKey
   *
   * @param {string} privateKey     Base64url-encoded private key of the group member sharing the record
   * @param {string} ak             Raw binary string of the access key
   * @param {string} groupPublicKey Base64url-encoded public key of the group
   *
   * @return {Promise<string>} Encrypted and encoded access key
   */
  async createGroupAccessKey(groupPublicKey, accessKey, privateKey) {
    return await this.encryptAk(privateKey, accessKey, groupPublicKey)
  }
}

module.exports = Crypto
