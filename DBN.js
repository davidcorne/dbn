//=============================================================================
var DBN = (typeof exports == 'undefined') ? {} : exports;

//=============================================================================
DBN.Types = {
    word:   'word',
    symbol: 'symbol',
    number: 'number',
    validType: function(token) {
        return token.type === DBN.Types.word ||
            token.type === DBN.Types.symbol ||
            token.type === DBN.Types.number;
    },
    Verifier: {
        word:   /^[A-Za-z]\w*$/,
        symbol: /^[\[\{\}\]\+\-*\/\(\)?]$/,
        number: /^[0-9]+$/,
        verify: function(token) {
            if (!DBN.Types.validType(token)) {
                // Unknown type.
                throw DBN.internalError(
                    'Unknown token type: "' + token.type + '".',
                    token
                );
            }
            return this[token.type].test(token.value);
        },
    }
};

//=============================================================================
DBN.Loggable = function(name, level, message, token) {
    this.name = name;
    this.level = level;
    this.message = message;
    this.token = token;

    this.toString = function() {
        // {level}:  {message}
        // Location: {line}:{column}
        //           {context}
        //           {^ at error location}

        // e.g.
        // Error:    Use of undeclared identifier "a".
        // Location: 10:9
        //   Line 10 a 50 b
        //           ^
        var levelPadding = Math.max(8 - this.level.length, 0) + 1;
        var locationPadding = Math.max(this.level.length - 8, 0) + 1;
        return this.level
            + ': '
            + Array(levelPadding).join(' ')
            + this.message
            + '\nLocation: '
            + Array(locationPadding).join(' ')
            + this.token.line
            + ':'
            + this.token.column
            + '\n  '
            + this.token.context
            + '\n  '
            + Array(this.token.column).join(' ')
            + '^';
    };
}

//=============================================================================
DBN.inputError = function(message, token) {
    return new DBN.Loggable('InputError', 'Error', message, token);
}

//=============================================================================
DBN.internalError = function(message, token) {
    return new DBN.Loggable('InternalError', 'Error', message, token);
}

//=============================================================================
DBN.lex = function(code) {
    // Split this into lines.
    var tokens = [];
    var lines = code.split('\n');

    for (var i = 0; i < lines.length; ++i) {
        // Remove any comments
        var line = lines[i].replace(/\/\/.*$/, '');

        // Tokenise the line, add the column numbers
        var newCurrent = function(column) {
            return {
                value:   '',
                line:    i + 1,
                column:  column,
                context: lines[i]
            };
        };
        var current = newCurrent(0);
        var lineTokens = [];
        for (var j = 0; j < line.length; ++j) {
            if (/\s/.test(line[j])) {
                lineTokens.push(current);
                current = newCurrent(j + 1);
            } else if (/\W/.test(line[j])) {
                // This is a symbol, push the current
                lineTokens.push(current);

                // Push the symbol (they are only 1 character)
                var symbol = newCurrent(j);
                symbol.value = line[j];
                lineTokens.push(symbol);

                // Make a new current token
                current = newCurrent(j + 1);
            } else {
                current.value += line[j];
            }
        }
        // Add the rest of the line
        lineTokens.push(current);

        // No 0 length tokens
        lineTokens = lineTokens.filter(function(token) {
            return token.value.length > 0;
        });

        // Create token maps for each token
        lineTokens = lineTokens.map(function(token) {
            if (!isNaN(token.value)) {
                token.type = DBN.Types.number;
            } else {
                // \W is a non-word character, like [^A-Za-z0-0_]
                token.type =
                    /\W/.test(token.value) ? DBN.Types.symbol : DBN.Types.word;
            }
            return token;
        });
        tokens = tokens.concat(lineTokens);
    }
    return tokens;
}

//=============================================================================
DBN.newCommand = function(token, name, arguments) {
    return {
        name: name,
        arguments: arguments
    };
}

