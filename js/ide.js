/* ==========================================================================
   DELTA IDE: Stage 4, the screen you use: editor, diagram and word tester (Richardo White, 2103123)
   Needs js/core.js loaded first. It only asks the compiler one thing, compile(text), which returns:
     { tokens, ast, symbols, dfa, target, diags, stages }
   ========================================================================== */
if (typeof compile !== 'function') {  // if core.js is missing or in the wrong folder, say so on the page
  const msg = 'Delta could not load <b>js/core.js</b>. Keep the folder structure exactly as delivered: ' +
    'index.html and styles.css next to the <b>js</b> folder, with core.js and ide.js inside it.';
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;color:#B3261E">${msg}</p>`);
  throw new Error('js/core.js not loaded');
}
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let result = null, goodDFA = null, tab = 'Problems', sim = null, timer = null, typing = null;

/* ---------- Drawing the diagram ---------- */
const R = 26;
const rotate = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const toward = (from, to, m) => {  // a point a set distance away from one spot, in the direction of another
  const d = [to[0] - from[0], to[1] - from[1]], l = Math.hypot(...d) || 1;
  return [from[0] + d[0] / l * m, from[1] + d[1] / l * m];
};

function drawDiagram(dfa) {
  const n = dfa.states.length, centre = [400, 240], radius = n === 1 ? 0 : Math.min(190, 45 + n * 24), pos = {};
  dfa.states.forEach((q, i) => {  // place the states evenly around a circle, start state on the left
    const a = Math.PI + 2 * Math.PI * i / n;
    pos[q] = [centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a)];
  });
  // the direction pointing away from the middle of the circle
  const away = q => n === 1 ? [-1, 0] : toward(centre, pos[q], 1).map((x, k) => x - centre[k]);
  const out = (q, d, m) => [pos[q][0] + d[0] * m, pos[q][1] + d[1] * m];

  const groups = {};  // join transitions between the same two states into one arrow with all their symbols
  for (const q of dfa.states) for (const a of dfa.alphabet) (groups[q + '\0' + dfa.delta[q][a]] ||= []).push(a);

  const arrow = '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"' +
    ' orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--mute)"/></marker>';
  let svg = `<defs>${arrow}</defs>`;
  for (const [key, symbols] of Object.entries(groups)) {
    const [from, to] = key.split('\0');
    let path, label;
    if (from === to) {  // a state that goes back to itself: draw a small loop pointing outwards
      const dir = rotate(away(from), .6), A = rotate(dir, -.5), B = rotate(dir, .5);
      const pt = (v, m) => out(from, v, m).join(' ');
      path = `M${pt(A, R)} C${pt(A, R + 52)} ${pt(B, R + 52)} ${pt(B, R + 2)}`; label = out(from, dir, R + 50);
    } else {  // an arrow between two states: curved, and more so if there is also one coming back
      const [x1, y1] = pos[from], [x2, y2] = pos[to], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const bend = groups[to + '\0' + from] ? 38 : 14;
      const c = [(x1 + x2) / 2 - dy / len * bend, (y1 + y2) / 2 + dx / len * bend];
      const s = toward(pos[from], c, R), e = toward(pos[to], c, R + 2);
      path = `M${s} Q${c} ${e}`;
      label = [.25 * s[0] + .5 * c[0] + .25 * e[0], .25 * s[1] + .5 * c[1] + .25 * e[1]];  // label goes in the middle
    }
    const text = `<text x="${label[0]}" y="${label[1]}">${esc(symbols.join(','))}</text>`;
    svg += `<g class="ed"><path d="${path}" marker-end="url(#arrow)"/>${text}</g>`;
  }
  const a0 = rotate(away(dfa.start), -.9);  // the little arrow that points at the start state
  const from = out(dfa.start, a0, R + 44), to = out(dfa.start, a0, R + 2);
  svg += `<path d="M${from} L${to}" stroke="var(--mute)" stroke-width="1.6" fill="none"` +
    ' marker-end="url(#arrow)"/>';
  for (const q of dfa.states) {
    const [x, y] = pos[q];
    svg += `<g class="st" data-state="${esc(q)}"><circle cx="${x}" cy="${y}" r="${R}"/>` +
      (dfa.finals.includes(q) ? `<circle class="inner" cx="${x}" cy="${y}" r="${R - 4.5}"/>` : '') +
      `<text x="${x}" y="${y}">${esc(q)}</text></g>`;
  }
  $('diagram').innerHTML = svg;
}
const mark = state => document.querySelectorAll('.st')
  .forEach(g => g.classList.toggle('cur', g.dataset.state === state));

