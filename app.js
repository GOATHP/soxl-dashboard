const DEFAULT = [{name: 'GOATHP', shares: 36, avg: 118.04}];
const KEY = 'soxl-positions-v1';
const usd = (v) => (v < 0 ? '-' : '') + '$' + d3.format(',.2f')(Math.abs(v));
const sUsd = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + d3.format(',.2f')(Math.abs(v));
const sPct = (v) => (v > 0 ? '+' : '') + d3.format('.2f')(v) + '%';
const fmtShares = (v) => d3.format(',')(+v.toFixed(4));
const $ = (id) => document.getElementById(id);
const set = (id, text, tone) => { const el = $(id); if (!el) return; el.textContent = text;
  if (tone !== undefined) { el.classList.toggle('bad', tone < 0); el.classList.toggle('ok', tone > 0); } };

let DATA = null;
let SHARED = null; // {db, uid}
let positions = load();
let selected = 0;

function clean(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => ({name: String(p.name || '').slice(0, 20).trim(), shares: +p.shares, avg: +p.avg}))
    .filter((p) => p.name && p.shares > 0 && p.avg > 0).slice(0, 50);
}
function fromHash() {
  const m = /^#p=(.+)$/.exec(location.hash);
  if (!m) return null;
  try {
    return clean(decodeURIComponent(m[1]).split(';').map((s) => { const [name, shares, avg] = s.split(','); return {name, shares, avg}; }));
  } catch (e) { return null; }
}
function stored() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return []; } }
function load() {
  const h = fromHash() || [];
  const s = stored();
  // link entries win for the same name; entries saved in this browser are never dropped
  const names = new Set(h.map((p) => p.name));
  const merged = h.concat(s.filter((p) => !names.has(p.name)));
  if (merged.length) {
    try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch (e) {}
    if (h.length) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    return merged;
  }
  return DEFAULT.slice();
}
function save() { if (SHARED) return; try { localStorage.setItem(KEY, JSON.stringify(positions)); } catch (e) {} }
function shareUrl() {
  const enc = positions.map((p) => [p.name.replace(/[,;]/g, ' '), p.shares, p.avg].join(',')).join(';');
  return location.origin + location.pathname + '#p=' + encodeURIComponent(enc);
}

function calc(p, price) {
  const cost = p.shares * p.avg, mv = p.shares * price;
  return {cost, mv, pnl: mv - cost, pct: (price / p.avg - 1) * 100, be: price >= p.avg ? 0 : (p.avg / price - 1) * 100};
}

function renderSelected() {
  if (!DATA) return;
  const p = positions[selected] || positions[0];
  if (!p) return;
  const c = calc(p, DATA.price);
  set('sel-name', p.name); set('sel-shares', fmtShares(p.shares)); set('sel-avg', usd(p.avg));
  set('pnl', sUsd(c.pnl), c.pnl); set('lede-pnl', sUsd(c.pnl), c.pnl);
  set('pnlpct', sPct(c.pct), c.pct); set('lede-pct', sPct(c.pct), c.pct);
  set('lede-be', c.be ? sPct(c.be) : '없음(이미 평단 위)');
  set('mv', usd(c.mv)); set('mv-shares', fmtShares(p.shares)); set('cost', usd(c.cost));
  set('daypnl', sUsd(p.shares * DATA.change), DATA.change);
}