//=============================================================================
DBN.getNegativeNumber = function(token, tokens, context) {
    if (token.type !== DBN.Types.symbol || token.value !== '-') {
        throw DBN.internalError(
            'getNegativeNumber should start with "-"',
            token
        );
    }
    var numberToken = DBN.getNumber(tokens.shift(), tokens, context);
    if (numberToken.value[0] === '-') {
        numberToken.value = numberToken.value.substring(1);
    } else {
        numberToken.value = '-' + numberToken.value;
    }
    return numberToken;
}

//=============================================================================
DBN.getNumber = function(token, tokens, context) {
    // Gets a number type token from a number or variable.
    var numberToken = {};
    var keys = Object.keys(token);
    for (var i = 0; i < keys.length; ++i) {
        numberToken[keys[i]] = token[keys[i]];
    }
    if (token.type !== DBN.Types.number) {
        if (token.type === DBN.Types.word) {
            // see if it's a variable
            if (!(token.value in context)) {
                throw DBN.inputError(
                    'Use of undeclared identifier "' + token.value + '".',
                    token
                );
            }
            numberToken.type = DBN.Types.number;
            numberToken.value = context[token.value];
        } else if (token.type === DBN.Types.symbol) {
            if (token.value === '-') {
                // It's a negative number
                numberToken = DBN.getNegativeNumber(token, tokens, context);
            } else {
                // it's hopefully a '('
                numberToken = 
                    DBN.parseCalculation([], numberToken, tokens, context);
            }
        }
    }
    if (numberToken.type !== DBN.Types.number) {
        throw DBN.internalError(
            'numberToken is not a number. ' + numberToken.toString(),
            numberToken
        );
    }
    return numberToken;
}

//=============================================================================
DBN.parsePaper = function(body, current, tokens, context) {
    DBN.verifyTokens(tokens);
    if (tokens.length === 0) {
        throw DBN.inputError(
            'Unexpected program end. Paper requires 1 argument.',
            current
        );
    }
    var colour = tokens.shift();
    colour = DBN.getNumber(colour, tokens, context);

    body.push(DBN.newCommand(current, 'background', [colour.value]));
};

//=============================================================================
DBN.parsePen = function(body, current, tokens, context) {
    DBN.verifyTokens(tokens);
    if (tokens.length === 0) {
        throw DBN.inputError(
            'Unexpected program end. Pen requires 1 argument.',
            current
        );
    }
    var colour = tokens.shift();
    colour = DBN.getNumber(colour, tokens, context);

    body.push(DBN.newCommand(current, 'foreground', [colour.value]));
};

//=============================================================================
DBN.parseLine = function(body, current, tokens, context) {
    DBN.verifyTokens(tokens);
    if (tokens.length < 4) {
        throw DBN.inputError(
            'Unexpected program end. Line requires 4 arguments.',
            current
        );
    }
    var startX = tokens.shift();
    startX = DBN.getNumber(startX, tokens, context);

    var startY = tokens.shift();
    startY = DBN.getNumber(startY, tokens, context);

    var endX = tokens.shift();
    endX = DBN.getNumber(endX, tokens, context);

    var endY = tokens.shift();
    endY = DBN.getNumber(endY, tokens, context);

    body.push(
        DBN.newCommand(
            current,
            'line',
            [startX.value, startY.value, endX.value, endY.value]
        )
    );
};

//=============================================================================
DBN.parseSet = function(body, current, tokens, context) {
    DBN.verifyTokens(tokens);
    if (tokens.length < 2) {
        throw DBN.inputError(
            'Unexpected program end. Set requires 2 arguments.',
            current
        );
    }
    var first = tokens.shift();
    if (first.type === DBN.Types.symbol && first.value === '[') {
        DBN.parseDot(body, first, tokens, context);
    } else {
        DBN.parseVariable(body, first, tokens, context);
    }
}

//=============================================================================
DBN.parseVariable = function(body, label, tokens, context) {
    DBN.verifyTokens(tokens);
    if (label.type !== DBN.Types.word) {
        throw DBN.inputError(
            '"' + label.value + '" is not a valid variable name.',
            label
        );
    }
    var value = tokens.shift();
    number = DBN.getNumber(value, tokens, context);
    context[label.value] = number.value;
}

