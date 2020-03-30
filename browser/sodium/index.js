const Sodium = require('./sodium')
const Platform = require('../platform')
const FileOperations = require('../fileOperations')
const Tozny = require('../../lib/tozny')
const helpers = require('../helpers')

// Option to overwrite default (Crypto)Type mode.
const platform = new Platform()
const crypto = new Sodium()
const fileOperations = new FileOperations()
module.exports = new Tozny(crypto, platform, fileOperations, helpers)
