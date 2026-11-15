/* ==========================================================================
 * Tests for the Delta compiler.
 * Run using: node tests/test.js
 
 * Checks that the lexer, parser, semantic analyzer,
 * and target code work correctly.
 
 * Tests valid programs, different input formats,
 * semantic rules, syntax errors, and unusual inputs.
 
 * Also checks error locations, duplicate definitions,
 * and the symbol table.
 
 * The diagram and interface are tested separately
 * by using the IDE.
   ========================================================================== */
   
// Run with: node tests/test.js
const { compile } = require('../js/core.js');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };
const errs = (r, stage) => r.diags.filter(d => d.stage === stage);

const LONG = `M = (Q, Σ, δ, q0, F)\nQ = {q1, q2, q3, q4, Trap}\nΣ = {a, b, c}\nδ = Q × Σ → Q\nq0 = q1\nF = {q4}\n\nδ     a     b     c\nq1    q2    q3    Trap\nq2    q4    Trap  q2\nq3    Trap  q4    q3\nq4    Trap  Trap  Trap\nTrap  Trap  Trap  Trap\n`;
const SHORT = `M = ({q1, q2, q3, q4, Trap}, {a, b, c}, δ, q1, {q4})\nδ(q1,a)=q2 δ(q1,b)=q3 δ(q1,c)=Trap δ(q2,a)=q4 δ(q2,b)=Trap δ(q2,c)=q2 δ(q3,a)=Trap\nδ(q3,b)=q4 δ(q3,c)=q3\nδ(q4,a)=Trap δ(q4,b)=Trap δ(q4,c)=Trap δ(Trap,a)=Trap δ(Trap,b)=Trap δ(Trap,c)=Trap`;

// 1. The two formats from the brief compile and give identical target code (table is syntactic sugar)
const a = compile(LONG), b = compile(SHORT);
check('long form compiles', a.dfa && !a.diags.length, JSON.stringify(a.diags));
check('short form compiles', b.dfa && !b.diags.length, JSON.stringify(b.diags));
check('table and list give identical target code', a.target.code === b.target.code);
check('brief DFA accepts "ab"? no, "aa"? yes', a.target.run('ab').accepted === false && a.target.run('aa').accepted === true);
check('run reports the path', a.target.run('bcb').path.join('>') === 'q1>q3>q3>q4' && a.target.run('bcb').accepted);

// 2. Keyboard spellings are sugar for the Greek symbols
const E = compile(`Even = (Q, Sigma, delta, q0, F)\nQ = {q0, q1}\nSigma = {0, 1}\ndelta = Q x Sigma -> Q\nq0 = q0\nF = {q0}\ndelta(q0,0)=q0 delta(q0,1)=q1\ndelta(q1,0)=q1 delta(q1,1)=q0`);
check('ASCII spellings compile', E.dfa && E.target.run('11').accepted && !E.target.run('1').accepted, JSON.stringify(E.diags));

// 3. The brief writes δ with no spaces: δ=Q×Σ→Q
const N = compile(LONG.replace('δ = Q × Σ → Q', 'δ=Q×Σ→Q'));
check('no-space δ=Q×Σ→Q compiles', N.dfa && !N.diags.length, JSON.stringify(N.diags));

// 4. Semantic errors from the brief
const bad = compile(`M = (Q, Σ, δ, q0, F)\nδ = Q × Σ → Q\nQ = {q1, q2}\nΣ = {a, b}\nq0 = q1\nF = {q3}\nδ(q1,a)=q2 δ(q1,a)=q1 δ(q1,ε)=q1\nδ(q2,a)=q2`);
const msgs = errs(bad, 'semantic').map(d => d.message).join(' | ');
check('semantic stage fails, no DFA', bad.stages.semantic === 'error' && !bad.dfa);
check('use before definition (S1)', /'Q' is used before it is defined/.test(msgs) && /'Σ' is used before/.test(msgs), msgs);
check('F not subset of Q (S4)', /Final state 'q3'/.test(msgs), msgs);
check('two transitions on same state and symbol (S7)', /already defined/.test(msgs), msgs);
check('epsilon on a transition (S6)', /ε cannot appear/.test(msgs), msgs);
check('missing transitions (S8)', /State 'q1' is missing transitions on: b/.test(msgs) && /State 'q2' is missing/.test(msgs), msgs);
check('bad table row length (S9)', /has 1 targets but the table has 2/.test(errs(compile(`M = ({s,t},{a,b},δ,s,{t})\nδ a b\ns t\nt s s`), 'semantic').map(d => d.message).join()));
check('undefined set is reported', errs(compile(`M = (Q, Σ, δ, q0, F)\nδ(q1,a)=q1`), 'semantic').length >= 3);

// 5. Syntax and lexical errors, with line and column
const s1 = compile(`M = ({q1, q2}, {a, b, δ, q1, {q2})\nδ(q1,a=q2`);
check('syntax errors stop semantic analysis', s1.stages.syntax === 'error' && s1.stages.semantic === 'skipped' && s1.ast === null);
check('syntax errors recover and keep going', s1.diags.length >= 1);
const s2 = compile(`M = (Q, Σ, δ, q0, F)\nQ = {q1 q2}\nΣ = {a, b} %\nδ(q1,a)=q2`);
check('lexical error has line and column', errs(s2, 'lexical')[0] && errs(s2, 'lexical')[0].line === 3 && errs(s2, 'lexical')[0].col === 12, JSON.stringify(s2.diags));
check('missing comma in set is reported on line 2', errs(s2, 'syntax')[0].line === 2);
const s3 = compile(`M = (Q, Σ, δ, q0, F)\nQ = {q1}\nδ(q1,a)=q1\nhello`);
check('unknown statement is a syntax error', errs(s3, 'syntax').some(d => /Unexpected 'hello'/.test(d.message)));

// 6. Edge cases must not crash
for (const src of ['', ' ', '\n\n', '=', 'M', 'M =', 'M = (', '{{{{{{{', 'δ δ δ', 'M = (Q,Σ,δ,q0,F)\nδ\n'])
  check('no crash on ' + JSON.stringify(src), (() => { try { compile(src); return true; } catch (e) { console.log(e); return false; } })());

// 7. Scope: one global scope, a name can only be bound once
const dup = compile(LONG + 'Q = {x}\n');
check('redefinition is an error', errs(dup, 'semantic').some(d => /'Q' is already defined on line 2/.test(d.message)));
check('symbol table lists definitions, states and symbols', a.symbols.some(s => s.kind === 'definition' && s.name === 'Q') && a.symbols.some(s => s.kind === 'state' && s.name === 'Trap') && a.symbols.some(s => s.kind === 'symbol' && s.name === 'c'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