//=============================================================================
DBN.parseDot = function(body, current, tokens, context) {
    // Set [a b] c
    //     ^ current
    DBN.verifyTokens(tokens);
    if (tokens.length < 4) {
        throw DBN.inputError(
            'Unexpected program end. Dot requires 4 arguments.',
            current
        );
    }
    var x = DBN.getNumber(tokens.shift(), tokens, context);
    var y = DBN.getNumber(tokens.shift(), tokens, context);
    var endBracket = tokens.shift();
    if (endBracket.type !== DBN.Types.symbol || endBracket.value !== ']') {
        throw DBN.inputError(
            'Unexpected token "' + label.value + '" a dot should be closed with ].',
            endBracket
        );
    }
    var colour = DBN.getNumber(tokens.shift(), tokens, context);
    body.push(
        DBN.newCommand(
            current,
            'point',
            [x.value, y.value, colour.value]
        )
    );
}

//=============================================================================
DBN.parseCalculation = function(body, current, tokens, context) {
    DBN.verifyTokens(tokens);
    if (current.type !== DBN.Types.symbol || current.value !== '(') {
        throw DBN.internalError(
            'parseCalculation should start with a "("',
            current
        );
    }
    if (tokens.length < 4) {
        throw DBN.inputError(
            'Unexpected program end. Calculation does not end.',
            current
        );
    }
    var recurseCalculation = function(current, tokens, context) {
        if (current.type === DBN.Types.symbol) {
            if (current.value === '(' ) {
                // Recurse the calculation
                current = DBN.parseCalculation([], current, tokens, context);
            } else if (current.value === '-') {
                // Should be a negative number
                current = DBN.getNumber(current, tokens, context);
            } else {
                throw DBN.inputError(
                    'Unexpected token "' + current.value + '".',
                    current
                );
            }
        }
        return current;
    }
    var lhs = recurseCalculation(tokens.shift(), tokens, context);
    var lhsNumber = DBN.getNumber(lhs, tokens, context);

    var operation = tokens.shift();

    var rhs = recurseCalculation(tokens.shift(), tokens, context);
    var rhsNumber = DBN.getNumber(rhs, tokens, context);

    var closeParen = tokens.shift();
    if (closeParen.type !== DBN.Types.symbol || closeParen.value !== ')') {
        throw DBN.inputError(
            'Unexpected token "' + closeParen.value + '" expected ")".',
            closeParen
        );
    }
    var common = function(token, value) {
        return {
            type: DBN.Types.number,
            value: value,
            line: token.line,
            column: token.column
        };
    };
    var calculator = {
        '+': function(l, r) {
            return common(l, (parseInt(l.value) + parseInt(r.value)).toString());
        },
        '-': function(l, r) {
            return common(l, (parseInt(l.value) - parseInt(r.value)).toString());
        },
        '*': function(l, r) {
            return common(l, (parseInt(l.value) * parseInt(r.value)).toString());
        },
        '/': function(l, r) {
            return common(l, Math.floor((parseInt(l.value) / parseInt(r.value))).toString());
        },
    };
    if (!(operation.value in calculator)) {
        throw DBN.inputError(
            '"' + operation.value + '" is not a valid operation.',
            current
        );
    }
    return calculator[operation.value](lhsNumber, rhsNumber);
}

