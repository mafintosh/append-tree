var protobuf = require('protocol-buffers')
var mutexify = require('mutexify')
var from = require('from2')
var indexEncoder = require('./index-encoder')

var messages = protobuf(`
  message Node {
    required uint64 seq = 1;
    repeated string path = 2;
    optional bytes value = 3;
    optional bytes index = 4;
  }
`)

module.exports = Tree

function Tree (feed, opts) {
  if (!(this instanceof Tree)) return new Tree(feed, opts)
  if (!opts) opts = {}

  this.feed = feed
  this._mutex = mutexify() // feeling lazy about caching last
  this._checkout = !!opts.checkout
  this._seq = opts.seq
}

Tree.prototype.history = function (opts) {
  if (!opts) opts = {}

  var since = typeof opts.since === 'number' ? opts.since : -1
  var until = typeof opts.until === 'number' ? opts.until : -1
  var self = this

  return from.obj(read)

  function openAndRead (size, cb) {
    self.feed.open(function (err) {
      if (err) return cb(err)
      if (!self.feed.blocks || since >= self.feed.blocks) return cb(null, null)
      until = self.feed.blocks - 1
      read(size, cb)
    })
  }

  function read (size, cb) {
    if (until === -1) return openAndRead(size, cb)
    if (since === until) return cb(null, null)
    self._getFeed(++since, cb)
  }
}

Tree.prototype.list = function (path, cb) {
  var self = this

  this._getLast(function (err, last) {
    if (err) return cb(err)
    if (!last) return cb(notFound(path))

    var parts = split(path)
    self._list(last, parts, function (err, seqs) {
      if (err) return cb(err)
      if (!seqs) return cb(notFound(path))

      var dir = []
      loop(null, null)

      function loop (err, node) {
        if (err) return cb(err)
        if (node) dir.push(node.path[parts.length])
        if (!seqs.length) cb(null, dir)
        else self._getFeed(seqs.shift(), loop)
      }
    })
  })
}

Tree.prototype._list = function (last, parts, cb) {
  var i = compare(last.path, parts)
  if (i === last.path.length) i-- // last is *not* a dir

  var self = this
  var closest = i === parts.length
  var paths = (last.index ? indexEncoder.decode(last.index)[i] : null) || []

  this._prio(paths)

  if (closest) {
    paths.push(last.seq)
    return cb(null, paths)
  }

  loop(null, null)

  function loop (err, node) {
    if (err) return cb(err)

    if (node) {
      if (i < node.path.length && node.path[i] === parts[i]) {
        return self._list(node, parts, cb)
      }
    }

    if (!paths.length) cb(null, null)
    else self._getFeed(paths.shift(), loop)
  }
}

Tree.prototype._prio = function (list) {
  for (var i = 0; i < list.length; i++) {
    if (!this.feed.has(list[i])) this.feed.get(list[i], noop)
  }
}

Tree.prototype.get = function (path, cb) {
  var self = this
  this._getLast(function (err, last) {
    if (err) return cb(err)
    if (!last) return cb(notFound(path))
    self._get(path, last, split(path), cb)
  })
}

Tree.prototype._get = function (path, last, parts, cb) {
  var i = compare(last.path, parts)
  if (i === parts.length) return cb(null, last)

  var self = this
  var paths = (last.index ? indexEncoder.decode(last.index)[i] : null) || []

  this._prio(paths)

  loop(null, null)

  function loop (err, node) {
    if (err) return cb(err)

    if (node) {
      var name = i < node.path.length && node.path[i]
      if (name === parts[i]) return self._get(path, node, parts, cb)
    }

    if (!paths.length) return cb(notFound(path))
    else self._getFeed(paths.shift(), loop)
  }
}

Tree.prototype.flush = function (cb) {
  this._mutex(function (release) {
    release(cb)
  })
}

Tree.prototype.checkout = function (seq) {
  return new Tree(this.feed, {checkout: true, seq: seq})
}

Tree.prototype.count = function (path, cb) {
  var self = this
  this._getLast(function (err, last) {
    if (err) return cb(err)
    if (!last) return cb(notFound(path))
    self._count(last, path, cb)
  })
}

