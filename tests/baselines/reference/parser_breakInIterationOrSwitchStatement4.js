//// [tests/cases/conformance/parser/ecmascript5/Statements/BreakStatements/parser_breakInIterationOrSwitchStatement4.ts] ////

//// [parser_breakInIterationOrSwitchStatement4.ts]
for (var i in something) {
  break;
}

//// [parser_breakInIterationOrSwitchStatement4.js]
for (var i in something) {
    break;
}