function renderTable() {
  const body = $('cmp-body'); body.replaceChildren();
  if (!positions.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 9; td.className = 'note'; td.textContent = SHARED ? '아직 아무도 없습니다. 위에서 이름, 주식수, 평단을 넣어 첫 보유자가 되어 보세요.' : '위에서 이름, 주식수, 평단을 넣고 첫 보유자를 추가하세요.';
    tr.append(td); body.append(tr); return;
  }
  const price = DATA ? DATA.price : null;
  const order = positions.map((p, i) => ({p, i, c: price ? calc(p, price) : null}))
    .sort((a, b) => (a.c && b.c ? b.c.pct - a.c.pct : 0));
  for (const {p, i, c} of order) {
    const tr = document.createElement('tr');
    if (i === selected) tr.className = 'sel';
    const cells = [
      [p.name], [fmtShares(p.shares)], [usd(p.avg)], [usd(p.shares * p.avg)],
      [c ? usd(c.mv) : '—'], [c ? sUsd(c.pnl) : '—', c && c.pnl], [c ? sPct(c.pct) : '—', c && c.pct], [c ? (c.be ? sPct(c.be) : '도달') : '—'],
    ];
    for (const [text, tone] of cells) {
      const td = document.createElement('td'); td.textContent = text;
      if (tone) td.className = tone < 0 ? 'bad' : 'ok';
      tr.append(td);
    }
    const td = document.createElement('td');
    if (!SHARED || (p.uid && p.uid === SHARED.uid)) {
      const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn x'; ed.textContent = '수정';
      ed.setAttribute('aria-label', p.name + ' 수정');
      ed.addEventListener('click', (e) => { e.stopPropagation(); startEdit(i); });
      td.append(ed, ' ');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn x'; b.textContent = '삭제';
      b.setAttribute('aria-label', p.name + ' 삭제');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (SHARED) { SHARED.db.collection('positions').doc(p.id).delete().catch(() => set('copy-msg', '삭제하지 못했습니다.')); return; }
        positions.splice(i, 1); if (selected >= positions.length) selected = 0; save(); renderAll();
      });
      td.append(b);
    }
    tr.append(td);
    tr.tabIndex = 0;
    const pick = () => { selected = i; renderAll(); };
    tr.addEventListener('click', pick);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    body.append(tr);
  }
}

function renderBars() {
  const box = $('bars'); box.replaceChildren();
  if (!DATA || !positions.length) return;
  const items = positions.map((p, i) => ({p, i, pct: calc(p, DATA.price).pct})).sort((a, b) => b.pct - a.pct);
  const lo = Math.min(0, ...items.map((d) => d.pct)), hi = Math.max(0, ...items.map((d) => d.pct));
  const span = (hi - lo) || 1;
  const pos = (v) => ((v - lo) / span) * 100;
  for (const {p, i, pct} of items) {
    const row = document.createElement('div'); row.className = 'bar' + (i === selected ? ' sel' : '');
    row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `${p.name} 수익률 ${sPct(pct)}`);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
    const tr = document.createElement('div'); tr.className = 'track';
    const z = document.createElement('div'); z.className = 'zero'; z.style.left = pos(0) + '%';
    const f = document.createElement('div'); f.className = 'fill ' + (pct < 0 ? 'neg' : 'pos');
    const a = pos(Math.min(0, pct)), b = pos(Math.max(0, pct));
    f.style.left = a + '%'; f.style.width = Math.max(b - a, 0.5) + '%';
    const v = document.createElement('span'); v.className = 'val ' + (pct < 0 ? 'bad' : 'ok'); v.textContent = sPct(pct);
    tr.append(z, f); row.append(nm, tr, v);
    const pick = () => { selected = i; renderAll(); };
    row.addEventListener('click', pick); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    box.append(row);
  }
}

