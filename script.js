/**
 * script.js — PropertyPulse Dubai Real Estate Intelligence
 * ----------------------------------------------------------
 * All chart-building logic. Depends on globals defined in data.js
 * (DATA, FURNISH_DATA, CONTRACT_DATA, CHILLER_DATA, YIELD_DATA,
 *  SCATTER_DATA, FREEHOLD_DATA, DEVELOPER_DATA) and on D3 v7.
 *
 * Every chart exposes its own local filter controls (dropdowns,
 * toggle groups, or sliders) wired up inside its build function,
 * in addition to the global year-range filter in the header which
 * drives every time-series chart (Trend, Freehold, Off-Plan vs
 * Secondary).
 */

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════
const fmt  = d3.format(',');
const fmtK = v => v >= 1e6 ? d3.format('.1f')(v/1e6)+'M' : d3.format('.0f')(v/1000)+'K';
const parseYM = d3.timeParse('%Y-%m');
const tt = d3.select('#tooltip');

function showTT(html, event) {
  tt.html(html).style('opacity', 1)
    .style('left', (event.clientX + 16) + 'px')
    .style('top',  (Math.min(event.clientY - 10, window.innerHeight - 180)) + 'px');
}
function hideTT() { tt.style('opacity', 0); }

function dimOthers(selector, activeNode) {
  d3.selectAll(selector).transition().duration(150).style('opacity', function() {
    return this === activeNode ? 1 : 0.2;
  });
}
function restoreOpacity(selector) {
  d3.selectAll(selector).transition().duration(200).style('opacity', 1);
}

/** Remove every child from a container — used before a chart redraws itself. */
function clear(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ═══════════════════════════════════════════════
// GLOBAL YEAR-RANGE FILTER (header)
// Drives every time-series chart across the whole dashboard.
// ═══════════════════════════════════════════════
let globalFrom = '2020', globalTo = '2026';

document.getElementById('global-year-from').addEventListener('change', e => {
  globalFrom = e.target.value;
  rebuildFiltered();
});
document.getElementById('global-year-to').addEventListener('change', e => {
  globalTo = e.target.value;
  rebuildFiltered();
});

function getFilteredTrend() {
  return DATA.trend
    .map(d => ({...d, date: parseYM(d.year_month)}))
    .filter(d => {
      const y = d.date.getFullYear().toString();
      return y >= globalFrom && y <= globalTo;
    });
}

/** Re-draw every chart that depends on the global year-range filter. */
function rebuildFiltered() {
  if (document.getElementById('trend-chart').innerHTML)               { clear('trend-chart'); buildTrend(); }
  if (document.getElementById('freehold-chart').innerHTML)            { clear('freehold-chart'); buildFreehold(); }
  if (document.getElementById('offplan-secondary-chart').innerHTML)   { clear('offplan-secondary-chart'); buildOffplanSecondary(); }
}

// ═══════════════════════════════════════════════
// VIEW ROUTER
// ═══════════════════════════════════════════════
const VIEWS = ['overview','prices','geography','offplan','rentals'];
let chartsBuilt = {};

function showView(name) {
  VIEWS.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('active', v === name);
  });
  document.querySelectorAll('nav button').forEach((btn, i) => {
    btn.classList.toggle('active', VIEWS[i] === name);
  });
  if (!chartsBuilt[name]) {
    chartsBuilt[name] = true;
    // Defer until the view's display:block has been committed so that
    // clientWidth/clientHeight reads (used by every chart for responsive
    // sizing) return real values instead of 0.
    requestAnimationFrame(() => requestAnimationFrame(() => buildCharts(name)));
  }
}

function buildCharts(name) {
  if (name === 'overview')   { buildTrend(); buildPropType(); buildViewChart(); }
  if (name === 'prices')     { buildBedroom(); buildCommunity(); buildFreehold(); buildScatter(); }
  if (name === 'geography')  { buildMap(); buildMetroChart(); }
  if (name === 'offplan')    { buildPipeline(); buildDeveloper(); buildOffplanSecondary(); }
  if (name === 'rentals')    { buildFurnish(); buildContract(); buildChiller(); buildYield(); }
}

