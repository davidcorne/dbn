var chai = require('chai');
chai.use(require('chai-string'));
chai.use(require('chai-fs'));

var assert = chai.assert;
var DBN = require('./DBN');
var fs = require('fs');

//=============================================================================
describe('DBN infrastructure', function() {
    it('Error', function() {
        var loggable = new DBN.Loggable(
            'testName',
            'testLevel',
            'testMessage',
            {
                line:73,
                column: 6,
                context: 'this is an error line!'
            }
        );
        assert.strictEqual(loggable.name, 'testName');
        assert.strictEqual(loggable.level, 'testLevel');
        assert.strictEqual(loggable.message, 'testMessage');
        assert.strictEqual(loggable.token.line, 73);
        assert.strictEqual(loggable.token.column, 6);
        assert.strictEqual(loggable.token.context, 'this is an error line!');

        var output = loggable.toString();
        assert.include(output, 'testLevel');
        assert.include(output, 'testMessage');
        assert.include(output, '73');
        assert.include(output, '6');
        assert.include(output, '  this is an error line!');
        assert.include(output, '       ^');
    });
});

//=============================================================================
describe('Lexing', function() {
    assert.tokensEqual = function(result, expected) {
        assert.strictEqual(result.length, expected.length);
        for (var i = 0; i < result.length; ++i) {
            // The keys in the expected will be a subset of the ones in results
            var keys = Object.keys(expected[i]);
            for (var j = 0; j < keys.length; ++j) {
                assert.strictEqual(
                    result[i][keys[j]],
                    expected[i][keys[j]]
                );
            }
        }
    }
    it('lexer should recognise words and numbers', function() {
        // Note, this isn't a valid program but the lexer doesn't care
        var result = DBN.lex('this is not valid syntax 2 4 g');
        var expected = [
            {type: 'word',   value: 'this'},
            {type: 'word',   value: 'is'},
            {type: 'word',   value: 'not'},
            {type: 'word',   value: 'valid'},
            {type: 'word',   value: 'syntax'},
            {type: 'number', value: '2'},
            {type: 'number', value: '4'},
            {type: 'word',   value: 'g'},
        ];
        assert.tokensEqual(result, expected);
    });
    it('lexer should allow newlines', function() {
        var program = 'Paper 10\n\
Pen 50\n\
Line 0 0 100 100\n\
Pen 100\n\
Line 0 100 100 0\n\
';
        // This should not throw, we don't care about the result
        var result = DBN.lex(program);
        assert.isNotNull(result);

        program = 'Line one\r\n\
line two\r\n\
line three\
'
        result = DBN.lex(program);
        assert.isNotNull(result);
        var expected = [
            {type: 'word', value: 'Line',  line: 1},
            {type: 'word', value: 'one',   line: 1},
            {type: 'word', value: 'line',  line: 2},
            {type: 'word', value: 'two',   line: 2},
            {type: 'word', value: 'line',  line: 3},
            {type: 'word', value: 'three', line: 3},
        ];
        assert.tokensEqual(result, expected);
    });
    it('lexer output should contain line and column numbers.', function() {
        var program = `something else
is is here
 { }
also here
`
        var result = DBN.lex(program);
        var expected = [
            {value: 'something', line: 1, column: 0},
            {value: 'else',      line: 1, column: 10},
            {value: 'is',        line: 2, column: 0},
            {value: 'is',        line: 2, column: 3},
            {value: 'here',      line: 2, column: 6},
            {value: '{',         line: 3, column: 1},
            {value: '}',         line: 3, column: 3},
            {value: 'also',      line: 4, column: 0},
            {value: 'here',      line: 4, column: 5},
        ];
        assert.tokensEqual(result, expected);
    });
    it('lexer should strip out comments', function() {
        var program = `
// this is a comment in the program
Line 100
Pen 100 // this is an inline comment.
this is an invalid program
`
        result = DBN.lex(program);
        // There should be 9 tokens;
        // Line 100 Pen 100 this is an invalid program
        assert.strictEqual(result.length, 9);
        var expected = [
            {value: 'Line'},
            {value: '100'},
            {value: 'Pen'},
            {value: '100'},
            {value: 'this'},
            {value: 'is'},
            {value: 'an'},
            {value: 'invalid'},
            {value: 'program'},
        ];
        assert.tokensEqual(result, expected);
    });

    it('Should lex symbols', function() {
        var program = '{ something { { }';
        var expectedTokens = [
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'something'},
            {type: 'symbol', value: '{'},
            {type: 'symbol', value: '{'},
            {type: 'symbol', value: '}'},
        ];
        var result = DBN.lex(program);
        assert.tokensEqual(result, expectedTokens);

        program = '[0 1]'
        expectedTokens = [
            {type: 'symbol', value: '[', column: 0},
            {type: 'number', value: '0', column: 1},
            {type: 'number', value: '1', column: 3},
            {type: 'symbol', value: ']', column: 4},
        ];
        result = DBN.lex(program);
        assert.tokensEqual(result, expectedTokens);

        program = 'Line (X - r) (Y - r) (X + r) (Y + r)'
        result = DBN.lex(program);
        assert.strictEqual(result.length, 21);
    });
});

