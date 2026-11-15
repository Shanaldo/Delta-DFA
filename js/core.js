/* ==========================================================================
   Group members:
     Keyshawn Williams  2106838  Stage 1 lexer + grammar
     Javindah Hibbert   1905497  Stage 2 parser
     Shanaldo Carty     2108949  Stage 3 semantic analysis + target code
     Richardo White     2103123  Stage 4 rendering + IDE (js/ide.js)
   ========================================================================== */

// Keeps error messages in the same format.
const problem = (stage, message, tok) =>
  ({ stage, message, line: tok.line, col: tok.col, start: tok.start, end: Math.max(tok.end, tok.start + 1) });

/* ===== STAGE 1: LEXICAL ANALYSIS (grammar section 1) =====
   Turns text into tokens: NAME DELTA SIGMA EPSILON ARROW CROSS NEWLINE and punctuation. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const WORDS = { delta: 'δ', Sigma: 'Σ', SIGMA: 'Σ', epsilon: 'ε' };  // keyboard spellings (syntactic sugar)
const RESERVED = ['δ', 'Σ', 'ε'];
const isLetter = c => c.toLowerCase() !== c.toUpperCase();  // true for a-z, A-Z and Greek letters
const isNameChar = c => isLetter(c) || '0123456789_\''.includes(c) || SUB.includes(c);

// Breaks the code into tokens and flags unknown characters.
function lex(src) {
  const tokens = [], diags = [];
  let i = 0, line = 1, lineStart = 0;
  const add = (t, v, start) => tokens.push({ t, v, line, col: start - lineStart + 1, start, end: i });

  while (i < src.length) {
    const c = src[i], start = i;
    if (c === '\n') { i++; add('NEWLINE', 'end of line', start); line++; lineStart = i; }
    else if (c === ' ' || c === '\t' || c === '\r') i++;
    else if (c === '#') { while (i < src.length && src[i] !== '\n') i++; }  // comment: skip to end of line
    else if (c === '-' && src[i + 1] === '>') {                                       // "->" is the same token as "→"
      i += 2; add('→', '→', start);
    }
    else if (isNameChar(c)) {  // a name, or a reserved word
      while (i < src.length && isNameChar(src[i])) i++;
      const plain = [...src.slice(start, i)].map(ch => (SUB.includes(ch) ? SUB.indexOf(ch) : ch)).join('');
      const word = WORDS[plain] || plain;                                              // q₀ is read as q0
      add(RESERVED.includes(word) ? word : 'NAME', word, start);
    } else {
      i++;
      if (c === '*') add('×', '×', start);
      else if ('=(){},×→'.includes(c)) add(c, c, start);
      else {
        const where = { line, col: start - lineStart + 1, start, end: i };
        diags.push(problem('lexical', `Unexpected character '${c}'. It is not part of Delta.`, where));
      }
    }
  }
  const end = { line, col: src.length - lineStart + 1, start: src.length, end: src.length };
  tokens.push({ t: 'EOF', v: 'end of input', ...end });
  return { tokens, diags };
}

/* ===== STAGE 2: SYNTAX ANALYSIS (grammar section 2) =====
   Recursive descent: one function per grammar rule. Reads tokens, builds the syntax tree. */
