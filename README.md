# Delta: a DFA description language

CIT4004 Analysis of Programming Languages, UTech, Semester 1 2026/2027.

Delta lets you write a deterministic finite automaton as the 5-tuple D = (Q, Σ, δ, q0, F),
checks it (lexical, syntax and semantic analysis) and draws the state diagram.

## Run it

Unzip the folder and double-click `index.html`. Nothing to install. Keep the folder structure as it is.

## Files

| File | What it is | Owner |
|---|---|---|
| `docs/grammar.ebnf` | The grammar (EBNF) and the semantic rules | Member 1 |
| `js/core.js` | Stage 1 lexer, Stage 2 parser, Stage 3 semantic analysis, target code | Members 1 to 3 |
| `js/ide.js` | Stage 4 diagram, simulator and the IDE | Member 4 |
| `index.html`, `styles.css` | Page and look | Member 4 |
| `examples/*.delta` | Sample programs. Use **Open file** in the IDE to load one | All |
| `tests/test.js` | Command-line tests (`node tests/test.js`) | All |

## Group members

| Name | ID | Part |
|---|---|---|
| Keyshawn Williams | 2106838 | Grammar and lexical analysis |
| Javindah Hibbert | 1905497 | Syntax analysis |
| Shanaldo Carty | 2108949 | Semantic analysis |
| Richardo White | 2103123 | Rendering and IDE |