// ═══════════════════════════════════════════════
// CHART 1: TREND LINE CHART
// Filters: metric toggle (all/secondary/offplan/rental), smoothing
// slider, plus the global year-range filter.
// ═══════════════════════════════════════════════
function buildTrend() {
  const container = document.getElementById('trend-chart');
  if (container.innerHTML) return;
  const W = container.clientWidth || 800, H = 340;
  const margin = {top: 20, right: 70, bottom: 50, left: 60};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id', 'clip-trend')
    .append('rect').attr('width', iw).attr('height', ih + 4).attr('y', -4);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  let parsed = getFilteredTrend();

  const defs = svg.select('defs');
  ['sec', 'off', 'ren'].forEach((id, i) => {
    const colors = ['var(--c-secondary)', 'var(--c-offplan)', 'var(--c-rental)'];
    const grad = defs.append('linearGradient').attr('id', `grad-${id}`).attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
    grad.append('stop').attr('offset','0%').attr('stop-color', colors[i]).attr('stop-opacity', 0.3);
    grad.append('stop').attr('offset','100%').attr('stop-color', colors[i]).attr('stop-opacity', 0);
  });

  let x = d3.scaleTime().domain(d3.extent(parsed, d => d.date)).range([0, iw]);
  const y  = d3.scaleLinear().domain([0, 750]).range([ih, 0]);
  const yR = d3.scaleLinear().domain([0, 50]).range([ih, 0]);

  const xAxisG  = g.append('g').attr('transform', `translate(0,${ih})`);
  const yAxisG  = g.append('g');
  const yAxisRG = g.append('g').attr('transform', `translate(${iw},0)`);

  function drawAxes() {
    xAxisG.call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %Y')))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    xAxisG.select('.domain').remove();
    yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+d))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    yAxisG.select('.domain').remove();
    yAxisRG.call(d3.axisRight(yR).ticks(5).tickFormat(d => '$'+d+'/yr'))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    yAxisRG.select('.domain').remove();
  }

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  drawAxes();

  g.append('text').attr('transform','rotate(-90)').attr('y', -44).attr('x', -ih/2)
    .attr('text-anchor','middle').style('fill','var(--text-3)').style('font-size','11px').text('Price/sqft (USD)');
  g.append('text').attr('transform','rotate(90)').attr('y', -(iw + 60)).attr('x', ih/2)
    .attr('text-anchor','middle').style('fill','var(--text-3)').style('font-size','11px').text('Rental $/sqft/yr');

  const pathGroup = g.append('g').attr('clip-path', 'url(#clip-trend)');

  const areaSec = d3.area().x(d => x(d.date)).y0(ih).y1(d => y(d.secondary_psf)).curve(d3.curveMonotoneX);
  const areaOff = d3.area().x(d => x(d.date)).y0(ih).y1(d => y(d.offplan_psf)).curve(d3.curveMonotoneX);
  const areaRen = d3.area().x(d => x(d.date)).y0(ih).y1(d => yR(d.rental_psf)).curve(d3.curveMonotoneX);

  const fillSec = pathGroup.append('path').attr('fill','url(#grad-sec)');
  const fillOff = pathGroup.append('path').attr('fill','url(#grad-off)');
  const fillRen = pathGroup.append('path').attr('fill','url(#grad-ren)');

  const lineSec = d3.line().x(d => x(d.date)).y(d => y(d.secondary_psf)).curve(d3.curveMonotoneX);
  const lineOff = d3.line().x(d => x(d.date)).y(d => y(d.offplan_psf)).curve(d3.curveMonotoneX);
  const lineRen = d3.line().x(d => x(d.date)).y(d => yR(d.rental_psf)).curve(d3.curveMonotoneX);

  const pathSec = pathGroup.append('path').attr('fill','none').attr('stroke','var(--c-secondary)').attr('stroke-width', 2.5);
  const pathOff = pathGroup.append('path').attr('fill','none').attr('stroke','var(--c-offplan)').attr('stroke-width', 2.5);
  const pathRen = pathGroup.append('path').attr('fill','none').attr('stroke','var(--c-rental)').attr('stroke-width', 2).attr('stroke-dasharray','6,3');

  if (parsed.some(d => d.date.getFullYear() === 2020)) {
    const covidX = x(new Date(2020, 8, 1));
    if (covidX > 0 && covidX < iw) {
      pathGroup.append('line').attr('x1', covidX).attr('x2', covidX).attr('y1', 0).attr('y2', ih)
        .attr('stroke','rgba(244,63,94,0.3)').attr('stroke-width',1).attr('stroke-dasharray','4,3');
      g.append('text').attr('x', covidX + 6).attr('y', 16)
        .style('fill','rgba(244,63,94,0.6)').style('font-size','10px').text('COVID trough');
    }
  }
  if (parsed.some(d => d.date.getFullYear() === 2022)) {
    const surgeX = x(new Date(2022, 0, 1));
    if (surgeX > 0 && surgeX < iw) {
      pathGroup.append('line').attr('x1', surgeX).attr('x2', surgeX).attr('y1', 0).attr('y2', ih)
        .attr('stroke','rgba(20,184,166,0.3)').attr('stroke-width',1).attr('stroke-dasharray','4,3');
      g.append('text').attr('x', surgeX + 6).attr('y', 16)
        .style('fill','rgba(20,184,166,0.6)').style('font-size','10px').text('Market surge');
    }
  }

  function animateLine(path, lineGen, data) {
    path.datum(data).attr('d', lineGen);
    const len = path.node().getTotalLength();
    path.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
      .transition().duration(2200).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);
  }

  function update(animate = false) {
    const k = +document.getElementById('smooth-slider').value;
    const mode = document.querySelector('#metric-toggle button.active').dataset.metric;
    document.getElementById('smooth-label').innerText = k === 1 ? 'None' : `${k}-Mo`;

    let data = [...parsed];
    if (k > 1) {
      data = data.map((d, i) => ({
        ...d,
        secondary_psf: d3.mean(parsed.slice(Math.max(0,i-k+1), i+1), v => v.secondary_psf),
        offplan_psf:   d3.mean(parsed.slice(Math.max(0,i-k+1), i+1), v => v.offplan_psf),
        rental_psf:    d3.mean(parsed.slice(Math.max(0,i-k+1), i+1), v => v.rental_psf),
      }));
    }

    const show = { secondary: mode==='all'||mode==='secondary', offplan: mode==='all'||mode==='offplan', rental: mode==='all'||mode==='rental' };

    pathSec.style('opacity', show.secondary ? 1 : 0);
    pathOff.style('opacity', show.offplan ? 1 : 0);
    pathRen.style('opacity', show.rental ? 1 : 0);
    fillSec.style('opacity', show.secondary ? 0.6 : 0);
    fillOff.style('opacity', show.offplan ? 0.6 : 0);
    fillRen.style('opacity', show.rental ? 0.6 : 0);

    fillSec.datum(data).attr('d', areaSec);
    fillOff.datum(data).attr('d', areaOff);
    fillRen.datum(data).attr('d', areaRen);

    if (animate) {
      animateLine(pathSec, lineSec, data);
      animateLine(pathOff, lineOff, data);
      animateLine(pathRen, lineRen, data);
    } else {
      pathSec.datum(data).transition().duration(400).attr('d', lineSec);
      pathOff.datum(data).transition().duration(400).attr('d', lineOff);
      pathRen.datum(data).transition().duration(400).attr('d', lineRen);
    }
  }

  const zoom = d3.zoom().scaleExtent([1, 6]).translateExtent([[0,0],[iw,ih]])
    .on('zoom', e => {
      const newX = e.transform.rescaleX(x);
      xAxisG.call(d3.axisBottom(newX).ticks(6).tickFormat(d3.timeFormat('%b %Y')));
      xAxisG.selectAll('text').style('fill','var(--text-3)');
      xAxisG.select('.domain').remove();
      lineSec.x(d => newX(d.date)); lineOff.x(d => newX(d.date)); lineRen.x(d => newX(d.date));
      areaSec.x(d => newX(d.date)); areaOff.x(d => newX(d.date)); areaRen.x(d => newX(d.date));
      pathSec.attr('d', lineSec); pathOff.attr('d', lineOff); pathRen.attr('d', lineRen);
      fillSec.attr('d', areaSec); fillOff.attr('d', areaOff); fillRen.attr('d', areaRen);
      x = newX;
    });
  svg.call(zoom);

  const focus = g.append('g').style('display','none');
  focus.append('line').attr('class','crosshair-v').attr('y1',0).attr('y2',ih);
  ['var(--c-secondary)','var(--c-offplan)','var(--c-rental)'].forEach((c, i) => {
    focus.append('circle').attr('class', `dot-${i}`).attr('r',4).attr('fill',c).attr('stroke','var(--bg-2)').attr('stroke-width',2);
  });

  const bisect = d3.bisector(d => d.date).left;
  const overlay = g.append('rect').attr('width',iw).attr('height',ih).attr('fill','none').attr('pointer-events','all');

  overlay.on('mouseover', () => focus.style('display', null))
    .on('mouseout', () => { focus.style('display','none'); hideTT(); })
    .on('mousemove', e => {
      const x0 = x.invert(d3.pointer(e)[0]);
      const i = bisect(parsed, x0, 1);
      if (i >= parsed.length) return;
      const d0 = parsed[i-1], d1 = parsed[i];
      const d = (x0 - d0.date > d1.date - x0) ? d1 : d0;
      const cx = x(d.date);
      focus.select('.crosshair-v').attr('x1', cx).attr('x2', cx);
      focus.select('.dot-0').attr('cx', cx).attr('cy', y(d.secondary_psf));
      focus.select('.dot-1').attr('cx', cx).attr('cy', y(d.offplan_psf));
      focus.select('.dot-2').attr('cx', cx).attr('cy', yR(d.rental_psf));

      const mode = document.querySelector('#metric-toggle button.active').dataset.metric;
      let html = `<div class="tt-title">${d3.timeFormat('%B %Y')(d.date)}</div>`;
      if (mode==='all'||mode==='secondary') html += `<div class="tt-row"><span>Secondary:</span><span class="tt-val" style="color:var(--c-secondary)">$${fmt(Math.round(d.secondary_psf))}/sqft</span></div>`;
      if (mode==='all'||mode==='offplan')   html += `<div class="tt-row"><span>Off-Plan:</span><span class="tt-val" style="color:var(--c-offplan)">$${fmt(Math.round(d.offplan_psf))}/sqft</span></div>`;
      if (mode==='all'||mode==='rental')    html += `<div class="tt-row"><span>Rental:</span><span class="tt-val" style="color:var(--c-rental)">$${d.rental_psf.toFixed(1)}/sqft/yr</span></div>`;
      if (mode==='all') {
        const gap = ((d.offplan_psf - d.secondary_psf) / d.secondary_psf * 100).toFixed(1);
        html += `<div class="tt-row"><span>Off-plan premium:</span><span class="tt-val">+${gap}%</span></div>`;
      }
      showTT(html, e);
    });

  document.getElementById('smooth-slider').addEventListener('input', () => update(false));
  document.querySelectorAll('#metric-toggle button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#metric-toggle button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update(false);
    });
  });

  update(true);
}

