#!node
var fs = require('fs')
var dbn = require('./DBN')
var mkdirp = require('mkdirp')

var displayOutput = true

//= ============================================================================
var output = function (title, data) {
  if (displayOutput) {
    console.log(
      '===============================================================================\n' +
                title +
                '\n' +
                '===============================================================================\n' +
                JSON.stringify(data, null, 4)
    )
  }
}

fs.readFile('data.dbn', 'utf8', function (error, data) {
  if (error) {
    console.log(error.toString())
  } else {
    try {
      var lexed = dbn.lex(data)
      // <nnn> output('Lexed:', lexed);
      var parsed = dbn.parse(lexed)
      // <nnn> output('Parsed:', parsed);

      var svg = dbn.compile(data, dbn.SVG)
      var test = dbn.compile(data, new dbn.RasterOutput('test'))
      var bin = dbn.compile(data, new dbn.RasterOutput('binary'))

      // Write them to files
      var errorCallback = function (error) {
        if (error) {
          console.log('An error has occured:')
          console.log(error)
        }
      }
      mkdirp.sync('out')
      fs.writeFile('out/data.svg', svg, errorCallback)
      fs.writeFile('out/data.test', test, errorCallback)
      fs.writeFile('out/data.binary', bin, errorCallback)
    } catch (error) {
      console.log(error.toString())
    }
  }
})