//=============================================================================
DBN.extractBlock = function(tokens)
{
    var openingBrace = tokens.shift();
    if (openingBrace.type !== DBN.Types.symbol || openingBrace.value !== '{') {
        throw DBN.inputError(
            'Block expects to start with "{", not "' + openingBrace.value + '".',
            openingBrace
        );
    }
    // The previous token should be {type=DBN.Types.symbol, value='{'} but we
    // can't check that here.  
    // Get the tokens inside the block.
    var internalTokens = [];
    var count = 1;
    while (tokens.length > 0) {
        switch (tokens[0].value) {
        case '{' :
            count += 1;
            break;
        case '}' :
            count -= 1;
            break;
        }
        if (count === 0) {
            break;
        }
        internalTokens.push(tokens.shift());
    }
    // After taking the block body, make sure that there is a token left for
    // the brace.
    if (tokens.length === 0) {
        var token = internalTokens.length > 0 ?
            internalTokens[internalTokens.length - 1] :
            openingBrace;
        throw DBN.inputError(
            'Unexpected end to file. Block did not terminate with a "}".',
            token
        );
    }
    var closingBrace = tokens.shift();
    if (closingBrace.type !== DBN.Types.symbol || closingBrace.value !== '}') {
        throw DBN.internalError(
            'Block expects to end with "}", not "' + closingBrace.value + '".',
            closingBrace
        );
    }
    return internalTokens;
}

//=============================================================================
DBN.parseRepeat = function(body, current, tokens, context)
{
    DBN.verifyTokens(tokens);
    if (current.type !== DBN.Types.word || current.value !== 'Repeat') {
        throw DBN.internalError(
            'parseRepeat should start with a "Repeat"',
            current
        );
    }
    // Lots of tokens needed here
    if (tokens.length < 5) {
        throw DBN.inputError(
            'Unexpected program end. Repeat does not end.',
            current
        );
    }
    var variable = tokens.shift();
    if (variable.type !== DBN.Types.word) {
        throw DBN.inputError(
            'Unexpected value "' + variable.value + '". Expected a variable.',
            variable
        );
    }
    var start = DBN.getNumber(tokens.shift(), tokens, context);
    var startNum = parseInt(start.value);

    var finish = DBN.getNumber(tokens.shift(), tokens, context);
    var finishNum = parseInt(finish.value);

    var internalTokens = DBN.extractBlock(tokens);

    // increase if the finish is larger, decrease if it's smaller
    var sign = Math.sign(finishNum - startNum);
    for (var i = startNum; i != (finishNum + sign); i += sign) {
        context[variable.value] = i.toString();
        DBN.recursiveParse(body, internalTokens.slice(), context);
    }
}

//=============================================================================
DBN.parseCommand = function(body, current, tokens, context)
{
    DBN.verifyTokens(tokens);
    // Lots of tokens needed here
    if (tokens.length < 3) {
        throw DBN.inputError(
            'Unexpected program end. Command does not end.',
            current
        );
    }
    var commandName = tokens.shift();
    if (commandName.type !== DBN.Types.word) {
        throw DBN.inputError(
            'Unexpected command name "' + commandName.value + '".',
            commandName
        );
    }
    if (commandName.value in DBN.Parser) {
        throw DBN.inputError(
            'Cannot redefine keyword "' + commandName.value + '".',
            commandName
        );
    }
    if (commandName.value in context) {
        throw DBN.inputError(
            'Existing function named "' + commandName.value + '".',
            commandName
        );
    }

    // Get all of the variables
    var variables = [];
    while (tokens.length > 0) {
        var variable = tokens.shift();
        if (variable.type === DBN.Types.word) {
            // Check it's not an existing variable
            if (variable.value in context) {
                throw DBN.inputError(
                    '"' + variable.value + '" is an existing variable.',
                    variable
                );
            }
            variables.push(variable.value);
        } else if (variable.type === DBN.Types.symbol && variable.value === '{') {
            // we've finished getting variables, put the bracket back on
            // the token stack so that we can use extractBlock().
            tokens.unshift(variable);
            break;
        } else {
            throw DBN.inputError(
                'Unexpected token "' + variable.value + '".',
                variable
            );
        }
    }
    if (tokens.length === 0) {
        throw DBN.inputError(
            'Unexpected end of program.',
            current
        );
    }
    var functionBody = DBN.extractBlock(tokens);
    // Add a closure representing this command to the context
    context[commandName.value] = function(body, current, tokens, context)
    {
        var localVariables = variables.slice();
        if (tokens.length < localVariables.length) {
            throw DBN.inputError(
                'Expected ' + localVariables.length + ' arguments to "' + commandName.value + '", got ' + tokens.length + '.',
                current
            );
        }

        // Copy the existing context
        var newContext = {};
        var keys = Object.keys(context);
        for (var i = 0; i < keys.length; ++i) {
            newContext[keys[i]] = context[keys[i]];
        }

        // Add the values of the variables given in the function call to the
        // context.
        while (localVariables.length > 0) {
            var variableName = localVariables.shift();
            var variableValue = DBN.getNumber(tokens.shift(), tokens, context);
            newContext[variableName] = variableValue.value;
        }
        DBN.recursiveParse(body, functionBody.slice(), newContext);
    }
}