// Checks the code structure and builds a syntax tree.
function parse(tokens) {
  let p = 0, inTable = false;  // line breaks matter only inside a transition table
  const T = () => { if (!inTable) while (tokens[p].t === 'NEWLINE') p++; return tokens[p]; };
  const next2 = () => { let q = p + 1; while (tokens[q].t === 'NEWLINE') q++; return tokens[q]; };
  const fail = (tok, message) => { throw { tok, message }; };
  const eat = (t, what = t) => T().t === t ? tokens[p++] : fail(T(), `Expected ${what} but found '${T().v}'`);
  const accept = t => T().t === t && ++p;

  const symbol = () => ['NAME', 'ε'].includes(T().t)
    ? tokens[p++] : fail(T(), `Expected a state or symbol name but found '${T().v}'`);
  const ref = () => ['NAME', 'Σ'].includes(T().t)
    ? { kind: 'ref', tok: tokens[p++] } : fail(T(), `Expected a name but found '${T().v}'`);
  // Reads the items inside a set.
  function set() {  // set = "{" [ symbol { "," symbol } ] "}"
    const tok = eat('{', "'{'"), items = [];
    if (T().t !== '}') { items.push(symbol()); while (accept(',')) items.push(symbol()); }
    eat('}', `',' or '}' to close '{' opened on line ${tok.line},`);
    return { kind: 'set', tok, items };
  }
  const value = () => T().t === '{' ? set() : ref();  // value = NAME | SIGMA | set

  // Reads the five parts of the DFA.
  function tuple() {  // tuple = "(" value "," value "," DELTA "," NAME "," value ")"
    const open = eat('(', "'('"); const q = value(); eat(',', "','"); const s = value(); eat(',', "','");
    eat('δ', "'δ'"); eat(',', "','"); const start = eat('NAME', 'the start state'); eat(',', "','");
    const f = value(); eat(')', `')' to close '(' opened on line ${open.line},`);
    return { q, s, start, f };
  }

  // Reads each statement based on its type.
  function statement() {  // statement = definition | signature | transition | table
    const k = T();
    if ((k.t === 'NAME' || k.t === 'Σ') && next2().t === '=') {  // definition: Q = {...}   q0 = q1
      p++; eat('=', "'='");
      return { kind: 'definition', id: k, value: T().t === '{' ? set() : ref() };
    }
    if (k.t !== 'δ') fail(k, `Unexpected '${k.v}'. Expected a definition, a transition or a transition table`);
    const after = next2().t; p++;
    if (after === '=') {  // signature: δ = Q × Σ → Q
      p++; const q = ref();
      if (T().t === 'NAME' && T().v === 'x') p++; else eat('×', "'×'");
      const s = ref(); eat('→', "'→'");
      return { kind: 'signature', q, s, r: ref() };
    }
    if (after === '(') {  // transition: δ(q1,a)=q2
      p++;
      const q = eat('NAME', 'a state'); eat(',', "','");
      const a = symbol(); eat(')', "')'"); eat('=', "'='");
      return { kind: 'transition', q, a, r: eat('NAME', 'a state') };
    }
    inTable = true;  // table: header line, then one row per state
    const head = [];
    while (['NAME', 'ε'].includes(T().t)) head.push(tokens[p++]);
    if (!head.length) fail(T(), "Expected '(', '=' or table columns after δ");
    eat('NEWLINE', 'a new line after the table header');
    const rows = [];
    for (;;) {
      while (T().t === 'NEWLINE') p++;  // blank lines between rows are fine
      // a row has a state and at least one target
      if (!(T().t === 'NAME' && tokens[p + 1].t === 'NAME')) break;
      const state = tokens[p++], cells = [];
      while (T().t === 'NAME') cells.push(tokens[p++]);
      rows.push({ state, cells });
    }
    inTable = false;
    return { kind: 'table', head, rows };
  }

  let ast = null; const errors = [];
  try {  // program = NAME "=" tuple { statement }
    const id = eat('NAME', 'the DFA name'); eat('=', "'=' after the DFA name");
    ast = { id, tuple: tuple(), statements: [] };
    while (T().t !== 'EOF') {
      const from = p;
      try { ast.statements.push(statement()); }
      catch (e) {  // panic-mode recovery: skip to the next δ or the next line
        if (!e.tok) throw e;
        errors.push(e); inTable = false; p = Math.max(p, from + 1);
        while (T().t !== 'EOF' && T().t !== 'δ' && T().line <= e.tok.line) p++;
      }
    }
  } catch (e) { if (!e.tok) throw e; errors.push(e); }  // an error in the header stops the parse
  const diags = errors.map(e => problem('syntax', e.message, e.tok));
  return { ast: errors.length ? null : ast, diags };
}

