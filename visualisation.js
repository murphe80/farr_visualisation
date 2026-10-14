const parseDate = d3.utcParse("%Y-%m-%d");

d3.csv("farr.csv", function (row) {
  return {
    year: toNumber(row.year),
    week: toNumber(row.week),
    week_ending: parseDate(row.week_ending),
    deaths: toNumber(row.deaths),
    mean_temperature: toNumber(row.mean_temperature),
    mortality_reference: toNumber(row.mortality_reference),
    temperature_reference: toNumber(row.temperature_reference)
  };
})
  .then(function (data) {
    drawVisualisation(data);
  })
  .catch(function (error) {
    console.error("Could not draw the chart:", error);
    d3.select("#visualisation")
      .attr("role", "alert")
      .text(`Could not draw the chart: ${error.message || String(error)}. Reload the page to retry.`);
  });

function drawVisualisation(data) {
  const period = preparePeriodAverage(data);
  const yearRows = prepareAllYears(data);
  const charts = yearRows.map(rows => ({
    id: `year-${rows[0].year}`, title: String(rows[0].year), isAverage: false,
    rows: rows.map(row => ({ ...row, month: row.week_ending.getUTCMonth() })),
    reference: rows[0].mortality_reference,
    temperatureReference: rows[0].temperature_reference
  }));
  charts.push({ id: "period-average", title: "Average · 1840–1849", isAverage: true,
    rows: period.rows, reference: period.mortalityReference,
    temperatureReference: period.temperatureReference });
  const title = "Temperature and Mortality of London.";
  const subtitle = `Weekly diagrams for ${yearRows[0][0].year}–${yearRows.at(-1)[0].year} · followed by the 1840–1849 average`;
  document.title = title;
  d3.select("h1").text(title);
  d3.select("#subtitle").text(subtitle);
  // Fixed calendar rings determine column spacing; only vertical overflow
  // reserves extra space for the row that contains it.
  const size = 1000;
  const columns = 4;
  const layouts = charts.map(chartLayout);
  const rowLayouts = d3.range(Math.ceil(charts.length / columns)).map(row => {
    const members = layouts.slice(row * columns, (row + 1) * columns);
    const centerY = d3.max(members, layout => layout.top) + 70;
    return { centerY, height: centerY + d3.max(members, layout => layout.bottom) + 20 };
  });
  let height = 180;
  const rowOffsets = rowLayouts.map(layout => {
    const offset = height;
    height += layout.height;
    return offset;
  });
  const width = size * columns;
  const container = d3.select("#visualisation").html("").attr("role", null);
  const svg = container.append("svg").attr("class", "chart-grid")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "group").attr("aria-labelledby", "visualisation-title visualisation-subtitle");
  svg.append("text").attr("id", "visualisation-title").attr("class", "visualisation-title")
    .attr("x", width / 2).attr("y", 80).attr("text-anchor", "middle").text(title);
  svg.append("text").attr("id", "visualisation-subtitle").attr("class", "visualisation-subtitle")
    .attr("x", width / 2).attr("y", 140).attr("text-anchor", "middle").text(subtitle);
  const inspector = createWeekInspector(container);
  const zoom = createZoomView(inspector);
  charts.forEach((chart, index) => {
    const row = Math.floor(index / columns);
    const panel = svg.append("g").attr("class", chart.isAverage ? "average-panel" : "year-panel")
      .attr("data-year", chart.isAverage ? null : chart.rows[0].year)
      .attr("data-period", chart.isAverage ? "1840-1849" : null)
      .attr("data-column", index % columns).attr("data-row", row)
      .attr("transform", `translate(${index % columns * size},${rowOffsets[row]})`);
    drawRadialChart(panel, chart, size, { centerY: rowLayouts[row].centerY,
      titleY: rowLayouts[row].centerY - layouts[index].top }, inspector);
    const trigger = panel.select(".panel-title")
      .attr("role", "button").attr("tabindex", 0)
      .attr("aria-label", `Enlarge ${chart.title}`)
      .attr("aria-haspopup", "dialog").attr("aria-controls", "chart-zoom")
      .on("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          zoom.open(chart, trigger.node());
        }
      });
    panel.classed("zoomable-panel", true)
      .on("click", () => zoom.open(chart, trigger.node()));
  });

}