const KRW = 1400;
const GOODS = [
  {ic: '🍗', what: '치킨', unit: '마리', price: 23000},
  {ic: '☕', what: '스타벅스 아메리카노', unit: '잔', price: 4700},
  {ic: '🍲', what: '국밥', unit: '그릇', price: 10000},
  {ic: '🎬', what: '영화 관람', unit: '편', price: 15000},
  {ic: '📺', what: '넷플릭스 프리미엄', unit: '개월', price: 17000},
  {ic: '🎧', what: '에어팟 프로', unit: '개', price: 359000},
  {ic: '📱', what: '아이폰 (기본 모델)', unit: '대', price: 1250000},
  {ic: '✈️', what: '도쿄 왕복 항공권', unit: '번', price: 350000},
  {ic: '🚙', what: '경차 (캐스퍼급)', unit: '대', price: 14000000},
  {ic: '🚗', what: '준중형 (아반떼급)', unit: '대', price: 21000000},
  {ic: '🚘', what: '제네시스 G80', unit: '대', price: 58000000},
  {ic: '🏎️', what: '포르쉐 911', unit: '대', price: 170000000},
];
const won = (v) => '₩' + d3.format(',')(Math.round(v));
function renderCouldHave() {
  const box = $('goods'); if (!box) return;
  box.replaceChildren();
  const p = positions[selected];
  const typed = parseFloat($('amt-input').value);
  let amt;
  if (typed > 0) {
    amt = $('amt-cur').value === 'usd' ? typed * KRW : typed;
    set('ch-title', '그 돈으로 할 수 있는 것');
    set('ch-lede', `${won(amt)}이면 이만큼 할 수 있어요.`);
  } else {
    if (!DATA || !p) { box.replaceChildren(); set('ch-lede', '보유자를 추가하거나 금액을 입력하면 여기에 나옵니다.'); set('ch-total', ''); return; }
    const c = calc(p, DATA.price);
    amt = Math.abs(c.pnl) * KRW;
    const lost = c.pnl < 0;
    set('ch-title', lost ? '그 돈으로 할 수 있었던 것' : '번 돈으로 할 수 있는 것');
    set('ch-lede', lost ? `${p.name}님이 지금까지 잃은 ${won(amt)}이면 이만큼 할 수 있었어요.`
                        : `${p.name}님이 지금까지 번 ${won(amt)}이면 이만큼 할 수 있어요.`);
  }
  for (const g of GOODS) {
    const n = amt / g.price;
    const d = document.createElement('div'); d.className = 'good';
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = g.ic; ic.setAttribute('aria-hidden', 'true');
    const num = document.createElement('span'); num.className = 'n'; num.textContent = (n >= 10 ? d3.format(',')(Math.floor(n)) : n >= 1 ? d3.format('.1f')(n) : n >= 0.01 ? d3.format('.2f')(n) : d3.format('.3f')(n)) + g.unit;
    const w = document.createElement('span'); w.className = 'what'; w.textContent = g.what;
    const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = `개당 약 ${won(g.price)}`;
    d.append(ic, num, w, pr); box.append(d);
  }
  if (!DATA) { set('ch-total', ''); return; }
  const totalLoss = positions.reduce((s, q) => s + Math.min(0, calc(q, DATA.price).pnl), 0) * -KRW;
  set('ch-total', positions.length > 1 && totalLoss > 0
    ? `비교 목록 전체가 잃은 돈은 ${won(totalLoss)}, 치킨 ${d3.format(',')(Math.floor(totalLoss / 23000))}마리입니다.` : '');
}

function renderAll() { renderTable(); renderBars(); renderSelected(); renderCouldHave(); draw(); }

let editing = -1;
function startEdit(i) {
  const p = positions[i]; if (!p) return;
  editing = i; selected = i;
  $('f-name').value = p.name; $('f-shares').value = p.shares; $('f-avg').value = p.avg;
  $('add-btn').textContent = '저장'; $('cancel-edit').hidden = false;
  $('f-shares').focus(); renderAll();
}
function stopEdit() { editing = -1; $('add-form').reset(); $('add-btn').textContent = '추가'; $('cancel-edit').hidden = true; }
$('cancel-edit').addEventListener('click', stopEdit);

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = clean([{name: $('f-name').value, shares: $('f-shares').value, avg: $('f-avg').value}])[0];
  if (!p) return;
  if (editing >= 0 && positions[editing]) {
    const cur = positions[editing];
    if (SHARED) {
      SHARED.db.collection('positions').doc(cur.id).update({name: p.name, shares: p.shares, avg: p.avg})
        .then(stopEdit, () => set('copy-msg', '수정하지 못했습니다.'));
      return;
    }
    positions[editing] = p; selected = editing; save(); stopEdit(); renderAll();
    return;
  }
  if (SHARED) {
    SHARED.db.collection('positions').add({...p, uid: SHARED.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()})
      .then(() => { e.target.reset(); pendingSelect = p.name; }, () => set('copy-msg', '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));
    return;
  }
  positions.push(p); selected = positions.length - 1; save();
  e.target.reset(); renderAll();
});

$('copy-link').addEventListener('click', () => {
  const url = shareUrl();
  const done = (msg) => set('copy-msg', msg);
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => done('링크를 복사했습니다.'), () => done(url));
  else done(url);
});

window.addEventListener('hashchange', () => { if (window.FIREBASE_CONFIG) return; const h = fromHash(); if (h && h.length) { positions = load(); selected = 0; renderAll(); } });

function liveQuote(d) {
  const key = window.FINNHUB_KEY;
  if (!key) return Promise.resolve(d);
  return fetch('https://finnhub.io/api/v1/quote?symbol=SOXL&token=' + encodeURIComponent(key))
    .then((r) => r.ok ? r.json() : Promise.reject(r.status))
    .then((q) => {
      if (!(q && q.c > 0 && q.t)) return d;
      const day = new Date(q.t * 1000).toISOString().slice(0, 10);
      const daily = d.daily.filter((r) => r.date < day).concat([{date: day, close: q.c}]);
      $('refresh-note').textContent = '페이지를 여는 동안 1분마다 새로 불러옵니다.';
      return {...d, price: q.c, prevClose: q.pc, change: q.d, changePct: q.dp,
        asOf: new Date(q.t * 1000).toISOString(), source: 'Finnhub', daily,
        low52: Math.min(d.low52, q.l || q.c), high52: Math.max(d.high52, q.h || q.c)};
    })
    .catch(() => d);
}