/* ===== STAGE 3: SEMANTIC ANALYSIS (grammar section 3, rules S1-S9) =====
   One global scope. A name is bound by "NAME = ..." and every later use is looked up in this table. */
// Checks DFA rules and prepares the valid result.
function analyse(ast) {
  const diags = [];
  const bad = (k, message) => diags.push(problem('semantic', message, k));

  // Pass 1: bind every defined name (S2: only once)
  const env = {};
  ast.statements.forEach((s, order) => {
    if (s.kind !== 'definition') return;
    if (env[s.id.v]) bad(s.id, `'${s.id.v}' is already defined on line ${env[s.id.v].id.line}`);
    else env[s.id.v] = { id: s.id, value: s.value, order };
  });

  // Pass 2: resolve Q, Σ, F from the tuple (inline set, or a name looked up in env). S1: defined before use.
  // Finds a set and checks that it was defined first.
  const getSet = (x, what, before) => {
    if (x.kind === 'set') return x.items;
    const d = env[x.tok.v];
    if (!d || d.value.kind !== 'set') {
      bad(x.tok, `${what} '${x.tok.v}' is never defined as a set`);
      return null;
    }
    if (before !== undefined && d.order > before) {
      bad(x.tok, `'${x.tok.v}' is used before it is defined (line ${d.id.line})`);
    }
    return d.value.items;
  };
  // Checks for repeated or invalid set values.
  const names = (items, what, single) => {  // S3 and no duplicates, no ε, single-character symbols
    const seen = new Set(), out = [];
    for (const k of items) {
      if (k.t === 'ε') bad(k, `ε is not allowed in ${what}`);
      else if (seen.has(k.v)) bad(k, `'${k.v}' is listed twice in ${what}`);
      else {
        if (single && [...k.v].length !== 1) bad(k, `Symbol '${k.v}' must be a single character`);
        seen.add(k.v); out.push(k.v);
      }
    }
    return out;
  };
  const t = ast.tuple;
  const qi = getSet(t.q, 'The state set', ast.statements.length);
  const si = getSet(t.s, 'The alphabet');
  const fi = getSet(t.f, 'The final set');
  const Q = qi && names(qi, 'Q'), S = si && names(si, 'Σ', true), F = fi && names(fi, 'F');
  if (Q && !Q.length) bad(t.q.tok, 'Q must contain at least one state');
  if (S && !S.length) bad(t.s.tok, 'Σ must contain at least one symbol');

  // Pass 3 (S4): q0 may be a variable bound to a state, or the state itself
  let start = t.start.v;
  const sd = env[start];
  if (sd) {
    if (sd.value.kind === 'ref') start = sd.value.tok.v;
    else bad(t.start, `'${start}' must name one state, not a set`);
  }
  if (Q && !Q.includes(start)) bad(t.start, `Start state '${start}' is not in Q`);
  if (F && Q) fi.forEach(k => { if (!Q.includes(k.v)) bad(k, `Final state '${k.v}' is not in Q`); });

  // Pass 4 (S1, S5, S6, S7, S9): every transition, whether from δ(q,a)=r or from a table cell
  const delta = {};
  // Checks that each transition is valid and unique.
  const addTransition = (q, a, r) => {
    if (a.t === 'ε') return bad(a, 'ε cannot appear on a transition in a DFA');
    if (Q && !Q.includes(q.v)) bad(q, `'${q.v}' is not a state in Q`);
    if (S && !S.includes(a.v)) bad(a, `'${a.v}' is not in the alphabet Σ`);
    if (Q && !Q.includes(r.v)) bad(r, `'${r.v}' is not a state in Q`);
    delta[q.v] = delta[q.v] || {};
    if (a.v in delta[q.v]) {
      bad(a, `δ(${q.v},${a.v}) is already defined: a DFA allows only one transition per state and symbol`);
    } else delta[q.v][a.v] = r.v;
  };
  // Checks that states and symbols were defined first.
  const early = (tok, order) => {  // S1 for transitions: Q and Σ must be defined before a transition uses them
    for (const x of [t.q, t.s]) {
      const d = x.kind === 'ref' && env[x.tok.v];
      if (d && d.order > order) {
        return bad(tok, `'${x.tok.v}' is used here before it is defined (line ${d.id.line})`);
      }
    }
  };
  ast.statements.forEach((s, order) => {
    if (s.kind === 'signature') {
      getSet(s.q, 'The state set', order); getSet(s.s, 'The alphabet', order);
      if (s.r.tok.v !== s.q.tok.v) bad(s.r.tok, 'δ must map back into the state set');
    }
    if (s.kind === 'transition') { early(s.q, order); addTransition(s.q, s.a, s.r); }
    if (s.kind === 'table') early(s.head[0], order);
    if (s.kind === 'table') s.rows.forEach(r => {  // a table is sugar: each cell goes through addTransition
      const n = s.head.length;
      if (r.cells.length !== n) {
        bad(r.state, `Row '${r.state.v}' has ${r.cells.length} targets but the table has ${n} columns`);
      } else r.cells.forEach((c, j) => addTransition(r.state, s.head[j], c));
    });
  });

  // Pass 5 (S8): every state needs a transition for every symbol
  if (Q && S) Q.forEach(q => {
    const missing = S.filter(a => !(delta[q] && a in delta[q]));
    if (missing.length) {
      bad(qi.find(k => k.v === q), `State '${q}' is missing transitions on: ${missing.join(', ')}`);
    }
  });

  // Symbol table, shown in the IDE to explain binding and scope
  const symbols = [{ name: ast.id.v, kind: 'dfa', value: 'the whole automaton', line: ast.id.line }];
  for (const [name, d] of Object.entries(env)) {
    const shown = d.value.kind === 'set' ? '{' + d.value.items.map(k => k.v).join(', ') + '}' : d.value.tok.v;
    symbols.push({ name, kind: 'definition', value: shown, line: d.id.line });
  }
  (qi || []).forEach(k => symbols.push({ name: k.v, kind: 'state', value: 'member of Q', line: k.line }));
  (si || []).forEach(k => symbols.push({ name: k.v, kind: 'symbol', value: 'member of Σ', line: k.line }));

  const dfa = { name: ast.id.v, states: Q, alphabet: S, start, finals: F, delta };
  return { diags, symbols, dfa: diags.length ? null : dfa };
}