// ═══════════════════════════════════════════════
// CHART 2: PROPERTY TYPE (HORIZONTAL BAR)
// Filters: sort by volume/price, min-listings threshold slider.
// ═══════════════════════════════════════════════
function buildPropType() {
  const container = document.getElementById('proptype-chart');
  const W = container.clientWidth || 400, H = 280;
  const margin = {top: 16, right: 80, bottom: 40, left: 100};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');

  function update() {
    const sortKey = document.querySelector('#proptype-sort button.active').dataset.sort;
    const minListings = +document.getElementById('proptype-min').value;
    document.getElementById('proptype-min-val').textContent = fmt(minListings);

    const data = DATA.prop_type
      .filter(d => d.count >= minListings)
      .sort((a,b) => b[sortKey] - a[sortKey]);

    const y = d3.scaleBand().domain(data.map(d => d.property_type)).range([0, ih]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(DATA.prop_type, d => d[sortKey]) * 1.1 || 1]).range([0, iw]);

    g.selectAll('.grid-pt').remove();
    g.insert('g', ':first-child').attr('class','grid-pt')
      .call(d3.axisBottom(x).ticks(4).tickSize(ih).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-pt .domain').remove();

    yAxisG.transition().duration(400).call(d3.axisLeft(y))
      .selectAll('text').style('fill','var(--text-2)').style('font-size','12px');
    yAxisG.select('.domain').remove();
    xAxisG.transition().duration(400)
      .call(d3.axisBottom(x).ticks(4).tickFormat(sortKey==='median_price' ? d=>'$'+fmtK(d) : fmtK))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    xAxisG.select('.domain').remove();

    const bars = g.selectAll('.bar').data(data, d => d.property_type);
    bars.exit().transition().duration(250).attr('width', 0).remove();

    bars.enter().append('rect').attr('class','bar')
      .attr('y', d => y(d.property_type)).attr('height', y.bandwidth()).attr('rx',3)
      .attr('x', 0).attr('width', 0)
      .attr('fill', (d,i) => d3.interpolateBlues(0.4 + (i / data.length) * 0.5))
      .on('mouseover', function(e, d) {
        dimOthers('#proptype-chart .bar', this);
        showTT(`<div class="tt-title">${d.property_type}</div>
          <div class="tt-row"><span>Volume:</span><span class="tt-val">${fmt(d.count)}</span></div>
          <div class="tt-row"><span>Median Price:</span><span class="tt-val">$${fmt(d.median_price)}</span></div>`, e);
      })
      .on('mouseout', () => { restoreOpacity('#proptype-chart .bar'); hideTT(); })
      .merge(bars)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr('y', d => y(d.property_type)).attr('height', y.bandwidth())
      .attr('fill', (d,i) => d3.interpolateBlues(0.4 + (i / data.length) * 0.5))
      .attr('width', d => x(d[sortKey]));

    g.selectAll('.bar-label').remove();
    g.selectAll('.bar-label').data(data).enter().append('text')
      .attr('class','bar-label')
      .attr('y', d => y(d.property_type) + y.bandwidth()/2 + 4)
      .attr('x', d => x(d[sortKey]) + 6)
      .style('fill','var(--text-3)').style('font-size','11px')
      .text(d => sortKey==='median_price' ? '$'+fmtK(d.median_price) : fmtK(d.count));
  }

  document.querySelectorAll('#proptype-sort button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#proptype-sort button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  document.getElementById('proptype-min').addEventListener('input', update);
  update();
}

// ═══════════════════════════════════════════════
// CHART 3: VIEW PREMIUM (LOLLIPOP CHART)
// Filters: highlight premium views toggle, sort by price/listings.
// ═══════════════════════════════════════════════
function buildViewChart() {
  const container = document.getElementById('view-chart');
  const W = container.clientWidth || 400, H = 280;
  const margin = {top: 16, right: 30, bottom: 40, left: 94};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');
  const premiumViews = ['Sea','Marina','Burj Khalifa'];

  function update() {
    const sortKey = document.querySelector('#view-sort button.active').dataset.sort;
    const highlight = document.querySelector('#view-highlight button.active').dataset.h;
    const colorOf = d => (highlight === 'premium' && premiumViews.includes(d.view)) ? 'var(--teal)' : 'var(--text-3)';

    const data = [...DATA.view_price].sort((a,b) => b[sortKey] - a[sortKey]);

    const y = d3.scaleBand().domain(data.map(d => d.view)).range([0, ih]).padding(0.4);
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d[sortKey])*1.12]).range([0, iw]);

    g.selectAll('.grid-vw').remove();
    g.insert('g',':first-child').attr('class','grid-vw')
      .call(d3.axisBottom(x).ticks(4).tickSize(ih).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-vw .domain').remove();

    yAxisG.transition().duration(400).call(d3.axisLeft(y)).selectAll('text').style('fill','var(--text-2)').style('font-size','12px');
    yAxisG.select('.domain').remove();
    xAxisG.transition().duration(400)
      .call(d3.axisBottom(x).ticks(4).tickFormat(sortKey==='count' ? fmtK : d => '$'+d))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    xAxisG.select('.domain').remove();

    const stems = g.selectAll('.stem').data(data, d => d.view);
    stems.exit().remove();
    stems.enter().append('line').attr('class','stem')
      .attr('y1', d => y(d.view) + y.bandwidth()/2).attr('y2', d => y(d.view) + y.bandwidth()/2)
      .attr('x1', 0).attr('x2', 0).attr('stroke-width', 2).attr('opacity', 0.5)
      .merge(stems)
      .attr('y1', d => y(d.view) + y.bandwidth()/2).attr('y2', d => y(d.view) + y.bandwidth()/2)
      .attr('stroke', colorOf)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr('x2', d => x(d[sortKey]));

    const dots = g.selectAll('.dot').data(data, d => d.view);
    dots.exit().remove();
    dots.enter().append('circle').attr('class','dot')
      .attr('cy', d => y(d.view) + y.bandwidth()/2).attr('cx', 0).attr('r', 0)
      .attr('stroke','var(--bg-2)').attr('stroke-width',2)
      .on('mouseover', function(e, d) {
        dimOthers('#view-chart .dot', this);
        d3.select(this).attr('r', 8);
        showTT(`<div class="tt-title">${d.view} View</div>
          <div class="tt-row"><span>Price/sqft:</span><span class="tt-val" style="color:var(--teal)">$${fmt(d.median_psf)}</span></div>
          <div class="tt-row"><span>Listings:</span><span class="tt-val">${fmt(d.count)}</span></div>`, e);
      })
      .on('mouseout', function() {
        restoreOpacity('#view-chart .dot');
        d3.select(this).attr('r', 6);
        hideTT();
      })
      .merge(dots)
      .attr('cy', d => y(d.view) + y.bandwidth()/2)
      .attr('fill', colorOf)
      .transition().duration(500).ease(d3.easeBackOut)
      .attr('cx', d => x(d[sortKey])).attr('r', 6);
  }

  document.querySelectorAll('#view-sort button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#view-sort button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  document.querySelectorAll('#view-highlight button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#view-highlight button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 4: BOX PLOT (PRICE BY BEDROOMS)
// Filters: metric toggle (price/sqft vs estimated total price assuming
// ~900 sqft average unit), minimum sample-size slider.
// ═══════════════════════════════════════════════
function buildBedroom() {
  const container = document.getElementById('bedroom-chart');
  const W = container.clientWidth || 800, H = 280;
  const margin = {top: 24, right: 30, bottom: 40, left: 70};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');

  // Rough sqft multiplier per bedroom count used only to illustrate the
  // "Est. Total Price" toggle — not a real-world conversion factor.
  const SQFT_BY_BED = {0: 450, 1: 750, 2: 1100, 3: 1500, 4: 2200};

  function update() {
    const metric = document.querySelector('#bedroom-metric button.active').dataset.metric;
    const minN = +document.getElementById('bedroom-min').value;
    document.getElementById('bedroom-min-val').textContent = fmt(minN);

    const mult = metric === 'total' ? 1 : 0; // flag, see below
    const data = DATA.bed_price
      .filter(d => d.count >= minN)
      .map(d => {
        if (metric === 'psf') return d;
        const sqft = SQFT_BY_BED[d.bedrooms] || 1000;
        return {...d, q1: Math.round(d.q1*sqft), median: Math.round(d.median*sqft), q3: Math.round(d.q3*sqft)};
      });

    const x = d3.scaleBand().domain(data.map(d => d.label)).range([0, iw]).padding(0.35);
    const y = d3.scaleLinear().domain([0, (d3.max(data, d => d.q3)||1)*1.18]).range([ih, 0]);

    g.selectAll('.grid-bp').remove();
    g.insert('g',':first-child').attr('class','grid-bp').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-bp .domain').remove();

    xAxisG.transition().duration(400).call(d3.axisBottom(x))
      .selectAll('text').style('fill','var(--text-2)').style('font-size','13px');
    yAxisG.transition().duration(400)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => metric==='total' ? '$'+fmtK(d) : '$'+d))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

    g.selectAll('.boxG').remove();
    const groups = g.selectAll('.boxG').data(data, d => d.label).enter().append('g').attr('class','boxG');
    const bw = x.bandwidth();

    groups.append('line')
      .attr('x1', d => x(d.label) + bw/2).attr('x2', d => x(d.label) + bw/2)
      .attr('y1', d => y(d.median)).attr('y2', d => y(d.median))
      .attr('stroke','var(--text-3)').attr('stroke-width',1.5)
      .transition().duration(600).ease(d3.easeBackOut)
      .attr('y1', d => y(d.q1)).attr('y2', d => y(d.q3));

    groups.append('rect').attr('class','box')
      .attr('x', d => x(d.label)).attr('width', bw).attr('rx',4)
      .attr('y', d => y(d.median)).attr('height', 0)
      .attr('fill','rgba(59,130,246,0.15)').attr('stroke','var(--blue)').attr('stroke-width',1.5)
      .transition().duration(600).ease(d3.easeBackOut)
      .attr('y', d => y(d.q3)).attr('height', d => y(d.q1)-y(d.q3));

    groups.append('line').attr('class','med')
      .attr('x1', d => x(d.label)).attr('x2', d => x(d.label) + bw)
      .attr('y1', d => y(d.median)).attr('y2', d => y(d.median))
      .attr('stroke','var(--blue)').attr('stroke-width',2.5)
      .attr('opacity',0).transition().delay(400).duration(250).attr('opacity',1);

    groups.append('text')
      .attr('x', d => x(d.label) + bw/2).attr('y', d => y(d.median) - 8)
      .attr('text-anchor','middle').style('fill','var(--blue)').style('font-size','11px').style('font-weight','600')
      .text(d => metric==='total' ? '$'+fmtK(d.median) : '$'+d.median).style('opacity',0)
      .transition().delay(550).duration(250).style('opacity',1);

    groups.append('text')
      .attr('x', d => x(d.label) + bw/2).attr('y', ih + 32)
      .attr('text-anchor','middle').style('fill','var(--text-3)').style('font-size','10px')
      .text(d => 'n='+fmtK(d.count));

    groups.append('rect')
      .attr('x', d => x(d.label) - 4).attr('y', d => y(d.q3)).attr('rx',4)
      .attr('width', bw + 8).attr('height', d => y(d.q1)-y(d.q3))
      .attr('fill','transparent').attr('cursor','pointer')
      .on('mouseover', function(e, d) {
        dimOthers('.boxG', this.parentNode);
        d3.select(this.parentNode).select('.box').attr('fill','rgba(59,130,246,0.3)');
        const unit = metric==='total' ? '' : '/sqft';
        showTT(`<div class="tt-title">${d.label} — Price Distribution</div>
          <div class="tt-row"><span>Q3 (75th pct):</span><span class="tt-val">$${fmt(d.q3)}${unit}</span></div>
          <div class="tt-row"><span>Median:</span><span class="tt-val" style="color:var(--blue)">$${fmt(d.median)}${unit}</span></div>
          <div class="tt-row"><span>Q1 (25th pct):</span><span class="tt-val">$${fmt(d.q1)}${unit}</span></div>
          <div class="tt-row"><span>IQR spread:</span><span class="tt-val">$${fmt(d.q3-d.q1)}</span></div>
          <div class="tt-row"><span>Listings:</span><span class="tt-val">${fmt(d.count)}</span></div>`, e);
      })
      .on('mouseout', function() {
        restoreOpacity('.boxG');
        d3.select(this.parentNode).select('.box').attr('fill','rgba(59,130,246,0.15)');
        hideTT();
      });
  }

  document.querySelectorAll('#bedroom-metric button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#bedroom-metric button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  document.getElementById('bedroom-min').addEventListener('input', update);
  update();
}

