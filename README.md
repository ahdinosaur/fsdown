[![Travis](https://secure.travis-ci.org/ahdinosaur/fsdown.png)](http://travis-ci.org/ahdinosaur/fsdown)

This is a drop-in replacement for [LevelDOWN][] that writes to
files on disk.

It also retains the contents in memory, so
it's only really useful for debugging purposes and/or very small
data stores that need just a pinch of persistence.

Forked from [jsondown](https://github.com/toolness/jsondown).

## Example

```js
var levelup = require('levelup');
var db = levelup('./mydata', { db: require('fsdown')('json') });

db.put('foo', 'bar');
```

  [LevelDOWN]: https://github.com/rvagg/node-leveldown
