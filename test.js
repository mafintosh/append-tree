var tape = require('tape')
var memdb = require('memdb')
var hypercore = require('hypercore')
var appendTree = require('./')

tape('empty', function (t) {
  var tree = create()

  tree.list('/', function (err) {
    t.ok(err, 'had error')
    t.ok(err.notFound, 'not found')
    t.same(err.path, '/')
    tree.get('/foo', function (err) {
      t.ok(err, 'had error')
      t.ok(err.notFound, 'not found')
      t.same(err.path, '/foo')
      t.end()
    })
  })
})

tape('basic', function (t) {
  t.plan(12)

  var tree = create()

  tree.append('/hello.txt', 'hello')
  tree.append('/world.txt', 'world')
  tree.append('/hello/world.txt', 'world2')
  tree.append('/hello/hello.txt', 'hello2')

  tree.flush(function () {
    tree.list('/', function (err, list) {
      t.error(err, 'no error')
      t.same(list.sort(), ['hello.txt', 'world.txt', 'hello'].sort())
    })
    tree.list('/hello', function (err, list) {
      t.error(err, 'no error')
      t.same(list.sort(), ['hello.txt', 'world.txt'].sort())
    })
    tree.get('/hello.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'hello')
    })
    tree.get('/world.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'world')
    })
    tree.get('/hello/hello.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'hello2')
    })
    tree.get('/hello/world.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'world2')
    })
  })
})

tape('overwrite', function (t) {
  t.plan(4)

  var tree = create()

  tree.append('/hello.txt', 'a')
  tree.append('/world.txt', 'b')
  tree.append('/hello.txt', 'c')

  tree.flush(function () {
    tree.get('/hello.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'c')
    })
    tree.get('/world.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'b')
    })
  })
})

tape('checkout', function (t) {
  t.plan(8)

  var tree = create()

  tree.append('/hello.txt', 'a')
  tree.append('/world.txt', 'b')
  tree.append('/hello.txt', 'c')

  tree.flush(function () {
    tree.get('/hello.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'c')
    })
    tree.get('/world.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'b')
    })

    var old = tree.checkout(1)

    old.get('/hello.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'a')
    })
    old.get('/world.txt', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value.toString(), 'b')
    })
  })
})

tape('many dirs', function (t) {
  var tree = create()

  tree.append('/dev/foo')
  tree.append('/mnt')
  tree.append('/tmp')
  tree.append('/home')
  tree.append('/dev/bar')
  tree.append('/dev/baz')

  tree.flush(function () {
    tree.list('/', function (err, list) {
      t.error(err, 'no error')
      t.same(list.sort(), ['dev', 'mnt', 'tmp', 'home'].sort())
      tree.list('/dev', function (err, list) {
        t.error(err, 'no error')
        t.same(list.sort(), ['bar', 'baz', 'foo'].sort())
        t.end()
      })
    })
  })
})

tape('proof', function (t) {
  var tree = create()

  tree.append('/hello.txt', 'a')
  tree.append('/world.txt', 'b')
  tree.append('/hello.txt', 'c')

  tree.flush(function () {
    tree.proof('/hello.txt', function (err, proof) {
      t.error(err, 'no error')
      t.same(proof, [2])
      tree.proof('/world.txt', function (err, proof) {
        t.error(err, 'no error')
        t.same(proof, [2, 1])
        tree.checkout(1).proof('/hello.txt', function (err, proof) {
          t.error(err, 'no error')
          t.same(proof, [1, 0])
          t.end()
        })
      })
    })
  })
})

tape('count', function (t) {
  t.plan(5)

  var tree = create()

  tree.append('/hello.txt', 'a')
  tree.append('/world.txt', 'b')
  tree.append('/world/foo', 'a')

  tree.flush(function () {
    tree.count('/', function (err, cnt) {
      t.error(err, 'no error')
      t.same(cnt, 3)
    })

    tree.count('/world', function (err, cnt) {
      t.error(err, 'no error')
      t.same(cnt, 1)
    })

    tree.count('/nope', function (err) {
      t.ok(err, 'had error')
    })
  })
})

tape('get on folder', function (t) {
  t.plan(3)

  var tree = create()

  tree.append('/foo/bar/baz', 'a', function () {
    tree.get('/foo', function (err) {
      t.ok(err, 'had error')
    })
    tree.get('/foo/bar', function (err) {
      t.ok(err, 'had error')
    })
    tree.get('/foo/bar/baz', function (err) {
      t.error(err, 'no error')
    })
  })
})

function create () {
  return appendTree(hypercore(memdb()).createFeed())
}
