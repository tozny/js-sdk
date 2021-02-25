module.exports = {
  DEFAULT_API_URL: 'https://api.e3db.com',
  DEFAULT_QUERY_COUNT: 100,
  IDENTITY_DERIVATION_ROUNDS: 10000,
  EMAIL: /(.+)@(.+){2,}\.(.+){2,}/,
  DEFAULT_KDF_ITERATIONS: 1000,
  FILE_VERSION: 3,
  FILE_BLOCK_SIZE: 65536,
  TSV1_SUPPORTED_ALGORITHMS: ['TSV1-ED25519-BLAKE2B'],
  // generated using uuidv5 with namespace: 794253a4-310b-449d-9d8d-4575e8923f40 and name: tozny.secrets
  SECRET_UUID: '38bb737a-4ce0-5ead-8585-e13ea23b09a6',
  TYPES: ['Credential', 'Note', 'Password', 'File'],
}