// ═══════════════════════════════════════════════
// CHART 5: COMMUNITY RANKING
// Filters: sort by price/volume, show top N.
// ═══════════════════════════════════════════════
function buildCommunity() {
  const container = document.getElementById('community-chart');
  const W = container.clientWidth || 400, H = 380;
  const margin = {top: 10, right: 50, bottom: 20, left: 150};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const yAxisG = g.append('g');
  const xAxisG = g.append('g').attr('transform', `translate(0,${ih})`);

  function update() {
    const sortBy = document.querySelector('#community-sort button.active').dataset.sort;
    const top = +document.getElementById('community-top').value;
    const sortKey = sortBy === 'price' ? 'median_psf' : 'n_listings';
    const data = [...DATA.community_map].sort((a,b) => b[sortKey] - a[sortKey]).slice(0, top);

    const y = d3.scaleBand().domain(data.map(d => d.community)).range([0, ih]).padding(0.28);
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d[sortKey])*1.12]).range([0, iw]);
    const colorScale = d3.scaleSequential(sortBy === 'price' ? d3.interpolateBlues : d3.interpolateGreens)
      .domain([0, d3.max(data, d => d[sortKey])]);

    yAxisG.transition().duration(600).call(d3.axisLeft(y))
      .selectAll('text').style('fill','var(--text-2)').style('font-size','11px');
    yAxisG.select('.domain').remove();
    xAxisG.transition().duration(600)
      .call(d3.axisBottom(x).ticks(4).tickFormat(sortBy==='price' ? d=>'$'+d : fmtK))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    xAxisG.select('.domain').remove();

    g.selectAll('.grid-rank').remove();
    g.insert('g',':first-child').attr('class','grid-rank')
      .call(d3.axisBottom(x).ticks(4).tickSize(ih).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-rank .domain').remove();

    const bars = g.selectAll('.bar').data(data, d => d.community);
    bars.enter().append('rect').attr('class','bar')
      .attr('y', d => y(d.community)).attr('height', y.bandwidth()).attr('rx',3)
      .attr('x', 0).attr('width', 0)
      .attr('fill', d => colorScale(d[sortKey]))
      .on('mouseover', function(e, d) {
        dimOthers('#community-chart .bar', this);
        showTT(`<div class="tt-title">${d.community}</div>
          <div class="tt-row"><span>Price/sqft:</span><span class="tt-val">$${fmt(d.median_psf)}</span></div>
          <div class="tt-row"><span>Listings:</span><span class="tt-val">${fmt(d.n_listings)}</span></div>`, e);
      })
      .on('mouseout', () => { restoreOpacity('#community-chart .bar'); hideTT(); })
      .merge(bars).transition().duration(700).ease(d3.easeCubicOut)
      .attr('y', d => y(d.community)).attr('height', y.bandwidth())
      .attr('fill', d => colorScale(d[sortKey]))
      .attr('width', d => x(d[sortKey]));

    bars.exit().transition().duration(300).attr('width',0).remove();

    g.selectAll('.rank-label').remove();
    g.selectAll('.rank-label').data(data).enter().append('text')
      .attr('class','rank-label')
      .attr('y', d => y(d.community) + y.bandwidth()/2 + 4)
      .attr('x', d => x(d[sortKey]) + 4)
      .style('fill','var(--text-3)').style('font-size','10px')
      .text(d => sortBy==='price' ? '$'+d.median_psf : fmtK(d.n_listings));
  }

  document.querySelectorAll('#community-sort button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#community-sort button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  document.getElementById('community-top').addEventListener('change', update);
  update();
}

// ═══════════════════════════════════════════════
// CHART 6: FREEHOLD VS NON-FREEHOLD (AREA CHART)
// Filters: global year-range (header) + local view toggle
// (both lines vs gap-only).
// ═══════════════════════════════════════════════
function buildFreehold() {
  const container = document.getElementById('freehold-chart');
  const W = container.clientWidth || 400, H = 320;
  const margin = {top: 20, right: 30, bottom: 40, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id','clip-fh').append('rect').attr('width',iw).attr('height',ih);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  let parsed = getFilteredTrend().map((d, i) => ({
    ...d,
    freehold:     d.secondary_psf * 1.22 + FREEHOLD_DATA[i % FREEHOLD_DATA.length].freehold - FREEHOLD_DATA[i % FREEHOLD_DATA.length].secondary_psf * 1.22,
    non_freehold: d.secondary_psf * 0.81 + FREEHOLD_DATA[i % FREEHOLD_DATA.length].non_freehold - FREEHOLD_DATA[i % FREEHOLD_DATA.length].secondary_psf * 0.81
  }));

  const x = d3.scaleTime().domain(d3.extent(parsed, d => d.date)).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(parsed, d => Math.max(d.freehold, d.non_freehold))*1.1]).range([ih, 0]);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).ticks(5))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+d))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

  const areaGap = d3.area().x(d => x(d.date))
    .y0(d => y(d.non_freehold)).y1(d => y(d.freehold)).curve(d3.curveMonotoneX);

  const pg = g.append('g').attr('clip-path','url(#clip-fh)');
  const gapPath = pg.append('path').datum(parsed).attr('fill','rgba(59,130,246,0.1)').attr('d', areaGap)
    .style('opacity',0).transition().duration(1500).style('opacity',1);

  const lineF = d3.line().x(d => x(d.date)).y(d => y(d.freehold)).curve(d3.curveMonotoneX);
  const lineN = d3.line().x(d => x(d.date)).y(d => y(d.non_freehold)).curve(d3.curveMonotoneX);

  const linePaths = [];
  [['var(--blue)', lineF, 'freehold'], ['var(--teal)', lineN, 'non_freehold']].forEach(([color, lineGen, key], idx) => {
    const p = pg.append('path').datum(parsed).attr('fill','none').attr('stroke',color).attr('stroke-width',2).attr('d', lineGen);
    linePaths.push(p);
    const len = p.node().getTotalLength();
    p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
      .transition().duration(1800).delay(idx*300).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);
  });

  const leg = g.append('g').attr('transform',`translate(4, 4)`);
  const legItems = [];
  [{c:'var(--blue)',t:'Freehold'},{c:'var(--teal)',t:'Non-Freehold'}].forEach(({c,t},i) => {
    const r = leg.append('rect').attr('x',0).attr('y',i*18).attr('width',16).attr('height',3).attr('rx',1).attr('fill',c);
    const tx = leg.append('text').attr('x',22).attr('y',i*18+4).text(t).style('fill','var(--text-2)').style('font-size','12px');
    legItems.push(r, tx);
  });

  function applyViewFilter() {
    const view = document.querySelector('#freehold-view button.active').dataset.view;
    const showLines = view === 'both';
    linePaths.forEach(p => p.style('opacity', showLines ? 1 : 0));
    legItems.forEach(el => el.style('opacity', showLines ? 1 : 0));
    gapPath.style('fill', showLines ? 'rgba(59,130,246,0.1)' : 'rgba(244,63,94,0.22)');
  }

  document.querySelectorAll('#freehold-view button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#freehold-view button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); applyViewFilter();
    });
  });
  applyViewFilter();
}