let BASE = null;
let LIVE = null;
let OVERRIDE = null;
function withOverride(d) {
  if (!(OVERRIDE > 0)) return d;
  const daily = d.daily.slice(0, -1).concat([{...d.daily[d.daily.length - 1], close: OVERRIDE}]);
  return {...d, price: OVERRIDE, change: OVERRIDE - d.prevClose, changePct: (OVERRIDE / d.prevClose - 1) * 100, daily,
    low52: Math.min(d.low52, OVERRIDE), high52: Math.max(d.high52, OVERRIDE)};
}
function applyQuote(live) {
  LIVE = live;
  const d = withOverride(live);
  $('manual-badge').hidden = !(OVERRIDE > 0);
  if (OVERRIDE > 0) $('manual-badge').textContent = '직접 입력한 가격' + (OVR_AT ? ' · ' + d3.timeFormat('%-m/%-d %H:%M')(OVR_AT) + ' 정정' : '') + (SHARED ? ' (모두에게 적용)' : '');
  $('live-badge').hidden = OVERRIDE > 0 || live.source !== 'Finnhub';
  $('ovr-reset').hidden = !(OVERRIDE > 0);
  DATA = d;
  const p = d.price;
  set('price', usd(p)); set('chg', sUsd(d.change), d.change); set('chgpct', sPct(d.changePct), d.changePct);
  set('low52', usd(d.low52)); set('high52', usd(d.high52));
  set('rangepos', d3.format('.1f')((p - d.low52) / (d.high52 - d.low52) * 100) + '%');
  const kst = new Date(new Date(d.asOf).getTime() + 9 * 3600e3);
  set('asof', d3.utcFormat('%Y년 %-m월 %-d일 %H:%M')(kst)); set('src', OVERRIDE > 0 ? '직접 입력 (' + d.source + ' 대신)' : d.source);
  renderAll();
}
fetch('data/soxl.json', {cache: 'no-cache'}).then((r) => r.json()).then((d) => { BASE = d; return liveQuote(d); }).then((d) => {
  applyQuote(d);
  if (window.FINNHUB_KEY) setInterval(() => { if (!document.hidden && BASE) liveQuote(BASE).then(applyQuote); }, 60000);
}).catch(() => { $('chart').textContent = '시세 데이터를 불러오지 못했습니다.'; renderTable(); });