/* ===== TARGET CODE: the checked DFA becomes a small JavaScript program that is then executed ===== */
// Turns the checked DFA into code that can run.
function generateTarget(dfa) {
  return `const delta = ${JSON.stringify(dfa.delta, null, 1)};
const start = ${JSON.stringify(dfa.start)};
const finals = new Set(${JSON.stringify(dfa.finals)});
function run(word) {
  let state = start; const path = [state];
  for (const c of word) {
    if (!(c in delta[state])) return { accepted: false, path, badSymbol: c };
    state = delta[state][c]; path.push(state);
  }
  return { accepted: finals.has(state), path };
}`;
}

/* ===== The whole pipeline: each stage only runs if the one before it found no errors ===== */
// Runs each stage and stops if an error is found.
function compile(src) {
  const L = lex(src), P = parse(L.tokens);
  const stage = list => (list.length ? 'error' : 'ok');
  const out = {
    tokens: L.tokens, ast: P.ast, symbols: [], dfa: null, target: null, diags: [...L.diags, ...P.diags],
    stages: { lexical: stage(L.diags), syntax: stage(P.diags), semantic: 'skipped' },
  };
  if (P.ast && !L.diags.length) {
    const A = analyse(P.ast);
    out.symbols = A.symbols; out.dfa = A.dfa; out.diags.push(...A.diags);
    out.stages.semantic = stage(A.diags);
  }
  if (out.dfa) {
    const code = generateTarget(out.dfa);
    const run = new Function(code + '\nreturn run;')();                  // the semantic results drive executable code
    out.target = { code, run };
  }
  out.diags.sort((a, b) => a.start - b.start);
  return out;
}

if (typeof module !== 'undefined') module.exports = { lex, parse, analyse, generateTarget, compile };