function createZoomView(gridInspector) {
  const dialog = d3.select("body").append("dialog").attr("id", "chart-zoom")
    .attr("aria-labelledby", "zoom-heading");
  const header = dialog.append("div").attr("class", "zoom-header");
  const heading = header.append("h2").attr("id", "zoom-heading");
  header.append("button").attr("type", "button").attr("class", "zoom-close")
    .attr("aria-label", "Close enlarged diagram").text("Close ×")
    .on("click", () => dialog.node().close());
  dialog.append("p").attr("class", "zoom-help")
    .text("Hover a spoke or Tab to a point for weekly values. Close or press Escape to return to all diagrams. On small screens, scroll to inspect the enlarged chart.");
  const viewport = dialog.append("div").attr("class", "zoom-viewport");
  const detail = dialog.append("p").attr("id", "zoom-week-details").attr("aria-live", "polite");
  const inspector = createWeekInspector(dialog, {
    id: "zoom-week-tooltip", details: "#zoom-week-details", namespace: "zoom-tooltip"
  });
  let trigger = null;
  viewport.on("scroll.zoom", () => inspector.reposition());
  dialog.on("close", () => {
    inspector.reset();
    viewport.html("");
    document.body.classList.remove("zoom-open");
    trigger?.focus({ preventScroll: true });
  }).on("click", event => {
    if (event.target !== dialog.node()) return;
    const box = dialog.node().getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom) dialog.node().close();
  });
  return {
    open(chart, source) {
      if (dialog.node().open) return;
      trigger = source;
      gridInspector.reset();
      inspector.reset();
      heading.text(chart.title);
      const layout = chartLayout(chart);
      const size = Math.max(1000, Math.ceil(2 * layout.horizontal + 100));
      const centerY = layout.top + 70;
      const svg = viewport.html("").append("svg").attr("class", "zoom-chart")
        .attr("viewBox", `0 0 ${size} ${centerY + layout.bottom + 20}`);
      drawRadialChart(svg.append("g"), { ...chart, id: `zoom-${chart.id}` }, size,
        { centerY, titleY: 70 }, inspector);
      detail.text("Hover over a weekly spoke or point, or use Tab to focus a point, to inspect a week.");
      document.body.classList.add("zoom-open");
      dialog.node().showModal();
      viewport.node().scrollTo(0, 0);
      dialog.select(".zoom-close").node().focus();
    }
  };
}

// Measure actual peak directions so a September spike does not create empty
// space above the chart or push its title away from the calendar circle.
function chartLayout(chart) {
  const points = chart.rows.flatMap((row, index) => {
    const angle = index / chart.rows.length * 2 * Math.PI;
    return [(row.deaths - 100) * 0.32, (row.mean_temperature - 10) * 3.2]
      .map(radius => ({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) }));
  });
  return {
    top: Math.max(chart.isAverage ? 490 : 455, d3.max(points, point => -point.y) + 65),
    bottom: Math.max(440, d3.max(points, point => point.y) + 70),
    horizontal: Math.max(440, d3.max(points, point => Math.abs(point.x)))
  };
}