//=============================================================================
DBN.parseSame = function(body, current, tokens, context)
{
    DBN.parseCheck(body, current, tokens, context, function(lhs, rhs) {
        return lhs.value === rhs.value;
    });
}

//=============================================================================
DBN.parseNotSame = function(body, current, tokens, context)
{
    DBN.parseCheck(body, current, tokens, context, function(lhs, rhs) {
        return lhs.value !== rhs.value;
    });
}

//=============================================================================
DBN.parseSmaller = function(body, current, tokens, context)
{
    DBN.parseCheck(body, current, tokens, context, function(lhs, rhs) {
        return parseInt(lhs.value) < parseInt(rhs.value);
    });
}

//=============================================================================
DBN.parseNotSmaller = function(body, current, tokens, context)
{
    DBN.parseCheck(body, current, tokens, context, function(lhs, rhs) {
        return !(parseInt(lhs.value) < parseInt(rhs.value));
    });
}

//=============================================================================
DBN.parseCheck = function(body, current, tokens, context, check) {
    DBN.verifyTokens(tokens);
    if (tokens.length < 5) {
        throw DBN.inputError(
            'Unexpected program end. same? does not end.',
            current
        );
    }
    var questionMark = tokens.shift();
    if (questionMark.type !== DBN.Types.symbol || questionMark.value !== '?') {
        throw DBN.inputError(
            'Expected same?, not "same' + questionMark.value + '".',
            questionMark
        );
    }
    var lhs = DBN.getNumber(tokens.shift(), tokens, context);
    var rhs = DBN.getNumber(tokens.shift(), tokens, context);

    var block = DBN.extractBlock(tokens);
    if (check(lhs, rhs)) {
        DBN.recursiveParse(body, block, context);
    }
}

//=============================================================================
DBN.verifyTokens = function(tokens)
{
    for (var i = 0; i < tokens.length; ++i) {
        var token = tokens[i];
        if (!DBN.Types.Verifier.verify(token)) {
            // The regex doesn't match, the tokens value doesn't match it's
            // type. Should only see this internally.
            throw DBN.internalError(
                'Token "' + token.value + '" doesn\'t match it\'s type: "' + token.type + '"',
                token
            );
        }
    }
}

//=============================================================================
DBN.Parser = {
    Paper:      DBN.parsePaper,
    Pen:        DBN.parsePen,
    Line:       DBN.parseLine,
    Set:        DBN.parseSet,
    Repeat:     DBN.parseRepeat,
    Command:    DBN.parseCommand,
    Same:       DBN.parseSame,
    NotSame:    DBN.parseNotSame,
    Smaller:    DBN.parseSmaller,
    NotSmaller: DBN.parseNotSmaller,
};

//=============================================================================
DBN.recursiveParse = function(body, tokens, context) {
    DBN.verifyTokens(tokens);
    while (tokens.length > 0) {
        var current = tokens.shift();
        if (current.type === DBN.Types.word) {
            if (current.value in DBN.Parser) {
                DBN.Parser[current.value](body, current, tokens, context);
            } else {
                // Not a known keyword, see if it's a function
                if (!(current.value in context)) {
                    throw DBN.inputError(
                        '"' + current.value + '" is not a valid keyword.',
                        current
                    );
                }
                var localFunction = context[current.value];
                // It's in the context, make sure it's a function not a
                // variable.
                if (typeof localFunction !== 'function') {
                    // it's not a function
                    throw DBN.inputError(
                        'Unexpected variable "' + current.value + '".',
                        current
                    );
                }
                // It's got to here, it's a custom command
                localFunction(body, current, tokens, context);
            }
        } else {
            // There's an isolated number or other token type in the middle of
            // no-where, that's an error.
            throw DBN.inputError(
                'Unexpected token "' + current.value + '".',
                current
            );
        }
    }
}