// ═══════════════════════════════════════════════
// CHART 7: SCATTER (Metro distance vs rent) with BRUSH
// Filters: brush-select (existing), bubble-size toggle
// (by listings vs equal), minimum price/sqft slider.
// ═══════════════════════════════════════════════
function buildScatter() {
  const container = document.getElementById('scatter-chart');
  document.getElementById('scatter-info').style.display = 'block';

  const W = container.clientWidth || 800, H = 340;
  const margin = {top: 20, right: 30, bottom: 50, left: 65};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const allData = SCATTER_DATA;
  const x = d3.scaleLinear().domain([0, d3.max(allData, d => d.metro_dist)*1.05]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(allData, d => d.annual_rent)*1.08]).range([ih, 0]);
  const r = d3.scaleSqrt().domain([0, d3.max(allData, d => d.n_listings)]).range([3, 12]);
  const colorScale = d3.scaleSequential(d3.interpolatePlasma).domain([0, d3.max(allData, d => d.median_psf)]);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d.toFixed(0)+' min'))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+fmtK(d)))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

  g.append('text').attr('x',iw/2).attr('y',ih+42).attr('text-anchor','middle')
    .style('fill','var(--text-3)').style('font-size','12px').text('Walk Distance to Nearest Metro (minutes)');
  g.append('text').attr('transform','rotate(-90)').attr('x',-ih/2).attr('y',-48).attr('text-anchor','middle')
    .style('fill','var(--text-3)').style('font-size','12px').text('Annual Rent (USD)');

  const dotLayer = g.append('g').attr('class','dot-layer');
  const trendLayer = g.append('g');
  const brushLayer = g.append('g').attr('class','brush');

  function update() {
    const sizeMode = document.querySelector('#scatter-size-toggle button.active').dataset.size;
    const minPrice = +document.getElementById('scatter-price-min').value;
    document.getElementById('scatter-price-min-val').textContent = '$' + fmt(minPrice);

    const data = allData.filter(d => d.median_psf >= minPrice);

    const dots = dotLayer.selectAll('.sdot').data(data, d => d.community);
    dots.exit().transition().duration(300).attr('r', 0).remove();

    dots.enter().append('circle')
      .attr('class','sdot')
      .attr('cx', d => x(d.metro_dist)).attr('cy', d => y(d.annual_rent))
      .attr('r', 0).attr('fill', d => colorScale(d.median_psf))
      .attr('stroke','rgba(255,255,255,0.15)').attr('stroke-width',1)
      .attr('cursor','pointer')
      .on('mouseover', function(e, d) {
        d3.select(this).attr('stroke','white').attr('stroke-width',2).raise();
        showTT(`<div class="tt-title">${d.community}</div>
          <div class="tt-row"><span>Annual Rent:</span><span class="tt-val">$${fmt(Math.round(d.annual_rent))}</span></div>
          <div class="tt-row"><span>Metro distance:</span><span class="tt-val">${d.metro_dist.toFixed(1)} min walk</span></div>
          <div class="tt-row"><span>Price/sqft:</span><span class="tt-val">$${d.median_psf}</span></div>
          <div class="tt-row"><span>Listings:</span><span class="tt-val">${fmt(d.n_listings)}</span></div>`, e);
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke','rgba(255,255,255,0.15)').attr('stroke-width',1);
        hideTT();
      })
      .merge(dots)
      .transition().duration(600).ease(d3.easeBackOut)
      .attr('cx', d => x(d.metro_dist)).attr('cy', d => y(d.annual_rent))
      .attr('fill', d => colorScale(d.median_psf))
      .attr('r', d => sizeMode === 'equal' ? 6 : r(d.n_listings));

    // Regression trend line recomputed on the filtered set
    trendLayer.selectAll('*').remove();
    if (data.length > 1) {
      const n = data.length;
      const sumX = d3.sum(data, d => d.metro_dist);
      const sumY = d3.sum(data, d => d.annual_rent);
      const sumXY = d3.sum(data, d => d.metro_dist * d.annual_rent);
      const sumX2 = d3.sum(data, d => d.metro_dist * d.metro_dist);
      const denom = (n * sumX2 - sumX * sumX);
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        const x0v = d3.min(data, d => d.metro_dist), x1v = d3.max(data, d => d.metro_dist);
        trendLayer.append('line')
          .attr('x1', x(x0v)).attr('y1', y(slope*x0v+intercept))
          .attr('x2', x(x0v)).attr('y2', y(slope*x0v+intercept))
          .attr('stroke','rgba(139,92,246,0.6)').attr('stroke-width',1.5).attr('stroke-dasharray','5,4')
          .transition().duration(800)
          .attr('x2', x(x1v)).attr('y2', y(slope*x1v+intercept));
        trendLayer.append('text').attr('x', x(x1v) - 60).attr('y', y(slope*x1v+intercept) - 8)
          .style('fill','rgba(139,92,246,0.8)').style('font-size','10px').text('Trend')
          .style('opacity',0).transition().delay(900).duration(300).style('opacity',1);
      }
    }
  }

  const brush = d3.brush().extent([[0,0],[iw,ih]]).on('end', e => {
    if (!e.selection) {
      dotLayer.selectAll('.sdot').attr('opacity',1);
      return;
    }
    const [[x0,y0],[x1,y1]] = e.selection;
    dotLayer.selectAll('.sdot').attr('opacity', d => {
      const cx = x(d.metro_dist), cy = y(d.annual_rent);
      return (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) ? 1 : 0.1;
    });
  });
  brushLayer.call(brush);

  document.querySelectorAll('#scatter-size-toggle button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#scatter-size-toggle button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  document.getElementById('scatter-price-min').addEventListener('input', update);

  update();
}

// ═══════════════════════════════════════════════
// CHART 8: PROPORTIONAL SYMBOL MAP
// ----------------------------------------------------------------
// FIX HISTORY (bug report: "bubbles invisible on the map"):
//   Root cause: bubbles were created with r=0 and only reached their
//   real radius via a staggered entrance transition (~1s total,
//   staggered per-bubble). The mouseover/mouseout handlers used a
//   plain, non-transitioned attr('r', ...) call. In D3, calling attr()
//   on a selection interrupts any transition currently running on it —
//   so a hover landing before a bubble's entrance transition finished
//   would kill that transition before its .on('end', ...) callback
//   (the only place that recorded the bubble's "real" radius) ever
//   fired. mouseout then had no valid radius to restore to, and the
//   bubble could be left permanently invisible at r=0. This was very
//   likely to happen with ~40 staggered bubbles spread across a full
//   second — most real interactions would land mid-animation.
//
//   Fix: bubbles are now given their real, final radius immediately
//   on creation (no entrance value of 0, nothing to race against). A
//   purely decorative pop-in is layered on top using a CSS transform
//   scale(), which is entirely independent of the `r` attribute, so a
//   hover landing mid-animation cannot corrupt anything. resize() also
//   writes its cached radius synchronously rather than waiting for a
//   transition's .on('end', ...), for the same reason.
//
//   Secondary fix: the container width is also read defensively after
//   the view's display:block has been committed (showView() waits two
//   animation frames before building geography charts), since reading
//   clientWidth too early could yield 0 and break the map projection.
//
// Filters: color-by (price/volume) toggle, size-by (volume/equal)
// toggle, metro-lines visibility checkbox.
// ═══════════════════════════════════════════════
function buildMap() {
  const mapSvg = document.getElementById('map-svg');
  const cont = document.getElementById('map-container');
  const W = cont.clientWidth || 800, H = cont.clientHeight || 520;

  const svg = d3.select(mapSvg).attr('width', W).attr('height', H)
    .attr('viewBox', `0 0 ${W} ${H}`);

  const projection = d3.geoMercator().center([55.24, 25.12]).scale(145000).translate([W/2, H/2]);
  const g = svg.append('g').attr('class','map-root');

  const graticule = d3.geoGraticule().step([0.05, 0.05]);
  const path = d3.geoPath().projection(projection);
  g.append('path').datum(graticule()).attr('fill','none').attr('stroke','rgba(255,255,255,0.04)').attr('stroke-width',0.5).attr('d', path);

  const psfExtent = [127, 2250];
  const colorScalePrice = d3.scaleSequential(d3.interpolateYlOrRd).domain(psfExtent);
  const colorScaleVol   = d3.scaleSequential(d3.interpolatePuBuGn).domain([0, d3.max(DATA.community_map, d => d.n_listings)]);
  const rScale = d3.scaleSqrt().domain([0, d3.max(DATA.community_map, d => d.n_listings)]).range([4, 20]);

  const metroLayer = g.append('g').attr('class','metro-layer');
  const lineGen = d3.line().x(d => projection([d.lon, d.lat])[0]).y(d => projection([d.lon, d.lat])[1]);

  [['Red','#EF4444'],['Green','#22C55E']].forEach(([line, color]) => {
    const pts = DATA.metro.filter(d => d.line === line);
    metroLayer.append('path').datum(pts).attr('fill','none').attr('stroke',color).attr('stroke-width',3).attr('stroke-opacity',0.7).attr('d', lineGen);
  });

  metroLayer.selectAll('.station').data(DATA.metro).enter().append('circle')
    .attr('class','station')
    .attr('cx', d => projection([d.lon, d.lat])[0])
    .attr('cy', d => projection([d.lon, d.lat])[1])
    .attr('r', 4).attr('fill','white').attr('stroke','#1E2235').attr('stroke-width',2)
    .on('mouseover', (e,d) => showTT(`<div class="tt-title">${d.station_name}</div><div class="tt-row"><span>Line:</span><span class="tt-val">${d.line}</span></div>`, e))
    .on('mouseout', hideTT);

  const bubbleLayer = g.append('g').attr('class','bubble-layer');
  const bubbles = bubbleLayer.selectAll('.bubble').data(DATA.community_map).enter().append('circle')
    .attr('class','bubble')
    .attr('cx', d => projection([d.lon, d.lat])[0])
    .attr('cy', d => projection([d.lon, d.lat])[1])
    // Radius is set to its real, final value immediately (not 0) and the
    // current value is also cached on data-r right away. This is the key
    // fix: previously bubbles started at r=0 and only reached their real
    // size via a staggered transition that ran ~1s after page load. If
    // the user moved the mouse over the map before that transition
    // finished, mouseover's plain attr('r', ...) call would *interrupt*
    // the in-flight transition (calling .attr() on a selection cancels
    // any transition running on it), so the bubble's .on('end', ...)
    // callback — the only place that ever wrote data-r — never fired.
    // mouseout then fell back to a "last known good" radius that had
    // never actually been recorded, and the bubble could be left at
    // r=0 permanently. Setting the real radius up front removes the
    // race entirely: there is nothing left to interrupt.
    .attr('r', d => rScale(d.n_listings))
    .attr('data-r', d => rScale(d.n_listings))
    .attr('stroke','rgba(255,255,255,0.2)').attr('stroke-width',0.8).attr('cursor','pointer')
    .on('mouseover', function(e, d) {
      dimOthers('.bubble', this);
      const targetR = +d3.select(this).attr('data-r');
      d3.select(this).attr('stroke','white').attr('stroke-width',2).attr('r', targetR*1.3).raise();
      showTT(`<div class="tt-title">${d.community}</div>
        <div class="tt-row"><span>Price/sqft:</span><span class="tt-val">$${fmt(d.median_psf)}</span></div>
        <div class="tt-row"><span>Listings:</span><span class="tt-val">${fmt(d.n_listings)}</span></div>`, e);
    })
    .on('mouseout', function(e, d) {
      restoreOpacity('.bubble');
      const targetR = +d3.select(this).attr('data-r');
      d3.select(this).attr('stroke','rgba(255,255,255,0.2)').attr('stroke-width',0.8).attr('r', targetR);
      hideTT();
    });

  // Purely decorative pop-in, applied on top of the already-correct
  // radius above. Uses a separate, non-interruptible-by-hover approach:
  // animate from the current (already correct) radius via a transform
  // scale on a wrapper instead of touching the r attribute itself, so
  // even if a hover lands mid-animation there is no race on `r`.
  bubbles.each(function() {
    d3.select(this)
      .style('transform-origin', 'center')
      .style('transform', 'scale(0)')
      .transition().delay(() => Math.random()*400).duration(700).ease(d3.easeBackOut)
      .style('transform', 'scale(1)');
  });

  const top5 = [...DATA.community_map].sort((a,b) => b.median_psf - a.median_psf).slice(0,5);
  g.append('g').attr('class','label-layer').selectAll('.map-label').data(top5).enter().append('text')
    .attr('class','map-label')
    .attr('x', d => projection([d.lon, d.lat])[0] + rScale(d.n_listings) + 4)
    .attr('y', d => projection([d.lon, d.lat])[1] + 4)
    .style('fill','rgba(255,255,255,0.7)').style('font-size','9px').style('pointer-events','none')
    .text(d => d.community.length > 14 ? d.community.slice(0,14)+'…' : d.community);

  /**
   * Recolors bubbles and toggles metro visibility based on the current
   * filter state. Does not touch the `r` attribute — only resize()
   * (triggered by the size-scale toggle) changes radius.
   */
  function recolor() {
    const colorBy = document.querySelector('#map-color-toggle button.active').dataset.col;
    const colorFn = colorBy === 'price' ? d => colorScalePrice(d.median_psf) : d => colorScaleVol(d.n_listings);
    bubbles.transition().duration(400).attr('fill', colorFn);
    metroLayer.style('display', document.getElementById('show-metro').checked ? 'block' : 'none');

    const canvas = document.getElementById('map-legend-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 120; canvas.height = 8;
    const colorFnLegend = colorBy === 'price'
      ? t => colorScalePrice(psfExtent[0] + t*(psfExtent[1]-psfExtent[0]))
      : t => colorScaleVol(t * d3.max(DATA.community_map, d => d.n_listings));
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = colorFnLegend(i/119);
      ctx.fillRect(i, 0, 1, 8);
    }
    document.getElementById('map-legend-title').textContent = colorBy === 'price' ? 'Price/sqft' : 'Volume';
    document.getElementById('map-legend-min').textContent = colorBy === 'price' ? '$127' : '595';
    document.getElementById('map-legend-max').textContent = colorBy === 'price' ? '$2,250' : '653';
  }

  /** Re-applies the size-by toggle. data-r is updated synchronously
   *  (not inside a transition .on('end', ...)) so a hover landing
   *  mid-transition can never read a stale target radius — even if
   *  the hover's plain attr('r', ...) call interrupts this transition
   *  before it visually finishes. */
  function resize() {
    const useSizeByVolume = document.querySelector('#map-size-toggle button.active').dataset.size === 'volume';
    bubbles.each(function(d) {
      const target = useSizeByVolume ? rScale(d.n_listings) : 8;
      d3.select(this).attr('data-r', target);
    });
    bubbles.transition().duration(500).ease(d3.easeCubicOut)
      .attr('r', d => useSizeByVolume ? rScale(d.n_listings) : 8);
  }

  document.querySelectorAll('#map-color-toggle button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#map-color-toggle button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); recolor();
    });
  });
  document.getElementById('show-metro').addEventListener('change', recolor);
  document.querySelectorAll('#map-size-toggle button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#map-size-toggle button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); resize();
    });
  });

  const zoom = d3.zoom().scaleExtent([0.5, 10]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  recolor();

  // Keep the map correctly sized if the window/container is resized
  // (e.g. user resizes the browser, or toggles a sidebar) — re-reads
  // clientWidth/clientHeight rather than relying on a stale snapshot.
  // Debounced and disconnects itself before rebuilding so the rebuild's
  // own layout pass can never re-trigger this same observer.
  let resizeTimer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newW = cont.clientWidth, newH = cont.clientHeight;
      if (newW > 0 && newH > 0 && (newW !== W || newH !== H)) {
        ro.disconnect();
        mapSvg.innerHTML = '';
        buildMap();
      }
    }, 200);
  });
  ro.observe(cont);
}