function drawRadialChart(panel, chart, size, { centerY, titleY }, inspector) {
  const { rows, reference, temperatureReference, isAverage } = chart;
  const circleRadii = d3.range(1, 11).map(index => index * 32);
  const tau = 2 * Math.PI;
  // Start the weekly spokes at twelve o'clock so the cardinal axes are spokes.
  // Month labels sit at the midpoint of their weekly sections.
  const angle = index => index / rows.length * tau;
  const series = [
    { id: "mortality", label: "Mortality", field: "deaths", reference,
      domain: [200, 1100], ticks: d3.range(200, 1101, 100),
      deviation: "deathDeviation", estimated: "deaths_estimated",
      above: "#000000", below: "#ffffff", regionNames: ["Salubrity", "Mortality"] },
    { id: "temperature", label: "Temperature", field: "mean_temperature", reference: temperatureReference,
      domain: [20, 110], ticks: d3.range(20, 111, 10),
      deviation: "temperatureDeviation", estimated: "mean_temperature_estimated",
      above: "#cf302b", below: "#2464b4", regionNames: ["Cold", "Hot"] }
  ];
  series.forEach(metric => {
    metric.scale = d3.scaleLinear().domain(metric.domain).range([circleRadii[0], circleRadii[9]]);
    metric.radius = row => metric.scale(row[metric.field]);
    metric.referenceRadius = metric.scale(metric.reference);
    metric.colour = row => row[metric.deviation] === 0 ? "#777067" :
      row[metric.deviation] > 0 ? metric.above : metric.below;
  });

  const prefix = chart.id;
  panel.attr("role", "group").attr("aria-labelledby", `${prefix}-title`)
    .attr("aria-describedby", `${prefix}-description`);
  panel.append("text").attr("id", `${prefix}-title`).attr("class", "panel-title")
    .attr("x", size / 2).attr("y", titleY).attr("text-anchor", "middle").text(chart.title);
  if (isAverage) {
    panel.append("text").attr("class", "average-baselines")
      .attr("x", size / 2).attr("y", titleY + 36).attr("text-anchor", "middle")
      .text(`Overall means · Temperature ${d3.format(".2f")(temperatureReference)} · Weekly deaths ${d3.format(",.2f")(reference)}`);
  }
  panel.append("desc").attr("id", `${prefix}-description`)
    .text(`${chart.title}: ${rows.length} ${isAverage ? "weekly means across ten years" : "weekly observations"}. January is at the top; weeks run clockwise. Dashed circles mark ${isAverage ? "overall means" : "CSV references"} of ${reference} deaths and ${temperatureReference} temperature units. Horizontal axes show deaths and vertical axes temperature. Hover or focus a point for values and signed deviations.`);
  const plot = panel.append("g").attr("class", isAverage ? "average-plot" : "year-plot")
    .attr("transform", `translate(${size / 2},${centerY})`);
  const defs = plot.append("defs");
  const maximumRadius = d3.max(series, metric => d3.max(rows, metric.radius));
  // Keep the calendar rim identical in every panel, even when mortality
  // extends beyond it. Only clipping and hover coverage follow the peaks.
  const spokeRadius = 357;
  const monthBandRadius = spokeRadius + 8;
  const monthLabelRadius = spokeRadius + 41;
  const clipRadius = Math.max(410, maximumRadius + 30);

  const months = d3.groups(rows, row => row.month).map(([month, weeks]) => {
    const first = rows.indexOf(weeks[0]);
    const last = rows.indexOf(weeks[weeks.length - 1]);
    return { month, label: d3.timeFormat("%B")(new Date(2000, month, 1)),
      start: angle(first - 0.5), end: angle(last + 0.5), middle: angle((first + last) / 2) };
  });
  const monthArc = d3.arc().innerRadius(monthBandRadius).outerRadius(monthBandRadius + 5)
    .startAngle(month => month.start).endAngle(month => month.end).padAngle(0.015).cornerRadius(2);
  const monthBands = plot.append("g").attr("class", "month-bands").selectAll("path").data(months).join("path")
    .attr("d", monthArc);
  const monthLabels = plot.append("g").attr("class", "month-labels").selectAll("text").data(months).join("text")
    .attr("x", month => monthLabelRadius * Math.sin(month.middle))
    .attr("y", month => -monthLabelRadius * Math.cos(month.middle))
    .attr("dy", "0.35em").attr("text-anchor", "middle")
    .text(month => month.label);

  const circlePath = r => `M0,${-r}a${r},${r} 0 1,1 0,${2 * r}a${r},${r} 0 1,1 0,${-2 * r}Z`;
  series.forEach(metric => {
    const ring = plot.append("g").attr("class", `${metric.id}-ring`);
    // The closed curve passes through all weekly values. Clip at the exact
    // baseline so the colour always matches the side of the average circle.
    const trendPath = d3.lineRadial().angle((_, i) => angle(i)).radius(metric.radius)
      .curve(d3.curveCatmullRomClosed.alpha(0.5))(rows);
    const baseline = circlePath(metric.referenceRadius);
    defs.append("clipPath").attr("id", `${prefix}-${metric.id}-area`)
      .attr("clipPathUnits", "userSpaceOnUse").append("path")
      .attr("clip-rule", "evenodd").attr("d", trendPath + baseline);
    defs.append("clipPath").attr("id", `${prefix}-${metric.id}-inside`)
      .append("circle").attr("r", metric.referenceRadius);
    defs.append("clipPath").attr("id", `${prefix}-${metric.id}-outside`)
      .append("path").attr("clip-rule", "evenodd")
      .attr("d", circlePath(clipRadius) + baseline);
    const area = ring.append("g").attr("clip-path", `url(#${prefix}-${metric.id}-area)`);
    [ ["inside", metric.below], ["outside", metric.above] ].forEach(([side, colour]) => {
      area.append("circle").attr("r", clipRadius).attr("fill", colour)
        .attr("clip-path", `url(#${prefix}-${metric.id}-${side})`);
    });
    // A fine outline keeps white mortality values legible against cream.
    ring.append("path").attr("class", "series-outline").attr("d", trendPath);
    [ ["inside", metric.below], ["outside", metric.above] ].forEach(([side, colour]) => {
      ring.append("path").attr("class", "series-trend").attr("d", trendPath)
        .attr("stroke", colour).attr("clip-path", `url(#${prefix}-${metric.id}-${side})`);
    });

  });

  // Keep the calendar legible where mortality spills across the fixed rim.
  plot.select(".month-bands").raise();
  plot.select(".month-labels").raise();

  // Draw one shared grid over the fills so every weekly spoke visibly intersects
  // all ten circles. Reference circles use this panel’s baselines.
  const grid = plot.append("g").attr("class", "radial-grid").attr("pointer-events", "none");
  const spokes = grid.append("g").attr("class", "spokes").selectAll("line").data(rows).join("line")
    .attr("x1", 0).attr("y1", 0)
    .attr("x2", (_, i) => spokeRadius * Math.sin(angle(i)))
    .attr("y2", (_, i) => -spokeRadius * Math.cos(angle(i)));
  grid.append("g").attr("class", "grid-circles").selectAll("circle").data(circleRadii).join("circle")
    .attr("r", radius => radius)
    .attr("data-circle", (_, index) => index + 1)
    .attr("class", "grid-circle");
  grid.append("g").selectAll("circle").data(series).join("circle")
    .attr("class", metric => `reference-circle ${metric.id}-reference`)
    .attr("r", metric => metric.referenceRadius)
    .attr("data-value", metric => metric.reference);

  // Mirror values across both horizontal and both vertical radii.
  const axes = plot.append("g").attr("class", "radial-axes").attr("pointer-events", "none");
  series.forEach(metric => {
    const horizontal = metric.id === "mortality";
    [-1, 1].forEach(direction => {
      const axis = axes.append("g").attr("class", `${metric.id}-axis`)
        .attr("data-direction", direction);
      const ticks = axis.selectAll("g").data(metric.ticks).join("g")
        .attr("class", "axis-tick")
        .attr("data-value", value => value)
        .attr("transform", (_, index) => horizontal ?
          `translate(${direction * circleRadii[index]},0)` : `translate(0,${direction * circleRadii[index]})`);
      ticks.append("text").attr("text-anchor", horizontal ? "middle" : "end")
        .attr("x", horizontal ? 0 : -7).attr("y", horizontal ? 14 : 3)
        .text(value => value);
    });
  });

  const regionLabels = plot.append("g").attr("class", "region-labels").attr("pointer-events", "none");
  series.forEach(metric => {
    const radii = rows.map(metric.radius);
    [-1, 1].forEach((sign, category) => {
      const region = largestRadialRegion(radii, metric.referenceRadius, sign);
      if (!region) return;
      const theta = angle(region.index);
      const r = radii[region.index];
      const labelRadius = r + sign * 19;
      const x = labelRadius * Math.sin(theta);
      const y = -labelRadius * Math.cos(theta);
      const anchor = Math.abs(Math.sin(theta)) < 0.25 && metric.id !== "mortality" ? "middle" : x < 0 ? "end" : "start";
      const label = regionLabels.append("g").attr("class", `${metric.id}-${sign > 0 ? "above" : "below"}-label`);
      label.append("line").attr("x1", r * Math.sin(theta)).attr("y1", -r * Math.cos(theta))
        .attr("x2", x).attr("y2", y);
      label.append("text").attr("x", x + (anchor === "start" ? 4 : anchor === "end" ? -4 : 0))
        .attr("y", y).attr("dy", "0.35em").attr("text-anchor", anchor)
        .text(metric.regionNames[category]);
    });
  });

  const valueFormat = d3.format(",.2f");
  const deviationFormat = d3.format("+,.2f");
  const summary = row => isAverage ? `Week ${row.week} · mean across ${row.years} years (1840–1849): ` +
    `${valueFormat(row.deaths)} deaths (${deviationFormat(row.deathDeviation)} vs overall mean ${valueFormat(reference)}). ` +
    `Temperature ${valueFormat(row.mean_temperature)} (${deviationFormat(row.temperatureDeviation)} vs overall mean ${valueFormat(temperatureReference)}). ` +
    `Estimated inputs: deaths ${row.deaths_estimate_count}/${row.years}; temperature ${row.temperature_estimate_count}/${row.years}.` :
    `Week ending ${d3.utcFormat("%d %B %Y")(row.week_ending)}: ` +
    `${valueFormat(row.deaths)} deaths${row.deaths_estimated ? " (estimated)" : ""} ` +
    `(${deviationFormat(row.deathDeviation)} vs baseline ${valueFormat(reference)}). ` +
    `Temperature ${valueFormat(row.mean_temperature)}${row.mean_temperature_estimated ? " (estimated)" : ""} ` +
    `(${deviationFormat(row.temperatureDeviation)} vs baseline ${valueFormat(temperatureReference)}).`;

  // Invisible weekly sectors make the whole spoke easy to hover, including
  // the space between the two series. Data points remain keyboard accessible.
  const sectorArc = d3.arc().innerRadius(18)
    .outerRadius(d => Math.max(spokeRadius, d3.max(series, metric => metric.radius(d.row)) + 12))
    .startAngle(d => angle(d.index - 0.5)).endAngle(d => angle(d.index + 0.5));
  const weekSectors = plot.append("g").attr("class", "week-sectors")
    .selectAll("path").data(rows.map((row, index) => ({ row, index }))).join("path")
    .attr("class", "week-sector").attr("d", sectorArc).attr("fill", "transparent")
    .attr("aria-hidden", "true");

  const observations = series.flatMap(metric => rows.map((row, index) => ({ row, metric, index })));
  const position = ({ row, metric, index }) =>
    `translate(${metric.radius(row) * Math.sin(angle(index))},${-metric.radius(row) * Math.cos(angle(index))})`;
  const marks = plot.append("g").selectAll("g").data(observations).join("g")
    .attr("class", d => `week-mark ${d.metric.id}-mark`)
    .attr("transform", position)
    .attr("tabindex", 0).attr("role", "img")
    .attr("aria-label", d => `${d.metric.label} point. ${summary(d.row)}`);
  // A larger invisible target makes small points easier to hover over.
  marks.append("circle").attr("class", "week-hit").attr("r", 9).attr("fill", "transparent");
  marks.filter(d => d.row[d.metric.estimated]).append("circle")
    .attr("class", "estimate-halo").attr("r", 6.5);
  const points = marks.append("circle").attr("class", "week-point")
    .attr("r", 3.5).attr("fill", d => d.metric.colour(d.row));

  // Repaint text in white only where the black mortality fill lies underneath.
  // Matching clips preserve dark text outside the fill, without text outlines.
  const contrastLabels = plot.append("g").attr("class", "contrast-labels")
    .attr("aria-hidden", "true").attr("pointer-events", "none")
    .attr("clip-path", `url(#${prefix}-mortality-area)`)
    .append("g").attr("clip-path", `url(#${prefix}-mortality-outside)`);
  [".month-labels", ".radial-axes", ".region-labels"].forEach(selector => {
    const original = plot.select(selector).node();
    const copy = original.cloneNode(true);
    const originalTexts = original.querySelectorAll("text");
    copy.querySelectorAll("text").forEach((text, index) => {
      text.__data__ = originalTexts[index].__data__;
      text.style.fill = "#ffffff";
      text.style.stroke = "none";
    });
    copy.querySelectorAll("line").forEach(line => line.remove());
    contrastLabels.node().appendChild(copy);
  });
  const contrastMonths = contrastLabels.selectAll(".month-labels text");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function highlight(active) {
    const duration = reducedMotion.matches ? 0 : 180;
    marks.classed("is-active", d => d.row === active);
    // interrupt() stops an unfinished animation when the mouse moves quickly.
    points.interrupt().transition().duration(duration).ease(d3.easeCubicOut)
      .attr("r", d => d.row === active ? 5 : 3.5);
    spokes.interrupt().transition().duration(duration)
      .style("stroke", row => row === active ? "#455a70" : "#dfd5c3")
      .style("stroke-width", row => row === active ? 2 : 0.8);
    monthLabels.classed("is-active", month => active && month.month === active.month);
    monthBands.classed("is-active", month => active && month.month === active.month);
    contrastMonths.classed("is-active", month => active && month.month === active.month);
  }
  inspector.bind({ marks, weekSectors, highlight, summary, reference, temperatureReference, isAverage });
  panel.select(".panel-title").raise();
  panel.select(".average-baselines").raise();
}

