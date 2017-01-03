# append-tree

Model a tree structure on top off an append-only log.

```
npm install append-tree
```

[![build status](http://img.shields.io/travis/mafintosh/append-tree.svg?style=flat)](http://travis-ci.org/mafintosh/append-tree)

The data structure stores a small index for every entry in the log, meaning no external indexing is required
to model the tree. Also means that you can perform fast lookups on sparsely replicated logs.

## Usage

``` js
var tree = require('append-tree')
var memdb = require('memdb')
var hypercore = require('hypercore')

var feed = hypercore(memdb()).createFeed()
var t = tree(feed)

t.append('/hello.txt', 'hello')
t.append('/world.txt', 'world')

t.list('/', function (err, list) {
  console.log(list) // prints ['hello.txt', 'world.txt']
})

t.get('/hello.txt', function (err, node) {
  console.log(node.value.toString()) // prints hello
})
```

## API

#### `var t = tree(feed)`

Create a new tree instance. `feed` should be a hypercore feed.

#### `t.append(key, value, [callback])`

Append a new value to the tree. Similar to a file system the key is split by `/` and each part treated as a tree node.
`value` can be a buffer, string or `null`.

If you append to the same key twice the last value is returned by subsequent `.get`s

#### `t.list(key, callback)`

List the immediate children of a node specified by `key` (similar to a readdir call).
`callback` is called with an array of the relative names on the children.

``` js
t.append('/hello/world/foo.txt', 'bar', function () {
  t.list('/', console.log) // null, ['hello']
  t.list('/hello') // null, ['world']
  t.list('/hello/world', console.log) // null, ['foo.txt']
})
```

#### `t.get(key, callback)`

Get the tree node specified by key.

The node returned looks like this

``` js
{
  seq: 0, // log sequence number
  path: ['hello', 'world', 'foo.txt'],
  value: new Buffer('bar'),
  index: <internal tree index buffer>
}
```

#### `var oldTree = t.checkout(seq)`

Checkout the at an older version. The checked out tree will be readonly.

#### `var stream = t.history([options])`

Stream out all the changes on the tree.

#### `t.proof(key, callback)`

Get the log indexes needed to verify the value of `key` as the latest one in the tree.
Useful if you are replicating the log and want to avoid roundtrips.

## License

MIT