/* ---------- Word tester: runs a typed word through the DFA ---------- */
function resetSim() {
  clearInterval(timer); sim = null; $('trace').textContent = '';
  mark(goodDFA && result.dfa ? result.dfa.start : null);
}
function stepSim() {
  if (!result.dfa) { $('trace').innerHTML = '<span class="no">Fix the errors first.</span>'; return false; }
  const word = [...$('word').value];
  if (!sim) sim = { word, run: result.target.run(word.join('')), i: 0 };
  else if (sim.i < sim.run.path.length - 1) sim.i++;
  const { run, i } = sim, done = i === run.path.length - 1;
  let text = run.path.slice(0, i + 1).map((s, k) => (k ? `read ${word[k - 1]}, ` : '') + s).join(', ');
  mark(run.path[i]);
  const say = (cls, msg) => ` <span class="${cls}">${msg}</span>`;
  let verdict = '';
  if (done && run.badSymbol) verdict = say('no', `Rejected: '${esc(run.badSymbol)}' is not in the alphabet`);
  else if (done) verdict = run.accepted ? say('yes', 'Accepted') : say('no', 'Rejected');
  $('trace').innerHTML = esc(text) + verdict;
  return !done;
}
function runSim() {
  resetSim();
  if (!stepSim()) return;
  timer = setInterval(() => { if (!stepSim()) clearInterval(timer); }, 450);
}