// One inspector coordinates hover and keyboard focus for both series.
function createWeekInspector(container, { id = "week-tooltip", details = "#week-details", namespace = "chart-tooltip" } = {}) {
  const tooltip = container.append("div")
    .attr("id", id).attr("class", "week-tooltip").attr("role", "tooltip")
    .property("hidden", true);
  const tooltipDate = tooltip.append("div").attr("class", "tooltip-date");
  const tooltipDeaths = tooltip.append("div").attr("class", "tooltip-value");
  const tooltipDeathDeviation = tooltip.append("div").attr("class", "tooltip-deviation");
  const tooltipTemperature = tooltip.append("div").attr("class", "tooltip-value");
  const tooltipTemperatureDeviation = tooltip.append("div").attr("class", "tooltip-deviation");
  const valueFormat = d3.format(",.2f");
  const deviationFormat = d3.format("+,.2f");
  let hovered = null;
  let focused = null;
  let previousContext = null;
  let dismissedRow = null;

  function positionTooltip() {
    if (tooltip.property("hidden")) return;
    const box = focused?.element.getBoundingClientRect();
    const location = hovered ? hovered.location : box && [box.right, box.top];
    if (!location) return;
    const bounds = tooltip.node().getBoundingClientRect();
    let x = location[0] + 14;
    let y = location[1] + 14;
    if (x + bounds.width > window.innerWidth - 8) x = location[0] - bounds.width - 14;
    if (y + bounds.height > window.innerHeight - 8) y = location[1] - bounds.height - 14;
    tooltip.style("left", `${Math.max(8, x)}px`).style("top", `${Math.max(8, y)}px`);
  }

  function update() {
    const current = hovered || focused;
    const active = current?.observation.row;
    const context = current?.context;
    if (previousContext && previousContext !== context) {
      previousContext.highlight(null);
      previousContext.marks.attr("aria-describedby", null);
    }
    context?.highlight(active);
    previousContext = context;
    d3.select(details).text(active ? context.summary(active) :
      "Hover over a weekly spoke or point, or use Tab to focus a point, to inspect a week.");
    const showTooltip = active && active !== dismissedRow;
    tooltip.property("hidden", !showTooltip);
    context?.marks.attr("aria-describedby", d => showTooltip && d.row === active ? id : null);
    if (showTooltip) {
      const baselineLabel = context.isAverage ? "overall mean" : "baseline";
      tooltipDate.text(context.isAverage ? `Week ${active.week} · ${active.years}-year mean (1840–1849)` :
        `Week ${active.week} · ${d3.utcFormat("%d %b %Y")(active.week_ending)}`);
      tooltipDeaths.text(context.isAverage ?
        `Average deaths: ${valueFormat(active.deaths)} · ${active.deaths_estimate_count}/${active.years} inputs estimated` :
        `Deaths: ${valueFormat(active.deaths)}${active.deaths_estimated ? " (estimated)" : ""}`);
      tooltipDeathDeviation.text(`${deviationFormat(active.deathDeviation)} vs ${baselineLabel} ${valueFormat(context.reference)}`);
      tooltipTemperature.text(context.isAverage ?
        `Average temperature: ${valueFormat(active.mean_temperature)} · ${active.temperature_estimate_count}/${active.years} inputs estimated` :
        `Temperature: ${valueFormat(active.mean_temperature)}${active.mean_temperature_estimated ? " (estimated)" : ""}`);
      tooltipTemperatureDeviation.text(`${deviationFormat(active.temperatureDeviation)} vs ${baselineLabel} ${valueFormat(context.temperatureReference)}`);
      positionTooltip();
    }
  }
  d3.select(window).on(`keydown.${namespace}`, event => {
    if (event.key === "Escape") {
      dismissedRow = (hovered || focused)?.observation.row;
      update();
    }
  }).on(`scroll.${namespace} resize.${namespace}`, () => {
    hovered = null;
    update();
  });
  // Scrolling a wide SVG on a small screen also dismisses pointer tooltips.
  container.on("scroll.chart-tooltip", () => { hovered = null; update(); });
  update();
  return {
    reposition() {
      hovered = null;
      update();
    },
    reset() {
      hovered = null;
      focused = null;
      dismissedRow = null;
      update();
    },
    bind(context) {
      function hoverWeek(event, observation) {
        const changed = hovered?.observation.row !== observation.row;
        hovered = { observation, context, location: [event.clientX, event.clientY] };
        if (changed) {
          dismissedRow = null;
          update();
        } else positionTooltip();
      }
      [context.weekSectors, context.marks].forEach(targets => {
        targets.on("pointerenter", hoverWeek).on("pointermove", hoverWeek)
          .on("pointerleave", () => { hovered = null; update(); });
      });
      context.marks.on("focus", (event, observation) => {
        focused = { observation, context, element: event.currentTarget };
        dismissedRow = null;
        update();
      }).on("blur", () => { focused = null; update(); });
    }
  };
}