//=============================================================================
DBN.parse = function(tokens, context) {
    DBN.verifyTokens(tokens);
    context = (typeof context == 'undefined') ? {} : context;
    var AST = {
        type: 'drawing',
        body: [],
    };
    DBN.recursiveParse(AST.body, tokens, context);
    return AST;
}

//=============================================================================
DBN.compile = function(program, outputFormat) {
    // Do the generic stuff
    var lexed = DBN.lex(program);
    var ast = DBN.parse(lexed);
    // Now get the output
    var transformed = outputFormat.transform(ast);
    return outputFormat.generate(transformed);
};

//=============================================================================
DBN.SVG = {
    options: {
        width: 100,
        height: 100
    }
};

//=============================================================================
DBN.SVG.Transformer = function(svgAST) {
    this.svgAST = svgAST;
    this.penColour = 100; // the default

    this.rgb = function(colour) {
        colour = 100 - colour;
        return 'rgb(' + colour + '%,' + colour + '%,' + colour + '%)';
    };

    this.x = function(x) {
        return parseInt(x);
    }

    this.y = function(y) {
        return 100 - y;
    }

    this.background = function(node) {
        this.svgAST.body.push({
            tag: 'rect',
            attributes: {
                x: 0,
                y: 0,
                width: 100,
                height:100,
                fill: this.rgb(node.arguments[0])
            },
            body: []
        });
    };

    this.foreground = function(node) {
        this.penColour = node.arguments[0];
    };
    this.line = function(node) {
        this.svgAST.body.push({
            tag: 'line',
            attributes: {
                x1: this.x(node.arguments[0]),
                y1: this.y(node.arguments[1]),
                x2: this.x(node.arguments[2]),
                y2: this.y(node.arguments[3]),
                stroke: this.rgb(this.penColour),
                'stroke-linecap': 'round'
            },
            body: []
        });
    };
    this.point = function(node) {
        this.svgAST.body.push({
            tag: 'rect',
            attributes: {
                x: this.x(node.arguments[0]),
                y: this.y(node.arguments[1]),
                width: 1,
                height: 1,
                fill: this.rgb(node.arguments[2]),
            },
            body: []
        });
    }

    this.execute = function(body) {
        while (body.length > 0) {
            var node = body.shift();
            if (!(node.name in this)) {
                throw DBN.internalError(
                    'Ill formed AST',
                    node
                );
            } else {
                this[node.name](node);
            }
        }
    };
};

//=============================================================================
DBN.SVG.transform = function(AST) {
    var svgAST = {
        tag: 'svg',
        attributes: {
            width: DBN.SVG.options.width,
            height: DBN.SVG.options.height,
            viewBox: '0 0 100 100',
            xmlns: 'http://www.w3.org/2000/svg',
            version: '1.1'
        },
        body: [],
    };
    var transformer = new DBN.SVG.Transformer(svgAST);
    transformer.execute(AST.body);
    return svgAST;
};

//=============================================================================
DBN.SVG.generate = function(svgAST) {
    var output = '<' + svgAST.tag + ' ';
    // add the attributes.
    var attributes = Object.keys(svgAST.attributes).map(function(key) {
        return key + '="' + svgAST.attributes[key] + '"';
    });
    output += attributes.join(' ') + '>';
    // add the children
    for (var i = 0; i < svgAST.body.length; ++i) {
        output += DBN.SVG.generate(svgAST.body[i]);
    }
    output += '</' + svgAST.tag + '>'
    return output;
};

//=============================================================================
DBN.SVG.compile = function(program) {
    return DBN.compile(program, DBN.SVG);
}

//=============================================================================
DBN.Raster = {};

