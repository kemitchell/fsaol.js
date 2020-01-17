var FSAOL = require('./')
var crypto = require('crypto')
var fs = require('fs')
var os = require('os')
var path = require('path')
var rimraf = require('rimraf')
var runSeries = require('run-series')
var tape = require('tape')

var encoding = JSON

tape('init, write, stream, read, head', (test) => {
  var directory, aol
  var entry = { x: 1 }
  runSeries([
    (done) => {
      fs.mkdtemp(path.join(os.tmpdir(), 'fsaol-'), (error, tmp) => {
        if (error) return done(error)
        directory = tmp
        aol = new FSAOL({ hashFunction, encoding, directory })
        done()
      })
    },
    (done) => aol.initialize(done),
    (done) => aol.write(entry, done),
    (done) => {
      var streamed = []
      aol.stream()
        .on('data', (entry) => { streamed.push(entry) })
        .once('end', () => {
          test.deepEqual(streamed[0], entry, 'stream')
          done()
        })
    },
    (done) => {
      aol.read(0, (error, read) => {
        if (error) return done(error)
        test.deepEqual(read, entry, 'read')
        done()
      })
    },
    (done) => {
      aol.head((error, head) => {
        if (error) return done(error)
        test.equal(head, 1, 'head')
        done()
      })
    }
  ], (error) => {
    test.ifError(error, 'no error')
    test.end()
    rimraf.sync(directory)
  })
})

tape('init, write multiple, stream with offset', (test) => {
  var directory, aol
  var entries = [{ x: 1 }, { y: 2 }, { z: 3 }]
  runSeries([
    (done) => {
      fs.mkdtemp(path.join(os.tmpdir(), 'fsaol-'), (error, tmp) => {
        if (error) return done(error)
        directory = tmp
        aol = new FSAOL({ hashFunction, encoding, directory })
        done()
      })
    },
    (done) => aol.initialize(done),
    (done) => runSeries(
      entries.map((entry) => (done) => { aol.write(entry, done) }),
      done
    ),
    (done) => {
      var streamed = []
      aol.stream({ start: 1 })
        .on('data', (entry) => { streamed.push(entry) })
        .once('end', () => {
          test.deepEqual(streamed, entries.slice(1), 'streams')
          done()
        })
    }
  ], (error) => {
    test.ifError(error, 'no error')
    test.end()
    rimraf.sync(directory)
  })
})

tape('hash > PIPE_BUF', (test) => {
  test.throws(() => {
    // eslint-disable-next-line no-new
    new FSAOL({
      hashFunction: longHashFunction,
      directory: os.tmpdir(),
      encoding
    })
  }, /PIPE_BUF/)
  test.end()
})

tape('hash < Linux PIPE_BUF', (test) => {
  test.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new FSAOL({
      hashFunction: longHashFunction,
      directory: os.tmpdir(),
      linuxPipeBuf: true,
      encoding
    })
  })
  test.end()
})

tape('construct without new', (test) => {
  test.doesNotThrow(() => {
    FSAOL({
      hashFunction,
      directory: os.tmpdir(),
      encoding
    })
  })
  test.end()
})

function hashFunction (data) {
  return crypto.createHash('sha256')
    .update(data)
    .digest('hex')
}

function longHashFunction (data) {
  return hashFunction(data).repeat(10)
}