/* ---------- Line numbers and the output tabs ---------- */
function paintGutter() {
  const lines = $('src').value.split('\n').length, bad = new Set(result.diags.map(d => d.line));
  const rows = Array.from({ length: lines }, (_, i) => `<div${bad.has(i + 1) ? ' class="err"' : ''}>${i + 1}</div>`);
  $('gutter').innerHTML = rows.join('');
  $('gutter').scrollTop = $('src').scrollTop;
}
// builds a simple table for the page from a list of column titles and a list of rows
const table = (head, rows) => {
  const line = (tag, list) => `<tr>${list.map(c => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
  return '<table>' + line('th', head) + rows.map(r => line('td', r)).join('') + '</table>';
};
const showTree = ast => JSON.stringify(ast, (k, v) => (v && v.start !== undefined && v.v !== undefined ? v.v : v), 1);

// what to show in each tab at the bottom, using what the compiler found
const TAB_HTML = {
  'Problems': r => {
    if (r.diags.length) return r.diags.map((d, i) => `<a class="problem" data-i="${i}"><b>${d.stage} error</b>` +
      `<small>Ln ${d.line}, Col ${d.col}</small>${esc(d.message)}</a>`).join('');
    return r.dfa ? '<span class="yes">No problems. The diagram is drawn.</span>' : 'Nothing to check yet.';
  },
  'Tokens': r => table(['Line:Col', 'Type', 'Text'],
    r.tokens.filter(t => t.t !== 'NEWLINE').map(t => [`${t.line}:${t.col}`, t.t === t.v ? 'symbol' : t.t, t.v])),
  'Syntax tree': r => '<pre>' +
    (r.ast ? esc(showTree(r.ast)) : 'No syntax tree yet. Fix the syntax errors first.') + '</pre>',
  'Symbol table': r => !r.symbols.length ? 'Available once the program parses.'
    : table(['Name', 'Kind', 'Bound to', 'Line'], r.symbols.map(x => [x.name, x.kind, x.value, x.line])) +
      '<p>One global scope. A name is bound where it is defined and every later use is looked up here.</p>',
  'Target code': r => '<pre>' +
    (r.target ? esc(r.target.code) : 'Generated only when the program has no errors.') + '</pre>',
};

function paintTab() {
  const count = result.diags.length;
  $('tabs').innerHTML = Object.keys(TAB_HTML).map(t => `<button role="tab" class="${t === tab ? 'on' : ''}">${t}` +
    (t === 'Problems' ? `<span class="count ${count ? 'bad' : ''}">${count}</span>` : '') + '</button>').join('');
  $('tabbody').innerHTML = TAB_HTML[tab](result);
}

/* ---------- Running the compiler and updating the whole page ---------- */
function update() {
  result = compile($('src').value);
  const blank = !$('src').value.trim();
  if (blank) {
    result.diags = [];
    result.stages = { lexical: 'skipped', syntax: 'skipped', semantic: 'skipped' };
  }
  document.querySelectorAll('#stages span').forEach(s => {
    s.dataset.s = result.stages[s.dataset.stage] || (result.dfa ? 'ok' : 'skipped');
  });
  const n = result.diags.length;
  $('summary').textContent = n ? `${n} error${n > 1 ? 's' : ''}` : blank ? '' : 'Compiled with no problems';
  if (result.dfa) { drawDiagram(result.dfa); goodDFA = result.dfa; }
  $('dfaname').textContent = goodDFA ? goodDFA.name : '';
  $('diagram').classList.toggle('stale', !result.dfa && !!goodDFA);
  if (!result.dfa && !goodDFA) $('diagram').innerHTML = '';
  $('overlay').hidden = !!result.dfa;
  $('overlay').classList.toggle('bad', n > 0);
  const plural = n > 1 ? 's' : '';
  $('overlay').innerHTML = goodDFA
    ? `<strong>Diagram paused</strong><br>Fix the ${n} error${plural} in Problems to redraw it.`
    : '<strong>Nothing to draw yet</strong><br>' +
      (n ? `Fix the ${n} error${plural} in Problems.` : 'Write a DFA to begin.');
  resetSim(); paintGutter(); paintTab();
}

$('compile').onclick = update;
// remember what was typed, so it is still there the next time the page opens
const save = () => { try { localStorage.setItem('delta-src', $('src').value); } catch (_) {} };
$('src').oninput = () => { clearTimeout(typing); typing = setTimeout(() => { update(); save(); }, 250); };
$('open').onclick = () => $('file').click();
$('save').onclick = () => {  // save the program as a .delta file, named after the DFA
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('src').value], { type: 'text/plain' }));
  a.download = (result.ast ? result.ast.id.v : 'program') + '.delta';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(text => { $('src').value = text; goodDFA = null; update(); save(); });
  e.target.value = '';
};
$('src').onscroll = () => { $('gutter').scrollTop = $('src').scrollTop; };
$('src').onkeydown = e => { if (e.ctrlKey && e.key === 'Enter') update(); };
// clicking a symbol button should not move the cursor out of the editor
$('palette').onmousedown = e => e.preventDefault();
$('palette').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const t = $('src'), at = t.selectionStart, ch = b.textContent;
  t.value = t.value.slice(0, at) + ch + t.value.slice(t.selectionEnd);
  t.selectionStart = t.selectionEnd = at + ch.length; t.focus(); update();
};
$('tabs').onclick = e => {
  const b = e.target.closest('button');
  if (b) { tab = b.firstChild.textContent; paintTab(); }
};
$('tabbody').onclick = e => {  // clicking a problem highlights the offending text in the editor
  const a = e.target.closest('.problem');
  if (!a) return;
  const d = result.diags[a.dataset.i];
  $('src').focus(); $('src').setSelectionRange(d.start, d.end);
};
$('word').oninput = resetSim;
$('word').onkeydown = e => { if (e.key === 'Enter') runSim(); };
$('step').onclick = stepSim; $('run').onclick = runSim; $('reset').onclick = resetSim;

try { $('src').value = localStorage.getItem('delta-src') || ''; } catch (_) {}
update();