function drawChart() {
  const el = $('chart'); el.replaceChildren();
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.append(tip);
  const parse = d3.utcParse('%Y-%m-%d');
  const rows = DATA.daily.map((r) => ({t: parse(r.date), close: +r.close})).filter((r) => r.t);
  const sel = positions[selected];
  const avgs = positions.map((p) => p.avg);
  const W = el.clientWidth || 600, H = 300, m = {top: 16, right: 12, bottom: 28, left: 48};
  const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.t)).range([m.left, W - m.right]);
  const y = d3.scaleLinear().domain([0, Math.max(d3.max(rows, (r) => r.close), ...avgs, 1) * 1.05]).nice().range([H - m.bottom, m.top]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
    .attr('role', 'img').attr('aria-label', 'SOXL 일별 종가 선 그래프와 보유자별 평단 기준선');
  svg.append('g').attr('transform', `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.left - m.right)).tickFormat((v) => '$' + v))
    .call((g) => { g.select('.domain').remove(); g.selectAll('line').style('stroke', 'var(--grid)'); });
  svg.append('g').attr('transform', `translate(0,${H - m.bottom})`)
    .call(d3.axisBottom(x).ticks(W < 480 ? 4 : 7).tickFormat(d3.utcFormat('%-m/%-d')))
    .call((g) => { g.selectAll('.domain, line').style('stroke', 'var(--line)'); });
  svg.append('path').datum(rows).attr('d', d3.area().x((r) => x(r.t)).y0(y(0)).y1((r) => y(r.close)))
    .style('fill', 'var(--accent)').style('opacity', 0.08);
  svg.append('path').datum(rows).attr('d', d3.line().x((r) => x(r.t)).y((r) => y(r.close)))
    .style('fill', 'none').style('stroke', 'var(--accent)').style('stroke-width', 2);
  positions.forEach((p, i) => {
    const on = p === sel;
    svg.append('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(p.avg)).attr('y2', y(p.avg))
      .style('stroke', PCOL(i)).style('stroke-dasharray', '5 4').style('stroke-width', on ? 2.5 : 1.5);
  });
  const al = positions.map((p, i) => ({p, i, y: y(p.avg) - 5})).sort((a, b) => a.y - b.y);
  for (let k = 1; k < al.length; k++) if (al[k].y - al[k - 1].y < 14) al[k].y = al[k - 1].y + 14;
  for (const l of al) svg.append('text').attr('x', m.left + 6).attr('y', l.y).text(`${l.p.name} 평단 ${usd(l.p.avg)}`)
    .style('fill', PCOL(l.i)).style('font-weight', l.p === sel ? 600 : 400);
  const last = rows[rows.length - 1];
  svg.append('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(DATA.price)).attr('y2', y(DATA.price))
    .style('stroke', 'var(--accent)').style('stroke-width', 1).style('opacity', 0.6);
  svg.append('text').attr('x', W - m.right).attr('y', y(DATA.price) - 6).attr('text-anchor', 'end').text(`현재가 ${usd(DATA.price)}`)
    .style('fill', 'var(--accent)').style('font-weight', 600);
  svg.append('circle').attr('cx', x(last.t)).attr('cy', y(last.close)).attr('r', 4).style('fill', 'var(--accent)');
  const dot = svg.append('circle').attr('r', 4).style('fill', 'var(--accent)').style('stroke', 'var(--bg)').style('stroke-width', 2).attr('visibility', 'hidden');
  const bis = d3.bisector((r) => r.t).center;
  svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom)
    .style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const r = rows[bis(rows, x.invert(d3.pointer(ev)[0]))];
      dot.attr('cx', x(r.t)).attr('cy', y(r.close)).attr('visibility', 'visible');
      tip.textContent = `${d3.utcFormat('%Y-%m-%d')(r.t)} · 종가 ${usd(r.close)}` + (sel ? ` · ${sel.name} 평단 대비 ${sPct((r.close / sel.avg - 1) * 100)}` : '');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(x(r.t) - tw / 2, 0), W - tw) + 'px';
      tip.style.top = Math.max(y(r.close) - 40, 0) + 'px';
    })
    .on('pointerleave', () => { tip.hidden = true; dot.attr('visibility', 'hidden'); });
}

function drawRange() {
  const el = $('range'); el.replaceChildren();
  const lo = DATA.low52, hi = DATA.high52, p = DATA.price, sel = positions[selected];
  const W = el.clientWidth || 600, H = 92, m = {l: 16, r: 16}, by = 46;
  const x = d3.scaleLinear().domain([lo, hi]).range([m.l, W - m.r]).clamp(true);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
    .attr('role', 'img').attr('aria-label', '52주 가격 범위에서 현재가와 평단의 위치');
  svg.append('rect').attr('x', m.l).attr('y', by - 4).attr('width', W - m.l - m.r).attr('height', 8).attr('rx', 4).style('fill', 'var(--grid)');
  svg.append('rect').attr('x', m.l).attr('y', by - 4).attr('width', Math.max(x(p) - m.l, 2)).attr('height', 8).attr('rx', 4).style('fill', 'var(--accent)');
  const mark = (v, label, up, color) => {
    svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', by - 12).attr('y2', by + 12).style('stroke', color).style('stroke-width', 2);
    const t = svg.append('text').attr('y', up ? by - 18 : by + 28).attr('text-anchor', 'middle').text(label);
    const w = t.node().getComputedTextLength();
    t.attr('x', Math.min(Math.max(x(v), m.l + w / 2), W - m.r - w / 2));
  };
  mark(p, `현재 ${usd(p)}`, true, 'var(--accent)');
  if (sel) mark(sel.avg, `${sel.name} 평단 ${usd(sel.avg)}`, false, 'var(--ref)');
  svg.append('text').attr('x', m.l).attr('y', H - 4).text(usd(lo));
  svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').text(usd(hi));
}

const PCOL = (i) => `var(--c${(i % 8) + 1})`;
function drawReturns() {
  const el = $('ret-chart'); el.replaceChildren();
  if (!positions.length) { el.textContent = '비교할 보유자를 추가하면 여기에 수익률 추이가 나옵니다.'; return; }
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.append(tip);
  const parse = d3.utcParse('%Y-%m-%d');
  const days = DATA.daily.map((r) => ({t: parse(r.date), close: +r.close})).filter((r) => r.t);
  const series = positions.map((p, i) => ({p, i, pts: days.map((d) => ({t: d.t, v: (d.close / p.avg - 1) * 100}))}));
  const all = series.flatMap((s) => s.pts.map((d) => d.v));
  const svgProbe = d3.select(el).append('svg').attr('width', 0).attr('height', 0);
  const labW = Math.min(140, Math.max(...positions.map((p) => {
    const t = svgProbe.append('text').text(`${p.name} ${sPct(-88.88)}`); const w = t.node().getComputedTextLength(); return w || 90; })) + 12);
  svgProbe.remove();
  const W = el.clientWidth || 600, H = 320, m = {top: 14, right: labW, bottom: 28, left: 52};
  const x = d3.scaleUtc().domain(d3.extent(days, (d) => d.t)).range([m.left, W - m.right]);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(all)), Math.max(0, d3.max(all))]).nice().range([H - m.bottom, m.top]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
    .attr('role', 'img').attr('aria-label', '보유자별 수익률 추이 선 그래프');
  svg.append('g').attr('transform', `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.left - m.right)).tickFormat((v) => v + '%'))
    .call((g) => { g.select('.domain').remove(); g.selectAll('line').style('stroke', 'var(--grid)'); });
  svg.append('g').attr('transform', `translate(0,${H - m.bottom})`)
    .call(d3.axisBottom(x).ticks(W < 480 ? 4 : 7).tickFormat(d3.utcFormat('%-m/%-d')))
    .call((g) => { g.selectAll('.domain, line').style('stroke', 'var(--line)'); });
  svg.append('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--ref)').style('stroke-width', 1.5);
  const line = d3.line().x((d) => x(d.t)).y((d) => y(d.v));
  const pick = (i) => { selected = i; renderAll(); };
  for (const s of series) {
    const on = s.i === selected;
    svg.append('path').datum(s.pts).attr('d', line).style('fill', 'none').style('stroke', PCOL(s.i))
      .style('stroke-width', on ? 3 : 1.8).style('opacity', on ? 1 : 0.8).style('cursor', 'pointer').on('click', () => pick(s.i));
    const last = s.pts[s.pts.length - 1];
    svg.append('circle').attr('cx', x(last.t)).attr('cy', y(last.v)).attr('r', on ? 4.5 : 3.5).style('fill', PCOL(s.i));
  }
  // end labels, nudged apart
  const labs = series.map((s) => ({s, y: y(s.pts[s.pts.length - 1].v)})).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 15) labs[k].y = labs[k - 1].y + 15;
  const over = labs.length ? labs[labs.length - 1].y - (H - m.bottom) : 0;
  if (over > 0) labs.forEach((l) => { l.y -= over; });
  for (const {s, y: ly} of labs) {
    const v = s.pts[s.pts.length - 1].v;
    svg.append('text').attr('x', W - m.right + 8).attr('y', ly + 4).text(`${s.p.name} ${sPct(v)}`)
      .style('fill', PCOL(s.i)).style('font-weight', s.i === selected ? 600 : 400).style('cursor', 'pointer').on('click', () => pick(s.i));
  }
  const vline = svg.append('line').attr('y1', m.top).attr('y2', H - m.bottom).style('stroke', 'var(--line)').attr('visibility', 'hidden');
  const bis = d3.bisector((d) => d.t).center;
  svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom)
    .style('fill', 'transparent').style('pointer-events', 'all').lower()
    .on('pointermove', (ev) => {
      const k = bis(days, x.invert(d3.pointer(ev)[0])); const d = days[k];
      vline.attr('x1', x(d.t)).attr('x2', x(d.t)).attr('visibility', 'visible');
      tip.replaceChildren();
      const h = document.createElement('div'); h.textContent = `${d3.utcFormat('%Y-%m-%d')(d.t)} · 종가 ${usd(d.close)}`; tip.append(h);
      for (const s of [...series].sort((a, b) => b.pts[k].v - a.pts[k].v)) {
        const r = document.createElement('div'); r.textContent = `${s.p.name} ${sPct(s.pts[k].v)}`; r.style.color = PCOL(s.i); tip.append(r);
      }
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(x(d.t) + 12, 0), W - tw) + 'px'; tip.style.top = m.top + 'px';
    })
    .on('pointerleave', () => { tip.hidden = true; vline.attr('visibility', 'hidden'); });
  // keep grid/axes under the hover rect
  svg.selectAll('g').lower();
}

