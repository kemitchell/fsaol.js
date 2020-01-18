const endOfStream = require('end-of-stream')
const flushWriteStream = require('flush-write-stream')
const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const pump = require('pump')
const runSeries = require('run-series')
const split2 = require('split2')
const through2 = require('through2')
const touch = require('touch')

module.exports = FilesystemAppendOnlyLog

function FilesystemAppendOnlyLog (options) {
  if (!(this instanceof FilesystemAppendOnlyLog)) {
    return new FilesystemAppendOnlyLog(options)
  }

  const directory = options.directory
  if (typeof directory !== 'string') {
    throw new TypeError('directory not string')
  }
  this.directory = directory
  this.logPath = path.join(directory, 'log')
  this.entriesPath = path.join(directory, 'entries')

  const encoding = options.encoding
  if (
    typeof encoding !== 'object' ||
    typeof encoding.stringify !== 'function' ||
    typeof encoding.parse !== 'function'
  ) throw new TypeError('encoding not Object with stringify and parse functions')
  this.encoding = encoding

  const hashFunction = options.hashFunction
  if (typeof hashFunction !== 'function') {
    throw new TypeError('hashFunction not function')
  }
  this.hashFunction = hashFunction

  // Calculate an example hash to determine its length.
  this.digestBytes = Buffer.from(
    hashFunction(encoding.stringify('x'))
  ).length
  // The length of a line in the log file is the length
  // of a hash plus one for the newline delimiter.
  this.logLineBytes = this.digestBytes + 1

  const linuxPipeBuf = options.linuxPipeBuf
  if (linuxPipeBuf) {
    if (this.logLineBytes > 4096) {
      throw new Error(
        'The hash function provided produces digests ' +
        'longer than Linux PIPE_BUF. Log lines must be ' +
        'less than PIPE_BUF to write atomically.'
      )
    }
  } else if (this.logLineBytes > 512) {
    throw new Error(
      'The hash function provided produces digests ' +
      'longer than POSIX PIPE_BUF. Log lines must be ' +
      'less than PIPE_BUF to write atomically.' +
      'Set linuxPipeBuf to true if you will run only ' +
      'on Linux and can rely on Linux\' 4096-byte PIPE_BUF.'
    )
  }
}

const prototype = FilesystemAppendOnlyLog.prototype

prototype.initialize = function (callback) {
  runSeries([
    (done) => mkdirp(this.entriesPath, done),
    (done) => touch(this.logPath, done)
  ], callback)
}

prototype.write = function (entry, callback) {
  const stringified = this.encoding.stringify(entry)
  const digest = this.hashFunction(stringified)
  const logLine = digest + '\n'
  runSeries([
    (done) => fs.writeFile(
      this._entryPath(digest), stringified, { flag: 'w' }, done
    ),
    (done) => fs.writeFile(
      this.logPath, logLine, { flag: 'a' }, done
    )
  ], callback)
}

prototype.read = function (index, callback) {
  fs.open(this.logPath, 'r', (error, fd) => {
    if (error) return callback(error)
    const length = this.digestBytes
    const buffer = Buffer.alloc(length)
    const offset = 0
    const position = this.logLineBytes * index
    fs.read(fd, buffer, offset, length, position, (error) => {
      if (error) {
        fs.close(fd, () => { /* pass */ })
        return callback(error)
      }
      fs.close(fd, (error) => {
        if (error) return callback(error)
        const digest = buffer.toString()
        this._readEntryByDigest(digest, callback)
      })
    })
  })
}

const hasOwnProperty = Object.prototype.hasOwnProperty

prototype.stream = function (options) {
  options = options || {}
  return pump(
    this._streamDigests(options),
    through2.obj((digest, _, done) => {
      this._readEntryByDigest(digest, done)
    })
  )
}

prototype.watch = function (options) {
  options = options || {}
  const self = this
  let position = options.start || 0
  let changeSinceStream = false
  let streaming = false
  const returned = through2.obj()
  const watcher = fs.watch(this.logPath, () => {
    if (streaming) changeSinceStream = true
    else streamEntries()
  })
  endOfStream(returned, stopWatching)
  streamEntries()
  return returned

  function stopWatching () {
    watcher.close()
  }

  function streamEntries () {
    streaming = true
    changeSinceStream = false
    pump(
      self._streamDigests({ start: position }),
      flushWriteStream.obj((digest, _, done) => {
        position++
        self._readEntryByDigest(digest, (error, entry) => {
          if (error) return done(error)
          returned.write(entry, done)
        })
      }),
      (error) => {
        streaming = false
        if (error) {
          returned.emit('error', error)
          return returned.end()
        }
        if (changeSinceStream) streamEntries()
      }
    )
  }
}

prototype.head = function (callback) {
  fs.stat(this.logPath, (error, stats) => {
    if (error) return callback(error)
    callback(null, stats.size / this.logLineBytes)
  })
}

// Private Helper Methods

prototype._readEntryByDigest = function (digest, callback) {
  fs.readFile(this._entryPath(digest), 'utf8', (error, data) => {
    if (error) return callback(error)
    try {
      var parsed = this.encoding.parse(data)
    } catch (error) {
      return callback(error)
    }
    callback(null, parsed)
  })
}

prototype._entryPath = function (digest) {
  return path.join(this._entriesPath(), digest)
}

prototype._streamDigests = function (options) {
  options = options || {}
  return pump(
    fs.createReadStream(this.logPath, {
      start: hasOwnProperty.call(options, 'start')
        ? (options.start * this.logLineBytes)
        : 0
    }),
    split2()
  )
}