// ═══════════════════════════════════════════════
// CHART 9: METRO DISTANCE VS RENT
// Filters: sort bins by distance order or by rent (descending).
// ═══════════════════════════════════════════════
function buildMetroChart() {
  const container = document.getElementById('metro-chart');
  const W = container.clientWidth || 800, H = 220;
  const margin = {top: 20, right: 30, bottom: 50, left: 80};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain([d3.min(DATA.rent_metro,d=>d.annual_rent), d3.max(DATA.rent_metro,d=>d.annual_rent)]);

  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');

  function update() {
    const sortBy = document.querySelector('#metro-sort button.active').dataset.sort;
    const data = sortBy === 'bin'
      ? [...DATA.rent_metro]
      : [...DATA.rent_metro].sort((a,b) => b.annual_rent - a.annual_rent);

    const x = d3.scaleBand().domain(data.map(d => d.bin)).range([0, iw]).padding(0.28);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.annual_rent)*1.12]).range([ih, 0]);

    g.selectAll('.grid-mc').remove();
    g.insert('g',':first-child').attr('class','grid-mc').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-mc .domain').remove();

    xAxisG.transition().duration(400).call(d3.axisBottom(x))
      .selectAll('text').style('fill','var(--text-2)').style('font-size','12px').attr('transform','rotate(-15)').style('text-anchor','end');
    xAxisG.select('.domain').remove();
    yAxisG.transition().duration(400).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+fmtK(d)))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    yAxisG.select('.domain').remove();

    const bars = g.selectAll('.bar').data(data, d => d.bin);
    bars.enter().append('rect').attr('class','bar')
      .attr('x', d => x(d.bin)).attr('width', x.bandwidth()).attr('rx',4)
      .attr('y', ih).attr('height', 0).attr('fill', d => colorScale(d.annual_rent))
      .on('mouseover', function(e, d) {
        dimOthers('#metro-chart .bar', this);
        showTT(`<div class="tt-title">Metro Distance: ${d.bin}</div>
          <div class="tt-row"><span>Median Annual Rent:</span><span class="tt-val">$${fmt(d.annual_rent)}</span></div>
          <div class="tt-row"><span>Listings in bin:</span><span class="tt-val">${fmt(d.count)}</span></div>`, e);
      })
      .on('mouseout', () => { restoreOpacity('#metro-chart .bar'); hideTT(); })
      .merge(bars).transition().duration(600).ease(d3.easeCubicOut)
      .attr('x', d => x(d.bin)).attr('width', x.bandwidth())
      .attr('y', d => y(d.annual_rent)).attr('height', d => ih - y(d.annual_rent))
      .attr('fill', d => colorScale(d.annual_rent));

    g.selectAll('.metro-label').remove();
    g.selectAll('.metro-label').data(data).enter().append('text')
      .attr('class','metro-label')
      .attr('x', d => x(d.bin) + x.bandwidth()/2).attr('y', d => y(d.annual_rent) - 6)
      .attr('text-anchor','middle').style('fill','var(--text-2)').style('font-size','11px')
      .text(d => '$'+fmtK(d.annual_rent));
  }

  document.querySelectorAll('#metro-sort button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#metro-sort button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 10: PIPELINE (BAR + LINE OVERLAY)
// Filters: handover year-range dropdowns.
// ═══════════════════════════════════════════════
function buildPipeline() {
  const container = document.getElementById('pipeline-chart');
  const W = container.clientWidth || 400, H = 240;
  const margin = {top: 20, right: 50, bottom: 40, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');
  const yAxisRG = g.append('g').attr('transform',`translate(${iw},0)`);
  const colorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, DATA.off_by_year.length + 1]);

  function update() {
    const from = +document.getElementById('pipeline-from').value;
    const to   = +document.getElementById('pipeline-to').value;
    const data = DATA.off_by_year.filter(d => d.handover_year >= from && d.handover_year <= to);

    const x  = d3.scaleBand().domain(data.map(d => d.handover_year)).range([0, iw]).padding(0.3);
    const y  = d3.scaleLinear().domain([0, (d3.max(data, d => d.count)||1)*1.2]).range([ih, 0]);
    const y2 = d3.scaleLinear().domain([0, (d3.max(data, d => d.median_psf)||1)*1.1]).range([ih, 0]);

    g.selectAll('.grid-pl').remove();
    g.insert('g',':first-child').attr('class','grid-pl').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-pl .domain').remove();

    xAxisG.transition().duration(400).call(d3.axisBottom(x)).selectAll('text').style('fill','var(--text-2)').style('font-size','12px');
    yAxisG.transition().duration(400).call(d3.axisLeft(y).ticks(4).tickFormat(fmtK)).selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    yAxisRG.transition().duration(400).call(d3.axisRight(y2).ticks(4).tickFormat(d => '$'+d)).selectAll('text').style('fill','var(--teal)').style('font-size','11px');

    const bars = g.selectAll('.bar').data(data, d => d.handover_year);
    bars.exit().transition().duration(250).attr('height',0).attr('y', ih).remove();
    bars.enter().append('rect').attr('class','bar')
      .attr('x', d => x(d.handover_year)).attr('width', x.bandwidth()).attr('rx',4)
      .attr('y', ih).attr('height', 0).attr('fill', (d,i) => colorScale(i + 0.5))
      .on('mouseover', function(e, d) {
        dimOthers('#pipeline-chart .bar', this);
        showTT(`<div class="tt-title">Handover ${d.handover_year}</div>
          <div class="tt-row"><span>Units:</span><span class="tt-val">${fmt(d.count)}</span></div>
          <div class="tt-row"><span>Median PSF:</span><span class="tt-val">$${d.median_psf}</span></div>`, e);
      })
      .on('mouseout', () => { restoreOpacity('#pipeline-chart .bar'); hideTT(); })
      .merge(bars).transition().duration(600).ease(d3.easeCubicOut)
      .attr('x', d => x(d.handover_year)).attr('width', x.bandwidth())
      .attr('y', d => y(d.count)).attr('height', d => ih - y(d.count));

    g.selectAll('.psf-path').remove();
    g.selectAll('.psf-dot').remove();
    if (data.length > 1) {
      const lineP = d3.line().x(d => x(d.handover_year) + x.bandwidth()/2).y(d => y2(d.median_psf)).curve(d3.curveMonotoneX);
      const psfPath = g.append('path').attr('class','psf-path').datum(data).attr('fill','none').attr('stroke','var(--teal)').attr('stroke-width',2.5).attr('d', lineP);
      const len = psfPath.node().getTotalLength();
      psfPath.attr('stroke-dasharray',`${len} ${len}`).attr('stroke-dashoffset',len)
        .transition().duration(900).ease(d3.easeCubicInOut).attr('stroke-dashoffset',0);

      g.selectAll('.psf-dot').data(data).enter().append('circle').attr('class','psf-dot')
        .attr('cx', d => x(d.handover_year)+x.bandwidth()/2).attr('cy', d => y2(d.median_psf))
        .attr('r', 4).attr('fill','var(--teal)').attr('stroke','var(--bg-2)').attr('stroke-width',2)
        .style('opacity',0).transition().delay(900).duration(300).style('opacity',1);
    }
  }

  const leg = g.append('g').attr('transform',`translate(4,4)`);
  leg.append('rect').attr('x',0).attr('y',0).attr('width',12).attr('height',3).attr('rx',1).attr('fill','var(--teal)');
  leg.append('text').attr('x',16).attr('y',4).text('PSF (right axis)').style('fill','var(--teal)').style('font-size','10px');

  document.getElementById('pipeline-from').addEventListener('change', update);
  document.getElementById('pipeline-to').addEventListener('change', update);
  update();
}