Tree.prototype._count = function (last, path, cb) {
  var parts = split(path)
  this._list(last, parts, function (err, seqs) {
    if (err) return cb(err)
    if (!seqs) return cb(notFound(path))
    cb(null, seqs.length)
  })
}

Tree.prototype.proof = function (path, cb) {
  var self = this
  var result = []
  this._getLast(function (err, last) {
    if (err) return cb(err)
    if (!last) return cb(notFound(path))
    self._proof(path, last, split(path), result, cb)
  })
}

Tree.prototype._proof = function (path, last, parts, result, cb) {
  result.push(last.seq)

  var i = compare(last.path, parts)
  if (i === parts.length) return cb(null, result)

  var self = this
  var paths = (last.index ? indexEncoder.decode(last.index)[i] : null) || []

  this._prio(paths)

  loop(null, null)

  function loop (err, node) {
    if (err) return cb(err)

    if (node) {
      var name = i < node.path.length && node.path[i]
      if (name === parts[i]) return self._proof(path, node, parts, result, cb)
    }

    if (!paths.length) return cb(notFound(path))
    else self._getFeed(paths.shift(), loop)
  }
}

Tree.prototype._getLast = function (cb) {
  if (this._checkout) return this._getFeed(this._seq, cb)

  var self = this
  this.feed.open(function (err) {
    if (err) return cb(err)
    if (!self.feed.blocks) return cb(null, null)
    self._getFeed(self.feed.blocks - 1, cb)
  })
}

Tree.prototype._getFeed = function (index, cb) {
  this.feed.get(index, function (err, buf) {
    if (err) return cb(err)
    var node = messages.Node.decode(buf)
    cb(null, node)
  })
}

Tree.prototype._filter = function (seqs, index, name, cb) {
  var i = 0
  var self = this
  var result = []

  loop(null, null)

  function loop (err, node) {
    if (err) return cb(err)

    if (node) {
      if (node.path[index] !== name) result.push(node.seq)
    }

    if (i === seqs.length) cb(null, result)
    else self._getFeed(seqs[i++], loop)
  }
}

Tree.prototype.append = function (path, value, cb) {
  if (this._checkout) throw new Error('Cannot append to a checkout')

  var self = this
  this._mutex(function (release) {
    self._append(path, value, function (err) {
      release(cb, err)
    })
  })
}

Tree.prototype._append = function (path, value, cb) {
  if (!cb) cb = noop

  var self = this
  var parts = split(path)

  this._getLast(function (err, last) {
    if (err) return cb(err)

    if (!last) {
      self.feed.append(messages.Node.encode({seq: self.feed.blocks, path: parts, value: value}), cb)
      return
    }

    var i = 0
    var end = parts.length - 1
    var paths = []

    loop(null)

    function loop () {
      if (err) return cb(err)

      if (i > end) {
        var node = {seq: self.feed.blocks, path: parts, value: value, index: indexEncoder.encode(paths)}
        self.feed.append(messages.Node.encode(node), cb)
        return
      }

      self._list(last, parts.slice(0, i), function (err, seqs) {
        if (err) return cb(err)

        self._filter(seqs || [], i, parts[i], function (err, seqs) {
          if (err) return cb(err)

          paths.push(seqs)
          i++
          loop()
        })
      })
    }
  })
}

function noop () {}

function compare (a, b) {
  var idx = 0
  while (idx < a.length && a[idx] === b[idx]) idx++
  return idx
}

function split (path) {
  if (Array.isArray(path)) return path
  if (path === '/') return []
  var parts = path.split('/')
  if (parts[0] === '') parts.shift()
  if (parts.length && parts[parts.length - 1] === '') parts.pop()
  return parts
}

function notFound (path) {
  var err = new Error('Path not found: ' + path)
  err.path = path
  err.status = 404
  err.notFound = true
  return err
}

// var DEBUG = false
// var feed = require('hypercore')(require('memdb')()).createFeed()
// var t = Tree(feed)

// t.append('/hello/world/test.txt', 'hello world')
// t.append('/world/foo.txt', 'hej')
// t.append('/world/bar.txt', 'bar')
// t.append('/world/bar.txt', '.')
// t.append('/hello/bar', 'x', function () {
//   // t.list('/world/foo', console.log)
//   t.checkout(2).path('/world/bar.txt', console.log)
//   // t.history().on('data', console.log)
// })