function draw() { if (DATA) { drawReturns(); drawChart(); drawRange(); } }
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });



let pendingSelect = null;
function sharedStatus(msg) {
  const el = $('shared-status'); if (!el) return;
  el.textContent = msg || ''; el.hidden = !msg;
}
function fallbackLocal(why) {
  SHARED = null;
  $('mode-local').hidden = false; $('mode-shared').hidden = true; $('link-actions').hidden = false;
  sharedStatus(why + ' 지금은 이 브라우저에만 저장됩니다.');
  positions = load(); selected = 0; renderAll();
}
(function initShared() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !window.firebase) return;
  try {
    firebase.initializeApp(cfg);
    const db = firebase.firestore();
    positions = []; selected = 0;
    $('mode-local').hidden = true; $('mode-shared').hidden = false; $('link-actions').hidden = true;
    sharedStatus('공유 목록을 불러오는 중…');
    renderAll();
    firebase.auth().signInAnonymously().then((cred) => {
      SHARED = {db, uid: cred.user.uid};
      watchSharedPrice();
      db.collection('positions').orderBy('createdAt').onSnapshot((snap) => {
        sharedStatus('');
        const cur = positions[selected];
        positions = snap.docs.map((d) => ({id: d.id, ...d.data()}))
          .filter((p) => p.name && p.shares > 0 && p.avg > 0)
          .map((p) => ({id: p.id, uid: p.uid, name: String(p.name).slice(0, 20), shares: +p.shares, avg: +p.avg}));
        let idx = pendingSelect ? positions.map((p) => p.name).lastIndexOf(pendingSelect) : -1;
        if (idx >= 0) pendingSelect = null;
        else idx = cur ? positions.findIndex((p) => p.id === cur.id) : 0;
        selected = idx >= 0 ? idx : 0;
        renderAll();
      }, (err) => { console.error(err); fallbackLocal('공유 목록을 읽지 못했습니다 (Firestore 규칙을 확인하세요).'); });
    }, (err) => { console.error(err); fallbackLocal('공유 목록에 연결하지 못했습니다 (익명 로그인과 승인된 도메인을 확인하세요).'); });
  } catch (e) { console.error(e); fallbackLocal('공유 목록을 쓸 수 없습니다.'); }
})();

