var varint = require('varint')

// TODO: implement basic compression

exports.encodingLength = function (paths) {
  var size = 0
  for (var i = 0; i < paths.length; i++) {
    var p = paths[i]
    size += varint.encodingLength(p.length)
    for (var j = 0; j < p.length; j++) {
      size += varint.encodingLength(p[j] - (j ? p[j - 1] : 0))
    }
  }
  return size
}

exports.encode = function (paths, buf, offset) {
  if (!offset) offset = 0
  if (!buf) buf = new Buffer(exports.encodingLength(paths))

  var oldOffset = offset

  for (var i = 0; i < paths.length; i++) {
    var p = paths[i].sort(cmp)
    var acc = 0
    varint.encode(p.length, buf, offset)
    offset += varint.encode.bytes
    for (var j = 0; j < p.length; j++) {
      varint.encode(p[j] - acc, buf, offset)
      acc = p[j]
      offset += varint.encode.bytes
    }
  }

  exports.encode.bytes = offset - oldOffset

  return buf
}

exports.decode = function (buf, offset, end) {
  if (!offset) offset = 0
  if (!end) end = buf.length

  var oldOffset = offset
  var paths = []

  while (offset < end) {
    var length = varint.decode(buf, offset)
    offset += varint.decode.bytes
    if (length > 65535) throw new Error('Path index too large')
    var p = new Array(length)
    var acc = 0
    paths.push(p)

    for (var i = 0; i < length; i++) {
      p[i] = varint.decode(buf, offset) + acc
      acc = p[i]
      offset += varint.decode.bytes
    }
  }

  exports.decode.bytes = offset - oldOffset

  return paths
}

function cmp (a, b) {
  return a - b
}
