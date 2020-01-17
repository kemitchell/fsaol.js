const FSAOL = require('./')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const rimraf = require('rimraf')
const runSeries = require('run-series')
const tape = require('tape')

const encoding = JSON

tape('init, write, stream, read, head', (test) => {
  let directory, aol
  const entry = { x: 1 }
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
      const streamed = []
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
  let directory, aol
  const entries = [{ x: 1 }, { y: 2 }, { z: 3 }]
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
      const streamed = []
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

tape('hash > Linux PIPE_BUF', (test) => {
  test.throws(() => {
    // eslint-disable-next-line no-new
    new FSAOL({
      hashFunction: (input) => {
        return hashFunction(input).repeat(100)
      },
      directory: os.tmpdir(),
      linuxPipeBuf: true,
      encoding
    })
  }, /PIPE_BUF/)
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

tape('construct without directory', (test) => {
  test.throws(() => {
    FSAOL({ hashFunction, encoding })
  }, /directory/)
  test.end()
})

tape('construct without encoding', (test) => {
  test.throws(() => {
    FSAOL({
      hashFunction,
      directory: os.tmpdir()
    })
  }, /encoding/)
  test.end()
})

tape('construct without hash function', (test) => {
  test.throws(() => {
    FSAOL({
      directory: os.tmpdir(),
      encoding
    })
  }, /hashFunction/)
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
