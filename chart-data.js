// Data preparation is separate from drawing so these rules are easy to test.
function toNumber(value) {
  if (value == null || value.trim() === "" || value.trim() === "?") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fillMissingValues(rows, field) {
  // Always read the original values: estimates must not become neighbours.
  const original = rows.map(row => row[field]);
  if (original.every(value => value === null)) {
    throw new Error(`No recorded values for ${field}.`);
  }

  rows.forEach((row, index) => {
    row[`${field}_estimated`] = original[index] === null;
    if (original[index] !== null) return;

    let before = index - 1;
    let after = index + 1;
    while (before >= 0 && original[before] === null) before--;
    while (after < rows.length && original[after] === null) after++;

    if (before < 0) row[field] = original[after];
    else if (after === rows.length) row[field] = original[before];
    else if (before === index - 1 && after === index + 1) {
      row[field] = (original[before] + original[after]) / 2;
    } else {
      // Consecutive gaps use the nearest recorded week; ties use the earlier.
      const earlierDistance = row.week - rows[before].week;
      const laterDistance = rows[after].week - row.week;
      row[field] = earlierDistance <= laterDistance ? original[before] : original[after];
    }
  });
}

function prepareYear(data, year) {
  const rows = data.filter(row => row.year === year)
    .map(row => ({ ...row }))
    .sort((a, b) => a.week - b.week);
  if (rows.length < 3) throw new Error(`Not enough data for ${year}.`);
  fillMissingValues(rows, "deaths");
  fillMissingValues(rows, "mean_temperature");
  rows.forEach(row => {
    if (!Number.isFinite(row.mortality_reference) || !Number.isFinite(row.temperature_reference)) {
      throw new Error(`Missing reference in week ${row.week}.`);
    }
    row.deathDeviation = row.deaths - row.mortality_reference;
    row.temperatureDeviation = row.mean_temperature - row.temperature_reference;
  });
  return rows;
}

// Discover years from the data rather than assuming a fixed date range.
function prepareAllYears(data) {
  if (!data.length) throw new Error("The CSV contains no weekly observations.");
  if (data.some(row => !Number.isInteger(row.year))) {
    throw new Error("Every observation must have a valid year.");
  }
  const years = [...new Set(data.map(row => row.year))].sort((a, b) => a - b);
  return years.map(year => prepareYear(data, year));
}

// Give each year equal weight in each week, after filling gaps within that year.
// CSV reference columns are historical references, not the means of this period.
function preparePeriodAverage(data, firstYear = 1840, lastYear = 1849) {
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const yearRows = years.map(year => prepareYear(data, year));
  const weeks = yearRows[0].map(row => row.week);
  yearRows.forEach((rows, index) => {
    if (new Set(rows.map(row => row.week)).size !== rows.length ||
        rows.length !== weeks.length || rows.some((row, i) => row.week !== weeks[i])) {
      throw new Error(`Weekly coverage for ${years[index]} does not match ${firstYear}.`);
    }
  });
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const allRows = yearRows.flat();
  const mortalityReference = mean(allRows.map(row => row.deaths));
  const temperatureReference = mean(allRows.map(row => row.mean_temperature));
  const rows = weeks.map((week, index) => {
    const samples = yearRows.map(rows => rows[index]);
    // Month labels are a seasonal guide: use the most common week-ending month.
    const months = samples.map(row => new Date(row.week_ending).getUTCMonth());
    const counts = Array.from({ length: 12 }, (_, month) => months.filter(value => value === month).length);
    const deaths = mean(samples.map(row => row.deaths));
    const temperature = mean(samples.map(row => row.mean_temperature));
    const deathEstimates = samples.filter(row => row.deaths_estimated).length;
    const temperatureEstimates = samples.filter(row => row.mean_temperature_estimated).length;
    return {
      week, month: counts.indexOf(Math.max(...counts)), years: samples.length,
      deaths, mean_temperature: temperature,
      mortality_reference: mortalityReference, temperature_reference: temperatureReference,
      deathDeviation: deaths - mortalityReference,
      temperatureDeviation: temperature - temperatureReference,
      deaths_estimated: deathEstimates > 0, mean_temperature_estimated: temperatureEstimates > 0,
      deaths_estimate_count: deathEstimates, temperature_estimate_count: temperatureEstimates
    };
  });
  return { rows, years, observationCount: allRows.length, mortalityReference, temperatureReference,
    deathEstimates: allRows.filter(row => row.deaths_estimated).length,
    temperatureEstimates: allRows.filter(row => row.mean_temperature_estimated).length };
}

// Find the largest connected signed region, joining December back to January.
// At equal angular spacing, squared radial differences weight each week's area.
function largestRadialRegion(radii, baseline, sign) {
  const belongs = radius => sign * (radius - baseline) > 0;
  const breakIndex = radii.findIndex(radius => !belongs(radius));
  const start = breakIndex < 0 ? 0 : (breakIndex + 1) % radii.length;
  let largest = null;
  let current = null;
  for (let step = 0; step < radii.length; step++) {
    const index = (start + step) % radii.length;
    if (!belongs(radii[index])) {
      current = null;
      continue;
    }
    const area = Math.abs(radii[index] ** 2 - baseline ** 2);
    if (!current) current = { area: 0, peakArea: -1, index };
    current.area += area;
    if (area > current.peakArea) {
      current.peakArea = area;
      current.index = index;
    }
    if (!largest || current.area > largest.area) largest = { ...current };
  }
  return largest;
}

// Node uses these exports for tests; the browser uses the functions above.
if (typeof module !== "undefined") {
  module.exports = { toNumber, fillMissingValues, prepareYear, prepareAllYears, preparePeriodAverage, largestRadialRegion };
}