// ═══════════════════════════════════════════════
// CHART 11: DEVELOPER GROUPED BARS
// Filters: show both tiers, or isolate Tier 1 / Tier 2.
// ═══════════════════════════════════════════════
function buildDeveloper() {
  const container = document.getElementById('developer-chart');
  const W = container.clientWidth || 400, H = 240;
  const margin = {top: 20, right: 30, bottom: 40, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const plans = ['50/50','60/40','80/20','10/90'];
  const x0 = d3.scaleBand().domain(plans).range([0, iw]).padding(0.25);
  const y  = d3.scaleLinear().domain([0, d3.max(DEVELOPER_DATA, d => d.psf)*1.15]).range([ih, 0]);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x0))
    .selectAll('text').style('fill','var(--text-2)').style('font-size','12px');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+d))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

  const groupLayer = g.append('g');

  function update() {
    const tierFilter = document.querySelector('#developer-tier-toggle button.active').dataset.tier;
    const tiers = tierFilter === 'both' ? ['Tier 1','Tier 2'] : [tierFilter];
    const x1 = d3.scaleBand().domain(tiers).range([0, x0.bandwidth()]).padding(0.08);

    groupLayer.selectAll('*').remove();
    groupLayer.selectAll('g').data(plans).enter().append('g')
      .attr('transform', d => `translate(${x0(d)},0)`)
      .selectAll('rect').data(d => DEVELOPER_DATA.filter(x => x.plan === d && tiers.includes(x.tier))).enter().append('rect')
      .attr('class','bar').attr('x', d => x1(d.tier)).attr('y', ih).attr('width', x1.bandwidth()).attr('height', 0).attr('rx',3)
      .attr('fill', d => d.tier === 'Tier 1' ? 'var(--blue)' : 'var(--text-3)')
      .on('mouseover', function(e, d) {
        dimOthers('#developer-chart .bar', this);
        showTT(`<div class="tt-title">${d.tier} — ${d.plan} Plan</div>
          <div class="tt-row"><span>Price/sqft:</span><span class="tt-val">$${fmt(d.psf)}</span></div>`, e);
      }).on('mouseout', () => { restoreOpacity('#developer-chart .bar'); hideTT(); })
      .transition().duration(600).delay((d,i) => i*60).ease(d3.easeCubicOut)
      .attr('y', d => y(d.psf)).attr('height', d => ih - y(d.psf));
  }

  const leg = g.append('g').attr('transform',`translate(4,4)`);
  [{c:'var(--blue)',t:'Tier 1'},{c:'var(--text-3)',t:'Tier 2'}].forEach(({c,t},i) => {
    leg.append('rect').attr('x',0).attr('y',i*16).attr('width',12).attr('height',3).attr('rx',1).attr('fill',c);
    leg.append('text').attr('x',16).attr('y',i*16+4).text(t).style('fill','var(--text-2)').style('font-size','10px');
  });

  document.querySelectorAll('#developer-tier-toggle button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#developer-tier-toggle button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 12: OFF-PLAN vs SECONDARY (AREA GAP)
// Filters: global year-range (header) + local smoothing slider.
// ═══════════════════════════════════════════════
function buildOffplanSecondary() {
  const container = document.getElementById('offplan-secondary-chart');
  const W = container.clientWidth || 800, H = 260;
  const margin = {top: 20, right: 30, bottom: 40, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  svg.append('defs').append('clipPath').attr('id','clip-op').append('rect').attr('width',iw).attr('height',ih);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const baseParsed = getFilteredTrend();
  const x = d3.scaleTime().domain(d3.extent(baseParsed, d => d.date)).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(baseParsed, d => Math.max(d.secondary_psf, d.offplan_psf))*1.12]).range([ih, 0]);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b %Y')))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
  g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => '$'+d))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

  const pg = g.append('g').attr('clip-path','url(#clip-op)');
  const gapPath = pg.append('path').attr('fill','rgba(20,184,166,0.12)');
  const pathSec = pg.append('path').attr('fill','none').attr('stroke','var(--c-secondary)').attr('stroke-width',2.5);
  const pathOff = pg.append('path').attr('fill','none').attr('stroke','var(--c-offplan)').attr('stroke-width',2.5);

  const areaGap = d3.area().x(d => x(d.date)).y0(d => y(d.secondary_psf)).y1(d => y(d.offplan_psf)).curve(d3.curveMonotoneX);
  const lineSec = d3.line().x(d => x(d.date)).y(d => y(d.secondary_psf)).curve(d3.curveMonotoneX);
  const lineOff = d3.line().x(d => x(d.date)).y(d => y(d.offplan_psf)).curve(d3.curveMonotoneX);

  const focus = pg.append('g').style('display','none');
  focus.append('line').attr('class','crosshair-v').attr('y1',0).attr('y2',ih);
  const bisect = d3.bisector(d => d.date).left;
  let currentData = baseParsed;

  function redraw(animate) {
    const k = +document.getElementById('offplan-smooth').value;
    document.getElementById('offplan-smooth-val').textContent = k === 1 ? 'None' : `${k}-Mo`;

    let data = [...baseParsed];
    if (k > 1) {
      data = data.map((d, i) => ({
        ...d,
        secondary_psf: d3.mean(baseParsed.slice(Math.max(0,i-k+1), i+1), v => v.secondary_psf),
        offplan_psf:   d3.mean(baseParsed.slice(Math.max(0,i-k+1), i+1), v => v.offplan_psf),
      }));
    }
    currentData = data;

    gapPath.datum(data).attr('d', areaGap);
    pathSec.datum(data).attr('d', lineSec);
    pathOff.datum(data).attr('d', lineOff);

    if (animate) {
      gapPath.style('opacity',0).transition().duration(1200).style('opacity',1);
      [pathSec, pathOff].forEach((p, idx) => {
        const len = p.node().getTotalLength();
        p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
          .transition().duration(1600).delay(idx*150).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);
      });
    }
  }

  g.append('rect').attr('width',iw).attr('height',ih).attr('fill','none').attr('pointer-events','all')
    .on('mouseover', () => focus.style('display',null))
    .on('mouseout', () => { focus.style('display','none'); hideTT(); })
    .on('mousemove', e => {
      const x0 = x.invert(d3.pointer(e)[0]);
      const i = bisect(currentData, x0, 1);
      if (i >= currentData.length || i < 1) return;
      const d = (x0 - currentData[i-1].date > currentData[i].date - x0) ? currentData[i] : currentData[i-1];
      const cx = x(d.date);
      focus.select('.crosshair-v').attr('x1',cx).attr('x2',cx);
      const gap = ((d.offplan_psf - d.secondary_psf) / d.secondary_psf * 100).toFixed(1);
      showTT(`<div class="tt-title">${d3.timeFormat('%B %Y')(d.date)}</div>
        <div class="tt-row"><span>Off-Plan:</span><span class="tt-val" style="color:var(--c-offplan)">$${Math.round(d.offplan_psf)}</span></div>
        <div class="tt-row"><span>Secondary:</span><span class="tt-val" style="color:var(--c-secondary)">$${Math.round(d.secondary_psf)}</span></div>
        <div class="tt-row"><span>Premium gap:</span><span class="tt-val">+${gap}%</span></div>`, e);
    });

  const leg = g.append('g').attr('transform',`translate(4,4)`);
  [{c:'var(--c-offplan)',t:'Off-Plan'},{c:'var(--c-secondary)',t:'Secondary'}].forEach(({c,t},i) => {
    leg.append('rect').attr('x',i*90).attr('y',0).attr('width',16).attr('height',3).attr('rx',1).attr('fill',c);
    leg.append('text').attr('x',i*90+20).attr('y',4).text(t).style('fill','var(--text-2)').style('font-size','12px');
  });

  document.getElementById('offplan-smooth').addEventListener('input', () => redraw(false));
  redraw(true);
}

