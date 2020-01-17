```javascript
const FSAOL = require('./')
const crypto = require('crypto')
const assert = require('assert')

const aol = new FSAOL({
  directory: './readme-example',
  encoding: JSON,
  hashFunction: (input) => crypto.createHash('sha256')
    .update(input)
    .digest('hex')
})

const entry = { x: 1 }

aol.initialize((error) => {
  assert.ifError(error)

  aol.write(entry, (error) => {
    assert.ifError(error)

    aol.head((error, head) => {
      assert.ifError(error)
      assert(head === 1)
    })

    aol.read(0, (error, read) => {
      assert.ifError(error)
      assert.deepStrictEqual(read, entry)
    })

    const entries = []
    aol.stream()
      .on('data', (entry) => { entries.push(entry) })
      .once('end', () => {
        assert.deepStrictEqual(entries, [entry])
      })
  })
})
```
