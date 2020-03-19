const {ArrayBuffer: MD5} = require('spark-md5')

const hash = new MD5()
const ab1 = new Uint8Array([0, 1, 2, 3])
const ab2 = new Uint8Array([95, 23, 58, 28, 84])
const ab3 = new Uint8Array([40, 2, 91, 55, 76])

hash.append(ab1)
hash.append(ab2)
hash.append(ab3)

console.log(typeof hash.end(true))
console.log(hash.end())