// ═══════════════════════════════════════════════
// RENTAL CHARTS: shared simple-bar renderer
// Each caller (Furnish/Contract/Chiller) supplies its own filtered
// + transformed dataset and re-invokes this renderer on filter change.
// ═══════════════════════════════════════════════
function renderSimpleBar(containerId, data, xKey, yKey, colorFn, yLabel, xFormat=d=>d, valueFormat=null) {
  clear(containerId);
  const container = document.getElementById(containerId);
  const W = container.clientWidth || 260, H = 220;
  const margin = {top: 16, right: 16, bottom: 45, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const fmtVal = valueFormat || (v => (typeof v === 'number' && v >= 1000) ? '$'+fmt(v) : fmt(v));

  const x = d3.scaleBand().domain(data.map(d => xFormat(d))).range([0, iw]).padding(0.3);
  const y = d3.scaleLinear().domain([0, (d3.max(data, d => d[yKey])||1)*1.18]).range([ih, 0]);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''))
    .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
  g.select('.grid .domain').remove();
  g.append('g').attr('transform',`translate(0,${ih})`)
    .call(d3.axisBottom(x)).selectAll('text').style('fill','var(--text-2)').style('font-size','11px').attr('transform','rotate(-20)').style('text-anchor','end');
  g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(v => typeof v === 'number' && v >= 1000 ? fmtK(v) : v))
    .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');

  g.selectAll('.bar').data(data).enter().append('rect')
    .attr('class','bar').attr('x', d => x(xFormat(d))).attr('width', x.bandwidth()).attr('y', ih).attr('height',0).attr('rx',4)
    .attr('fill', typeof colorFn === 'function' ? (d,i) => colorFn(i, data.length) : colorFn)
    .on('mouseover', function(e, d) {
      dimOthers(`#${containerId} .bar`, this);
      showTT(`<div class="tt-title">${xFormat(d)}</div>
        <div class="tt-row"><span>${yLabel}:</span><span class="tt-val">${fmtVal(d[yKey])}</span></div>`, e);
    })
    .on('mouseout', () => { restoreOpacity(`#${containerId} .bar`); hideTT(); })
    .transition().duration(700).delay((d,i) => i*70).ease(d3.easeBackOut)
    .attr('y', d => y(d[yKey])).attr('height', d => ih - y(d[yKey]));

  g.selectAll('.bar-val').data(data).enter().append('text')
    .attr('class','bar-val')
    .attr('x', d => x(xFormat(d)) + x.bandwidth()/2).attr('y', d => y(d[yKey]) - 5)
    .attr('text-anchor','middle').style('fill','var(--text-3)').style('font-size','10px')
    .text(d => fmtVal(d[yKey]))
    .style('opacity',0).transition().delay((d,i) => i*70+500).duration(300).style('opacity',1);
}

// ═══════════════════════════════════════════════
// CHART 13a: FURNISHING PREMIUM — sortable high→low / low→high
// ═══════════════════════════════════════════════
function buildFurnish() {
  function update() {
    const dir = document.querySelector('#furnish-sort button.active').dataset.sort;
    const data = [...FURNISH_DATA].sort((a,b) => dir === 'desc' ? b.rent - a.rent : a.rent - b.rent);
    renderSimpleBar('furnish-chart', data, 'type', 'rent', (i,n) => d3.interpolateWarm(0.3 + i/n*0.5), 'Annual Rent');
  }
  document.querySelectorAll('#furnish-sort button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#furnish-sort button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 13b: CONTRACT TYPE SPLIT — count or % share
// ═══════════════════════════════════════════════
function buildContract() {
  function update() {
    const disp = document.querySelector('#contract-display button.active').dataset.disp;
    const total = d3.sum(CONTRACT_DATA, d => d.count);
    const data = CONTRACT_DATA.map(d => ({...d, pct: +( (d.count/total*100).toFixed(1) )}));
    if (disp === 'count') {
      renderSimpleBar('contract-chart', data, 'type', 'count', (i,n) => d3.interpolateBlues(0.4 + i/n*0.5), 'Contracts');
    } else {
      renderSimpleBar('contract-chart', data, 'type', 'pct', (i,n) => d3.interpolateBlues(0.4 + i/n*0.5), 'Share', d=>d.type, v => v + '%');
    }
  }
  document.querySelectorAll('#contract-display button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#contract-display button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 13c: CHILLER COST IMPACT — annual or monthly unit
// ═══════════════════════════════════════════════
function buildChiller() {
  function update() {
    const unit = document.querySelector('#chiller-unit button.active').dataset.unit;
    const data = CHILLER_DATA.map(d => unit === 'monthly' ? {...d, rent: Math.round(d.rent/12)} : d);
    renderSimpleBar('chiller-chart', data, 'type', 'rent', (i,n) => i===0 ? 'var(--teal)' : 'var(--text-3)', unit === 'monthly' ? 'Monthly Rent' : 'Annual Rent');
  }
  document.querySelectorAll('#chiller-unit button').forEach(b => {
    b.addEventListener('click', e => {
      document.querySelectorAll('#chiller-unit button').forEach(x => x.classList.remove('active'));
      e.target.classList.add('active'); update();
    });
  });
  update();
}

// ═══════════════════════════════════════════════
// CHART 14: RENTAL YIELD — minimum-yield slider filter
// ═══════════════════════════════════════════════
function buildYield() {
  const container = document.getElementById('yield-chart');
  const W = container.clientWidth || 800, H = 280;
  const margin = {top: 20, right: 30, bottom: 80, left: 55};
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const colorOf = d => {
    if (d.yield >= 9) return 'var(--teal)';
    if (d.yield >= 6) return 'var(--blue)';
    return 'var(--text-3)';
  };

  const xAxisG = g.append('g').attr('transform',`translate(0,${ih})`);
  const yAxisG = g.append('g');
  let all = [...YIELD_DATA].sort((a,b) => b.yield - a.yield);

  function update() {
    const minY = +document.getElementById('yield-filter').value;
    document.getElementById('yield-filter-val').textContent = minY.toFixed(1) + '%';
    const data = all.filter(d => d.yield >= minY);

    const x = d3.scaleBand().domain(data.map(d => d.community)).range([0, iw]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(all, d => d.yield)*1.12]).range([ih, 0]);

    xAxisG.transition().duration(500).call(d3.axisBottom(x))
      .selectAll('text').style('fill','var(--text-2)').style('font-size','12px').attr('transform','rotate(-30)').style('text-anchor','end');
    xAxisG.select('.domain').remove();
    yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d => d+'%'))
      .selectAll('text').style('fill','var(--text-3)').style('font-size','11px');
    yAxisG.select('.domain').remove();

    g.selectAll('.grid-y').remove();
    g.insert('g',':first-child').attr('class','grid-y').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''))
      .selectAll('line').attr('stroke','rgba(255,255,255,0.05)');
    g.select('.grid-y .domain').remove();

    const bars = g.selectAll('.ybar').data(data, d => d.community);

    bars.enter().append('rect').attr('class','ybar')
      .attr('x', d => x(d.community)).attr('width', x.bandwidth()).attr('rx',4)
      .attr('y', ih).attr('height', 0).attr('fill', colorOf)
      .on('mouseover', function(e, d) {
        dimOthers('.ybar', this);
        showTT(`<div class="tt-title">${d.community}</div>
          <div class="tt-row"><span>Rental Yield:</span><span class="tt-val" style="color:var(--teal)">${d.yield}%</span></div>
          <div class="tt-row"><span>vs 5% benchmark:</span><span class="tt-val ${d.yield>=5?'delta-up':'delta-down'}">${d.yield>=5?'+':''}${(d.yield-5).toFixed(1)}%</span></div>`, e);
      })
      .on('mouseout', () => { restoreOpacity('.ybar'); hideTT(); })
      .merge(bars).transition().duration(600).ease(d3.easeBackOut)
      .attr('x', d => x(d.community)).attr('width', x.bandwidth())
      .attr('y', d => y(d.yield)).attr('height', d => ih - y(d.yield))
      .attr('fill', colorOf);

    bars.exit().transition().duration(300).attr('y', ih).attr('height',0).remove();

    g.selectAll('.bench-line').remove();
    g.selectAll('.bench-text').remove();
    const y5 = y(5);
    if (y5 > 0 && y5 < ih) {
      g.append('line').attr('class','bench-line').attr('x1',0).attr('x2',iw).attr('y1',y5).attr('y2',y5)
        .attr('stroke','var(--amber)').attr('stroke-width',1.5).attr('stroke-dasharray','5,4');
      g.append('text').attr('class','bench-text').attr('x', iw-4).attr('y', y5-6)
        .attr('text-anchor','end').style('fill','var(--amber)').style('font-size','11px').text('5% Target');
    }
  }

  document.getElementById('yield-filter').addEventListener('input', update);
  update();
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
window.onload = () => showView('overview');