$('amt-input').addEventListener('input', renderCouldHave);
$('amt-cur').addEventListener('change', renderCouldHave);
$('amt-form').addEventListener('submit', (e) => { e.preventDefault(); renderCouldHave(); });
$('amt-clear').addEventListener('click', () => { $('amt-input').value = ''; renderCouldHave(); });

let OVR_AT = null;
function priceDoc() { return SHARED ? SHARED.db.collection('settings').doc('price') : null; }
$('ovr-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = Math.round(parseFloat($('ovr-input').value) * 100) / 100;
  if (!(v > 0 && v < 100000)) return;
  const doc = priceDoc();
  if (doc) {
    doc.set({price: v, at: firebase.firestore.FieldValue.serverTimestamp()})
      .catch(() => sharedStatus('정정한 가격을 저장하지 못했습니다 (Firestore 규칙을 확인하세요).'));
    return;
  }
  OVERRIDE = v; OVR_AT = new Date(); if (LIVE) applyQuote(LIVE);
});
$('ovr-reset').addEventListener('click', () => {
  $('ovr-input').value = '';
  const doc = priceDoc();
  if (doc) { doc.delete().catch(() => sharedStatus('되돌리지 못했습니다.')); return; }
  OVERRIDE = null; OVR_AT = null; if (LIVE) applyQuote(LIVE);
});
function watchSharedPrice() {
  const doc = priceDoc(); if (!doc) return;
  doc.onSnapshot((d) => {
    const v = d.exists ? +d.data().price : NaN;
    OVERRIDE = v > 0 ? v : null;
    const at = d.exists && d.data().at && d.data().at.toDate ? d.data().at.toDate() : null;
    OVR_AT = OVERRIDE ? (at || new Date()) : null;
    if (LIVE) applyQuote(LIVE);
  }, (err) => console.error(err));
}