//=============================================================================
DBN.Raster.Transformer = function(bitAST) {
    this.bitAST = bitAST;
    this.penColour = 100; // the default

    this.x = function(x) {
        return parseInt(x);
    }

    this.y = function(y) {
        return 100 - y;
    }

    this.background = function(node) {
        this.bitAST.background = node.arguments[0];
    };
    this.foreground = function(node) {
        this.penColour = node.arguments[0];
    };
    this.setPoint = function(i, j, colour) {
        if (0 <= i && i <= 100 && 0 <= j && j <= 100) {
            // It's a valid point
            this.bitAST.pixels[j][i] = colour;
        }
    };
    
    this.line = function(node) {
        // Use Bresenham's algorithm
        var x0 = this.x(node.arguments[0]);
        var y0 = this.y(node.arguments[1]);
        var x1 = this.x(node.arguments[2]);
        var y1 = this.y(node.arguments[3]);
        
        var dx = Math.abs(x1-x0);
        var dy = Math.abs(y1-y0);
        var sx = (x0 < x1) ? 1 : -1;
        var sy = (y0 < y1) ? 1 : -1;
        var err = dx - dy;

        while(true){
            this.setPoint(x0, y0, this.penColour);
            if ((x0==x1) && (y0==y1)) {
                break;
            }
            var e2 = 2 * err;
            if (e2 > -dy){
                err -= dy;
                x0  += sx; 
            }
            if (e2 < dx){
                err += dx; 
                y0  += sy; 
            }
        }
    };

    this.point = function(node) {
        var i = this.x(node.arguments[0]);
        var j = this.y(node.arguments[1]);
        var colour = node.arguments[2];
        this.setPoint(i, j, colour);
    };

    this.execute = function(body) {
        while (body.length > 0) {
            var node = body.shift();
            if (!(node.name in this)) {
                throw DBN.internalError(
                    'Ill formed AST',
                    node
                );
            } else {
                this[node.name](node);
            }
        }
    };
}

//=============================================================================
DBN.Raster.transform = function(AST) {
    var dim = 101;
    var bitAST = {
        background: '0',
        pixels: new Array(dim),
    };
    // Initialise the pixels
    for (var i = 0; i < dim; ++i) {
        var current = new Array(dim);
        for (var j = 0; j < dim; ++j) {
            current[j] = 'b';
        }
        bitAST.pixels[i] = current;
    }
    var transformer = new DBN.Raster.Transformer(bitAST);
    transformer.execute(AST.body);
    return bitAST;
};

DBN.Raster.iterativeFormat = function(output) {
    return {
        output: output,
        generate: function(rasterAST) {
            var output = '';
            for (var i = 0; i < 101; ++i) {
                var line = '';
                for (var j = 0; j < 101; ++j) {
                    var colour = rasterAST.pixels[i][j];
                    if (colour === 'b') {
                        colour = rasterAST.background;
                    }
                    line += this.output(colour);
                }
                line += '\n';
                output += line;
            }
            return output;
        },
    }
}

//=============================================================================
DBN.Raster.Test = DBN.Raster.iterativeFormat(function(colour) {
    // a test image format. It is just the pixel values, padded to 3 spaces in
    // the right order.
    var output = '' + colour;
    for (var i = 0; i < (3 - colour.length); ++i) {
        output += ' ';
    }
    output += ' ';
    return output;
})

//=============================================================================
DBN.Raster.Binary = DBN.Raster.iterativeFormat(function(colour) {
    // a binary test image format. It is a o or ' ' for each pixel.
    return parseInt(colour) < 50 ? ' ' : 'o';  
})

//=============================================================================
DBN.RasterOutput = function(type) {
    this.type = type;
    this.generate = function(ast) {
        switch (this.type) {
        case 'test':
            return DBN.Raster.Test.generate(ast);
            break;
        case 'binary':
            return DBN.Raster.Binary.generate(ast);
            break;
        default:
            throw DBN.internalError(
                'Unknown raster type "' + this.type + '".'
            );
        }
    };
    this.transform = DBN.Raster.transform;
};
