var index = {}

//= ============================================================================
index.textChange = function () {
  // The text hin the input area has changed, re-compile the SVG
  index.recompile()
}

//= ============================================================================
index.recompile = function () {
  // Get the text from the textarea
  var textarea = document.getElementById('input')
  var text = textarea.value

  // Get the output areas
  var tokensView = document.getElementById('tokens')
  var astView = document.getElementById('ast')
  var transformedAstView = document.getElementById('transformed-ast')
  var outputArea = document.getElementById('output')

  // Clear them.
  tokensView.innerHTML = ''
  astView.innerHTML = ''
  transformedAstView.innerHTML = ''
  outputArea.innerHTML = ''

  // Compile it
  var outputGuts = true
  // Clear the output first

  try {
    DBN.SVG.options.width = 400
    DBN.SVG.options.height = 400

    // Get the guts
    var tokens = DBN.lex(text)
    if (outputGuts) {
      tokensView.innerHTML = JSON.stringify(tokens)
    }

    var ast = DBN.parse(tokens)
    if (outputGuts) {
      astView.innerHTML = JSON.stringify(ast)
    }

    var transformedAst = DBN.SVG.transform(ast)
    if (outputGuts) {
      transformedAstView.innerHTML = JSON.stringify(transformedAst)
    }

    // Now get it all
    var output = DBN.SVG.generate(transformedAst)
  } catch (error) {
    var output = '<p class="error">' + error.toString() + '</p>'
    output = output.replace(new RegExp('\n', 'g'), '<br>')
  }
  // Add that to the output
  outputArea.innerHTML = output
}