//=============================================================================
describe('Parsing', function() {
    assert.bodyEqual = function(result, expected) {
        assert.strictEqual(
            result.length,
            expected.length,
            'Body length is incorrect.'
        );
        for (var i = 0; i < result.length; ++i) {
            assert.strictEqual(
                result[i].type,
                expected[i].type,
                'Element "' + i + '" has the wrong type.'
            );
            assert.strictEqual(
                result[i].name,
                expected[i].name,
                'Element "' + i + '" has the wrong name.'
            );
            assert.strictEqual(
                result[i].arguments.length,
                expected[i].arguments.length,
                'Element "' + i + '" has the wrong number of arguments.'
            );
            for (var j = 0; j < result[i].arguments.length; ++j) {
                assert.strictEqual(
                    result[i].arguments[j],
                    expected[i].arguments[j],
                    'Element "' + i + '" has the wrong argument "' + j + '".'
                );
            }
        }
    };
    assert.astEqual = function(result, expected) {
        assert.strictEqual(
            result.type,
            expected.type
        );
        assert.bodyEqual(result.body, expected.body);
    }
    it('parser should make a simple AST', function() {
        // Has the program:
        //   Paper 0
        //   Pen 100
        //   Line 0 0 100 100
        var tokens = [
            {type: 'word',   value: 'Paper'},
            {type: 'number', value: '0'},
            {type: 'word',   value: 'Pen'},
            {type: 'number', value: '100'},
            {type: 'word',   value: 'Line'},
            {type: 'number', value: '0'},
            {type: 'number', value: '0'},
            {type: 'number', value: '100'},
            {type: 'number', value: '100'}
        ];
        // should be a tree like:
        var expected = {
            type: 'drawing',
            body: [
                {name: 'background', arguments: ['0'],},
                {name: 'foreground', arguments: ['100'],},
                {name: 'line',       arguments: ['0', '0', '100', '100'],},
            ],
        };

        var ast = DBN.parse(tokens);
        assert.astEqual(ast, expected);
    });
    it('parse should throw appropriate errors.', function() {
        try {
            var tokens = [
                {type: 'word', value: 'Paper', line: 1}
            ]
            DBN.parse(tokens);
            assert.fail('Should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
            assert.isNotNull(error.toString());
        }
    });

    it('verifyTokens should throw errors correctly.', function() {
        var tokens = [
            {type: 'word',   value: 'x'},
            {type: 'word',   value: 'T_his123213'},
            {type: 'symbol', value: '{'},
            {type: 'symbol', value: '}'},
            {type: 'symbol', value: '['},
            {type: 'symbol', value: ']'},
            {type: 'symbol', value: '-'},
            {type: 'symbol', value: '*'},
            {type: 'symbol', value: '/'},
            {type: 'symbol', value: '+'},
            {type: 'symbol', value: '?'},
            {type: 'number', value: '0'},
            {type: 'number', value: '05'},
            {type: 'number', value: '45245252342534563464564564324522420923413625412461342'},
        ]
        // verifyTokens will throw if it fails
        DBN.verifyTokens(tokens);

        var badTokens = [
            {type: 'word',   value: '0'},
            {type: 'word',   value: '0thign'},
            {type: 'word',   value: 'th ign'},
            {type: 'word',   value: '7'},
            {type: 'symbol', value: '{{'},
            {type: 'symbol', value: 'a'},
            {type: 'symbol', value: ' '},
            {type: 'symbol', value: '0'},
            {type: 'symbol', value: '{ '},
            {type: 'symbol', value: '{}'},
            {type: 'symbol', value: '{hi}'},
            {type: 'symbol', value: ','},
            {type: 'number', value: '-5'}, // Maybe this should be allowed?
            {type: 'number', value: ''},
            {type: 'number', value: 'a'},
            {type: 'number', value: '1e0'},
            {type: 'number', value: '?'},
            {type: 'number', value: '('},
            {type: 'number', value: ')'},
            {type: 'number', value: '['},
            {type: 'number', value: ','},
        ];

        // Make sure they are all bad
        for (var i = 0; i < badTokens.length; ++i) {
            tokens = [badTokens[i]];
            var threw = false;
            try {
                DBN.verifyTokens(tokens);
            } catch (error) {
                assert.instanceOf(error, DBN.Loggable);
                assert.strictEqual(error.name, 'InternalError');
                threw = true;
            }
            assert.isOk(
                threw,
                'Should have thrown on {type:' + badTokens[i].type + ', value:"' + badTokens[i].value + '"}.'
            );
        }
    });

    it('parseSet() should add a number to the context.', function() {
        var context = {};
        var tokens = [
            {type: 'word',   value: 'ex'},
            {type: 'number', value: '5'}
        ];
        var current = null;
        DBN.parseSet([], current, tokens, context);
        assert.strictEqual(context.ex, '5');
    });

    it('parseSet() should be set variables from other variables', function() {
        var context = {y: '7'};
        var tokens = [
            {type: 'word', value: 'g'},
            {type: 'word', value: 'y'},
        ];
        var current = null;

        DBN.parseSet([], current, tokens, context);
        assert.property(context, 'g');
        assert.strictEqual(context.g, '7');
    });

    it('getNumber()', function() {
        var context = {};

        var token = {type: 'number', value: '100'};
        var result = DBN.getNumber(token, [], context);

        assert.strictEqual(result.type, 'number');
        assert.strictEqual(result.value, '100');

        context.X = 50;
        token = {type: 'word', value: 'X'};
        result = DBN.getNumber(token, [], context);

        assert.strictEqual(result.type, 'number');
        assert.strictEqual(result.value, 50);

        token = {type: 'word', value: 'Y'};
        try {
            result = DBN.getNumber(token, [], context);
            assert.fail('The above should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }
    });
    it('parse should substitute variables', function() {
        var tokens = [
            {type: 'word', value: 'Set'},
            {type: 'word', value: 'X'},
            {type: 'number', value: '30'},
            {type: 'word', value: 'Line'},
            {type: 'word', value: 'X'},
            {type: 'number', value: '0'},
            {type: 'number', value: '100'},
            {type: 'number', value: '70'},
        ]
        var ast = DBN.parse(tokens);
        var expected = {
            type: 'drawing',
            body: [
                {name: 'line', arguments: ['30', '0', '100', '70'],}
            ]
        };
        assert.astEqual(ast, expected);
    });
    it('parseDot should make a dot.', function() {
        var tokens = [
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'number', value: '50'},
            {type: 'number', value: '7'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '20'},
        ]
        var expectedBody = [
            {name: 'point', arguments: ['50', '7', '20']}
        ]
        var result = DBN.parse(tokens);
        assert.bodyEqual(result.body, expectedBody);
    });
    it('Should parse calculations', function() {
        var current = {type: 'symbol', value: '('};
        var tokens = [
            {type: 'word',   value: 'Y'},
            {type: 'symbol', value: '+'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: ')'},
        ]
        var context = {Y: '9'};
        var output = DBN.parseCalculation([], current, tokens, context);

        assert.strictEqual(output.type, 'number');
        assert.strictEqual(output.value, '11');

        current = {type: 'symbol', value: '('};
        tokens = [
            {type: 'number', value: '8'},
            {type: 'symbol', value: '-'},
            {type: 'symbol', value: '('},
            {type: 'number', value: '3'},
            {type: 'symbol', value: '*'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: ')'},
        ]
        output = DBN.parseCalculation([], current, tokens, context);

        assert.strictEqual(output.type, 'number');
        assert.strictEqual(output.value, '2');

        // Parse negative numbers
        // (5 + -1)
        current = {type: 'symbol', value: '('};
        tokens = [
            {type: 'number', value: '5'},
            {type: 'symbol', value: '+'},
            {type: 'symbol', value: '-'},
            {type: 'number', value: '1'},
            {type: 'symbol', value: ')'},
        ]
        output = DBN.parseCalculation([], current, tokens, context);

        assert.strictEqual(output.type, 'number');
        assert.strictEqual(output.value, '4');

        // Parse negative calculations
        // (5 + ---(60 - 100))
        current = {type: 'symbol', value: '('};
        tokens = [
            {type: 'number', value: '5'},
            {type: 'symbol', value: '+'},
            {type: 'symbol', value: '-'},
            {type: 'symbol', value: '-'},
            {type: 'symbol', value: '-'},
            {type: 'symbol', value: '('},
            {type: 'number', value: '60'},
            {type: 'symbol', value: '-'},
            {type: 'number', value: '100'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: ')'},
        ]
        output = DBN.parseCalculation([], current, tokens, context);

        assert.strictEqual(output.type, 'number');
        assert.strictEqual(output.value, '45');
    });
    it('DBN.parse() should handle calculation', function() {
        // Set [(5 + 11) (3 * 2)] 5
        var tokens = [
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'symbol', value: '('},
            {type: 'number', value: '5'},
            {type: 'symbol', value: '+'},
            {type: 'number', value: '11'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: '('},
            {type: 'number', value: '3'},
            {type: 'symbol', value: '*'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '5'},
        ];
        var expectedBody = [
            {name: 'point', arguments: ['16', '6', '5']}
        ]
        var resultBody = DBN.parse(tokens).body;
        assert.bodyEqual(resultBody, expectedBody);

        // Set [-5 3] 5
        tokens = [
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'symbol', value: '-'},
            {type: 'number', value: '5'},
            {type: 'number', value: '3'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '5'},
        ]
        expectedBody = [
            {name: 'point', arguments: ['-5', '3', '5']}
        ];
        resultBody = DBN.parse(tokens).body;
        assert.bodyEqual(resultBody, expectedBody);
    });
    it('Division should be integer division', function() {
        var current = {type: 'symbol', value: '('};
        var tokens = [
            {type: 'number', value: '7'},
            {type: 'symbol', value: '/'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: ')'},
        ]
        var output = DBN.parseCalculation([], current, tokens, {});
        assert.strictEqual(output.type, 'number');
        assert.strictEqual(output.value, '3');
    });

    it('Should parse Same?', function() {

        // Same? 3 3
        // {
        //   Line 0 0 50 50
        // }
        //
        // Should give a line.

        var tokens = [
            {type: 'word',    value: 'Same'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '3'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        var result = DBN.parse(tokens).body;
        var expected = [
            {name: 'line', arguments: ['0', '0', '50', '50'],},
        ];
        assert.bodyEqual(result, expected);

        // Now change it so it's not the same.
        tokens = [
            {type: 'word',    value: 'Same'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '2'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        result = DBN.parse(tokens).body;
        assert.lengthOf(result, 0);
    });

    it('NotSame? should parse', function() {
        var tokens = [
            {type: 'word',    value: 'NotSame'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '2'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        var result = DBN.parse(tokens).body;
        var expected = [
            {name: 'line', arguments: ['0', '0', '50', '50'],},
        ];
        assert.bodyEqual(result, expected);

        // Now change it so it's not the same.
        tokens = [
            {type: 'word',    value: 'NotSame'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '3'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        result = DBN.parse(tokens).body;
        assert.lengthOf(result, 0);

    });

    it('Smaller? should parse', function() {
        var tokens = [
            {type: 'word',    value: 'Smaller'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '2'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        var result = DBN.parse(tokens).body;
        var expected = [
            {name: 'line', arguments: ['0', '0', '50', '50'],},
        ];
        assert.bodyEqual(result, expected);

        // Now change it so it's not the same.
        tokens = [
            {type: 'word',    value: 'Smaller'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '3'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        result = DBN.parse(tokens).body;
        assert.lengthOf(result, 0);

    });

    it('NotSmaller? should parse', function() {
        var tokens = [
            {type: 'word',    value: 'NotSmaller'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '5'},
            {type: 'number',  value: '5'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        var result = DBN.parse(tokens).body;
        var expected = [
            {name: 'line', arguments: ['0', '0', '50', '50'],},
        ];
        assert.bodyEqual(result, expected);

        // Now change it so it's not the same.
        tokens = [
            {type: 'word',    value: 'NotSmaller'},
            {type: 'symbol',  value: '?'},
            {type: 'number',  value: '2'},
            {type: 'number',  value: '3'},
            {type: 'symbol',  value: '{'},
            {type: 'word',    value: 'Line'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '0'},
            {type: 'number',  value: '50'},
            {type: 'number',  value: '50'},
            {type: 'symbol',  value: '}'},
        ];
        result = DBN.parse(tokens).body;
        assert.lengthOf(result, 0);

    });

    it('Should be able to parse repeats', function() {
        // Repeat i 0 2
        // {
        //   Set [i 5] 100
        // }
        var tokens = [
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '0'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '5'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '100'},
            {type: 'symbol', value: '}'},
        ];

        var expected = [
            {name: 'point', arguments: ['0', '5', '100'],},
            {name: 'point', arguments: ['1', '5', '100'],},
            {name: 'point', arguments: ['2', '5', '100'],}
        ];
        var result = DBN.parse(tokens).body;
        assert.bodyEqual(result, expected);

        // Test iterating high to low
        tokens = [
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '5'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: '{'},
            {type: 'word', value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '5'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '100'},
            {type: 'symbol', value: '}'},
        ];

        expected = [
            {name: 'point', arguments: ['5', '5', '100'],},
            {name: 'point', arguments: ['4', '5', '100'],},
            {name: 'point', arguments: ['3', '5', '100'],},
            {name: 'point', arguments: ['2', '5', '100'],}
        ];
        result = DBN.parse(tokens).body;
        assert.bodyEqual(result, expected);

        // Double repeat
        //   Repeat i 1 3 {
        //     Repeat j 20 22 {
        //       Set [i j] 50
        //     }
        //   }
        tokens = [
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '1'},
            {type: 'number', value: '3'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'j'},
            {type: 'number', value: '20'},
            {type: 'number', value: '22'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'word',   value: 'i'},
            {type: 'word',   value: 'j'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '50'},
            {type: 'symbol', value: '}'},
            {type: 'symbol', value: '}'},
        ];

        expected = [
            {name: 'point', arguments: ['1', '20', '50'],},
            {name: 'point', arguments: ['1', '21', '50'],},
            {name: 'point', arguments: ['1', '22', '50'],},
            {name: 'point', arguments: ['2', '20', '50'],},
            {name: 'point', arguments: ['2', '21', '50'],},
            {name: 'point', arguments: ['2', '22', '50'],},
            {name: 'point', arguments: ['3', '20', '50'],},
            {name: 'point', arguments: ['3', '21', '50'],},
            {name: 'point', arguments: ['3', '22', '50'],},
        ];
        result = DBN.parse(tokens).body;
        assert.bodyEqual(result, expected);

        // Repeat i 1 3
        // {
        //   Repeat j 20 22
        //   {
        //     Set [i j] 2
        //   }
        tokens = [
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '1'},
            {type: 'number', value: '3'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'j'},
            {type: 'number', value: '20'},
            {type: 'number', value: '22'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'word',   value: 'i'},
            {type: 'word',   value: 'j'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '2'},
            {type: 'symbol', value: '}'},
        ];
        try {
            result = DBN.parse(tokens);
            assert.fail('Should throw on the above.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }
    });
    it('Unclosed braces should error', function() {
        var tokens = [
            {type: 'word',   value: 'Repeat'},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '1'},
            {type: 'number', value: '3'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'word',   value: 'i'},
            {type: 'number', value: '3'},
            {type: 'symbol', value: ']'},
            {type: 'number', value: '100'},
        ]
        try {
            var result = DBN.parse(tokens);
            assert.fail('The above should assert.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.startsWith(error.message, 'Unexpected');
            assert.strictEqual(error.name, 'InputError');
        }
    });

    it('commands', function(){
        // Program:
        // Command centre colour
        // {
        //   Set [50 50] colour
        // }
        // centre 5

        var tokens = [
            {type: 'word',   value: 'Command'},
            {type: 'word',   value: 'centre'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'number', value: '50'},
            {type: 'number', value: '50'},
            {type: 'symbol', value: ']'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '}'},
            {type: 'word',   value: 'centre'},
            {type: 'number', value: '5'},
        ];
        var expected = [
            {name: 'point', arguments: ['50', '50', '5']}
        ];
        var result = DBN.parse(tokens).body;
        assert.bodyEqual(result, expected);
    });

    it('command errors', function() {
        var tokens = [
            {type: 'word',   value: 'Command'},
            {type: 'word',   value: 'centre'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'number', value: '50'},
            {type: 'number', value: '50'},
            {type: 'symbol', value: ']'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '}'},
            {type: 'word',   value: 'centre'},
        ];
        try {
            var result = DBN.parse(tokens);
            assert.fail('The above should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }

        tokens = [
            {type: 'word',   value: 'Command'},
        ];
        try {
            var result = DBN.parse(tokens);
            assert.fail('The above should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }

        tokens = [
            {type: 'word',   value: 'Command'},
            {type: 'number', value: '4'},
        ];
        try {
            var result = DBN.parse(tokens);
            assert.fail('The above should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }

        tokens = [
            {type: 'word',   value: 'Set'},
            {type: 'word',   value: 'centre'},
            {type: 'number', value: '5'},
            {type: 'word',   value: 'Command'},
            {type: 'word',   value: 'centre'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '{'},
            {type: 'word',   value: 'Set'},
            {type: 'symbol', value: '['},
            {type: 'number', value: '50'},
            {type: 'number', value: '50'},
            {type: 'symbol', value: ']'},
            {type: 'word',   value: 'colour'},
            {type: 'symbol', value: '}'},
            {type: 'word',   value: 'centre'},
            {type: 'number', value: '60'},
        ];
        try {
            var result = DBN.parse(tokens);
            assert.fail('The above should throw.');
        } catch (error) {
            assert.instanceOf(error, DBN.Loggable);
            assert.strictEqual(error.name, 'InputError');
        }
    });
    it('Line calculation bug.', function() {
        // Original program.

        // Paper 10
        // Pen 100
        // Set mid 50
        // Set top 70
        // Set eye_height 5
        // Set small_diff 10
        // Set large_diff 25
        // // Left eye
        // Line (mid - small_diff) (top - eye_height) (mid + small_diff) top

        var context = {
            mid: '50',
            top: '70',
            eye_height: '5',
            small_diff: '10'
        };
        var tokens = [
            {type: 'word',   value: 'Line'},
            {type: 'symbol', value: '('},
            {type: 'word',   value: 'mid'},
            {type: 'symbol', value: '-'},
            {type: 'word',   value: 'small_diff'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: '('},
            {type: 'word',   value: 'top'},
            {type: 'symbol', value: '-'},
            {type: 'word',   value: 'eye_height'},
            {type: 'symbol', value: ')'},
            {type: 'symbol', value: '('},
            {type: 'word',   value: 'mid'},
            {type: 'symbol', value: '+'},
            {type: 'word',   value: 'small_diff'},
            {type: 'symbol', value: ')'},
            {type: 'word',   value: 'top'},
        ]
        var expectedBody = [
            {name: 'line', arguments: ['40', '65', '60', '70']},
        ]
        var resultBody = DBN.parse(tokens, context).body;
        assert.bodyEqual(resultBody, expectedBody);
    });
});

//=============================================================================
describe('DBN integration', function() {
    var dummyOutput = {
        transform: function(ast) {return ast;},
        generate: function(ast) {return ast.toString();}
    };
    it('Compile', function() {
        var program = `
Paper 100
Pen 10
Line 0 10 100 10
Pen 33
Line 0 0 100 5
`;
        var expectedAST = {
            type: 'drawing',
            body: [
                {name: 'background', arguments: ['100']},
                {name: 'foreground', arguments: ['10']},
                {name: 'line',       arguments: ['0 10 100 10']},
                {name: 'foreground', arguments: ['33']},
                {name: 'line',       arguments: ['0 0 100 5']},
            ],
        };
        var result = DBN.compile(program, dummyOutput);
        assert.equalIgnoreSpaces(result, expectedAST.toString());
    });

    it('Working programs', function() {
        // This is just to test programs that have previously failed, so that
        // they are now working. But we don't bother to test the output.
        var programs = [
            `
            Command hi
            {
            }
            `,
            `
            Command hi
            {
            }
            `,
            `
            Command foo a b
            {
                Line a b a b
            }
            Set a 5
            foo 3 2
            `,
            `
            Command el a b
            {
            }
            el 1 2
            el 2 3
            `,
            `
            Line 0 0 -10 (15 + -5)
            `
        ];
        for (var i = 0; i < programs.length; ++i) {
            var result = DBN.compile(programs[i], dummyOutput);
            assert.isNotNull(result);
        }

    });
    it('Error programs', function() {
        var programs = [
            // Hello is not a keyword
            `
            Hello
            `,
            // tile becomes a variable, not a function 
            `Command tile a b
            {
                Line a b (a + 5) (b + 5)
            }
            Set tile 5
            tile 4 20
            `,
            // a is already a variable
            `
            Set a 5
            Command foo a b
            {
                Line a b a b
            }
            `,
            // command doesn't end
            `Command a b c d e f g`,
            // command doesn't end
            `Command a b c d e f g {`,
            // repeat doesn't end
            `Repeat 25 50 {`,
            // bar defined in a function, can't affect outside context
            `Command foo
            {
              Set bar 25
            }
            foo
            Line bar bar bar bar`,
            // ? is not a valid variable name
            `Command a b ? c {
               Line 0 0 10 10
             }
             a 10 5`,
            //  5 is not a valid variable name
            `Command a 5 b c {
               Line 0 0 10 10
             }
             a 10 5`,
            // can't redefine a command
            `Command foo a b {
                Line 0 0 1 1
            }
            Command foo a {
                Line a a a a
            }`
        ];
        for (var i = 0; i < programs.length; ++i) {
            try {
                DBN.compile(programs[i], dummyOutput);
                assert.fail('The above should throw.')
            } catch (error) {
                assert.instanceOf(error, DBN.Loggable);
                assert.strictEqual(error.name, 'InputError');
                if (false) {
                    console.log(error.toString());
                }
            }
        }
    });
});

//=============================================================================
describe('SVG Backend', function() {
    it('transforms to an SVG friendly AST.', function() {
        var ast = {
            type: 'drawing',
            body: [
                {name: 'background', arguments: ['0']},
                {name: 'foreground', arguments: ['100']},
                {name: 'line',       arguments: ['0', '0', '100', '100']}
            ],
        };

        var expected = {
            tag: 'svg',
            attributes: {
                width: 100,
                height: 100,
                viewBox: '0 0 100 100',
                xmlns: 'http://www.w3.org/2000/svg',
                version: '1.1'
            },
            body: [
                {
                    tag: 'rect',
                    attributes: {
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                        fill: 'rgb(100%,100%,100%)',
                    }
                },
                {
                    tag: 'line',
                    attributes: {
                        x1: 0,
                        y1: 100,
                        x2: 100,
                        y2: 0,
                        stroke: 'rgb(0%,0%,0%)',
                        'stroke-linecap': 'round'
                    }
                }
            ],
        };
        var result = DBN.SVG.transform(ast);
        // Check top level tag
        assert.strictEqual(
            result.tag,
            expected.tag
        );

        // Check the (relevant) top level svg attributes
        assert.strictEqual(
            result.attributes.width,
            expected.attributes.width
        );
        assert.strictEqual(
            result.attributes.height,
            expected.attributes.height
        );
        assert.strictEqual(
            result.attributes.viewBox,
            expected.attributes.viewBox
        );
        // Check it has xmlns and version attributes, we don't care what the
        // value of these are.
        assert.property(
            expected.attributes,
            'xmlns'
        );
        assert.property(
            expected.attributes,
            'version'
        );

        // Now check the body
        assert.strictEqual(
            result.body.length,
            expected.body.length
        );

        // Check the background
        assert.strictEqual(
            result.body[0].tag,
            expected.body[0].tag
        );
        assert.strictEqual(
            result.body[0].attributes.length,
            expected.body[0].attributes.length
        );
        assert.strictEqual(
            result.body[0].attributes.x,
            expected.body[0].attributes.x
        );
        assert.strictEqual(
            result.body[0].attributes.y,
            expected.body[0].attributes.y
        );
        assert.strictEqual(
            result.body[0].attributes.width,
            expected.body[0].attributes.width
        );
        assert.strictEqual(
            result.body[0].attributes.height,
            expected.body[0].attributes.height
        );
        assert.strictEqual(
            result.body[0].attributes.fill,
            expected.body[0].attributes.fill
        );

        // Check the line
        assert.strictEqual(
            result.body[1].tag,
            expected.body[1].tag
        );
        assert.strictEqual(
            result.body[1].attributes.length,
            expected.body[1].attributes.length
        );
        assert.strictEqual(
            result.body[1].attributes.x1,
            expected.body[1].attributes.x1
        );
        assert.strictEqual(
            result.body[1].attributes.y1,
            expected.body[1].attributes.y1
        );
        assert.strictEqual(
            result.body[1].attributes.x2,
            expected.body[1].attributes.x2
        );
        assert.strictEqual(
            result.body[1].attributes.y2,
            expected.body[1].attributes.y2
        );
        assert.strictEqual(
            result.body[1].attributes.stroke,
            expected.body[1].attributes.stroke
        );
        assert.strictEqual(
            result.body[1].attributes['stroke-linecap'],
            expected.body[1].attributes['stroke-linecap']
        );
    });
    it('Generates an SVG from an SVG friendly AST.', function() {
        var svgAST = {
            tag: 'svg',
            attributes: {
                width: '100',
                height: '100',
                viewBox: '0 0 100 100',
                xmlns: 'http://www.w3.org/2000/svg',
                version: '1.1'
            },
            body: [
                {
                    tag: 'rect',
                    attributes: {
                        x: '0',
                        y: '0',
                        width: '100',
                        height: '100',
                        fill: 'rgb(100%, 100%, 100%)',
                    },
                    body: []
                },
                {
                    tag: 'line',
                    attributes: {
                        x1: '0',
                        y1: '100',
                        x2: '100',
                        y2: '0',
                        stroke: 'rgb(0%, 0%, 0%)',
                        'stroke-linecap': 'round'
                    },
                    body: []
                }
            ],
        };
        var expected = '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1">\
    <rect x="0" y="0" width="100" height="100" fill="rgb(100%, 100%, 100%)"></rect>\
    <line x1="0" y1="100" x2="100" y2="0" stroke="rgb(0%, 0%, 0%)" stroke-linecap="round"></line>\
</svg>\
'
        var result = DBN.SVG.generate(svgAST);
        assert.equalIgnoreSpaces(result, expected);
    });
    it('Integration test, runs a program correctly.', function() {
        var program = `
Paper 10
Pen 50
Line 0 0 100 100
Pen 100
Line 0 100 100 0
Set [50 20] 25
`;
        var expected = '\
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1">\
    <rect x="0" y="0" width="100" height="100" fill="rgb(90%, 90%, 90%)"></rect>\
    <line x1="0" y1="100" x2="100" y2="0" stroke="rgb(50%, 50%, 50%)" stroke-linecap="round"></line>\
    <line x1="0" y1="0" x2="100" y2="100" stroke="rgb(0%, 0%, 0%)" stroke-linecap="round"></line>\
    <rect x="50" y="80" width="1" height="1" fill="rgb(75%, 75%, 75%)"></rect>\
</svg>\
';
        var result = DBN.SVG.compile(program);
        assert.equalIgnoreSpaces(result, expected);
        // Make sure that there are no spaces like '< svg'
        assert.startsWith(result, '<svg ');

        // Check the options
        DBN.SVG.options.width = 20;
        var newResult = DBN.SVG.compile(program);
        assert.notStrictEqual(result, newResult);
        assert.startsWith(newResult, '<svg width="20');
    });
});

//=============================================================================
describe('Raster Backend', function() {
    it('transforms to a raster friendly AST', function() {
        var AST = {
            type: 'drawing',
            body: [
                {name: 'background', arguments: ['0']},
                {name: 'foreground', arguments: ['100']},
                {name: 'line',       arguments: ['0', '0', '100', '100']},
                {name: 'point',      arguments: ['25', '10', '50']},
                {name: 'point',      arguments: ['15', '15', '33']},
            ],
        };
        var bitmapAST = DBN.Raster.transform(AST);
        assert.strictEqual(bitmapAST.background, '0');
        assert.property(bitmapAST, 'pixels');
        assert.strictEqual(bitmapAST.pixels[0].length, 101);
        
        // Check the points on the line
        for (var i = 0; i < 15; ++i) {
            assert.strictEqual(bitmapAST.pixels[100 - i][i], '100');
        }
        // [15, 15] is on the line, but overwritten by a point
        for (var i = 16; i < 101; ++i) {
            assert.strictEqual(bitmapAST.pixels[100- i][i], '100');
        }
        
        // Check point 1
        assert.strictEqual(bitmapAST.pixels[90][25], '50');

        // Check point 2 overrode the line colour
        assert.strictEqual(bitmapAST.pixels[85][15], '33');

        // Check some background points
        assert.strictEqual(bitmapAST.pixels[84][15], 'b');
        
    });
    it('generate using the test generator.', function() {
        var AST = {
            type: 'drawing',
            body: [
                {name: 'background', arguments: ['0']},
                {name: 'foreground', arguments: ['100']},
                {name: 'line',       arguments: ['0', '0', '100', '100']},
                {name: 'point',      arguments: ['25', '10', '50']},
                {name: 'point',      arguments: ['15', '15', '33']},
            ],
        };
        var bitmapAST = DBN.Raster.transform(AST);
        var output = DBN.Raster.Test.generate(bitmapAST);
        var data = fs.readFileSync(
            'data/testGenerator.test',
            'utf8'
        );  
        assert.strictEqual(output, data);
    });
    it('generate using the binary test generator.', function() {
        var AST = {
            type: 'drawing',
            area: [10, 10],
            body: [
                {name: 'background', arguments: ['0']},
                {name: 'foreground', arguments: ['100']},
                {name: 'line',       arguments: ['0', '0', '100', '100']},
                {name: 'point',      arguments: ['25', '10', '50']},
                {name: 'point',      arguments: ['15', '15', '33']},
            ],
        };
        var bitmapAST = DBN.Raster.transform(AST);
        var output = DBN.Raster.Binary.generate(bitmapAST);
        var data = fs.readFileSync(
            'data/binaryTestGenerator.binary',
            'utf8'
        );  
        assert.strictEqual(output, data);
    });
});
