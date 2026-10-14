const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { toNumber, fillMissingValues, prepareYear, prepareAllYears, largestRadialRegion } = require("./chart-data.js");

function filled(values) {
  const rows = values.map((value, i) => ({ week: i + 1, deaths: value }));
  fillMissingValues(rows, "deaths");
  return rows.map(row => row.deaths);
}

test("missing values stay distinct from zero", () => {
  assert.equal(toNumber("?"), null);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("0"), 0);
  assert.equal(toNumber("48.4"), 48.4);
});

test("single gaps average their two recorded neighbours", () => {
  assert.deepEqual(filled([10, null, 30, null, 50]), [10, 20, 30, 40, 50]);
});

test("consecutive gaps use nearest originals, with earlier values winning ties", () => {
  assert.deepEqual(filled([10, null, null, null, 50]), [10, 10, 10, 50, 50]);
  assert.deepEqual(filled([10, null, null, 50]), [10, 10, 50, 50]);
});

test("year boundaries use values within the year, without wrapping", () => {
  assert.deepEqual(filled([null, null, 10, 30, null]), [10, 10, 10, 30, 30]);
  assert.throws(() => filled([null, null]), /No recorded values/);
});

test("1840 data is complete after filling, with source rows preserved", () => {
  // This fixture contains simple unquoted fields.
  const [header, ...lines] = fs.readFileSync(`${__dirname}/farr.csv`, "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  const data = lines.map(line => Object.fromEntries(line.split(",").map((value, i) =>
    [columns[i], columns[i] === "week_ending" ? value : toNumber(value)])));
  const original = JSON.stringify(data);
  const rows = prepareYear(data, 1840);
  assert.equal(rows.length, 52);
  assert.ok(rows.every((row, i) => row.year === 1840 && row.week === i + 1));
  assert.ok(rows.every(row => Number.isFinite(row.deathDeviation) && Number.isFinite(row.temperatureDeviation)));
  assert.equal(rows.filter(row => row.deaths_estimated).length, 5);
  assert.equal(rows.filter(row => row.mean_temperature_estimated).length, 5);
  assert.equal(rows[0].deaths, 980);
  assert.equal(rows[2].deaths, 907.5);
  assert.equal(rows[37].mean_temperature, rows[36].mean_temperature);
  assert.equal(rows[38].mean_temperature, rows[36].mean_temperature);
  assert.equal(rows[39].mean_temperature, rows[40].mean_temperature);
  assert.equal(JSON.stringify(data), original);
});


test("region labels join matching areas across the year boundary", () => {
  // The two end sections together outweigh the isolated middle section.
  const region = largestRadialRegion([12, 9, 13, 9, 12], 10, 1);
  assert.equal(region.area, 88);
  assert.ok([0, 4].includes(region.index));
});

test("region labels use area rather than just the highest point", () => {
  const region = largestRadialRegion([13, 9, 12, 12, 9], 10, 1);
  assert.equal(region.area, 88);
  assert.equal(region.index, 2);
  assert.equal(largestRadialRegion([10, 10, 11], 10, -1), null);
  assert.equal(largestRadialRegion([8, 8, 10, 7, 10], 10, -1).index, 0);
});


test("all years are discovered and sorted, with missing values filled within each year", () => {
  const row = (year, week, deaths) => ({ year, week, deaths, mean_temperature: 50,
    mortality_reference: 1000, temperature_reference: 50 });
  const data = [row(1851, 2, null), row(1840, 3, 300), row(1851, 1, 1000),
    row(1840, 1, 100), row(1851, 3, 1400), row(1840, 2, null)];
  const original = JSON.stringify(data);
  const years = prepareAllYears(data);
  assert.deepEqual(years.map(rows => rows[0].year), [1840, 1851]);
  assert.equal(years[0][1].deaths, 200);
  assert.equal(years[1][1].deaths, 1200);
  assert.equal(JSON.stringify(data), original);
  const added = [...data, row(1901, 3, 900), row(1901, 2, 1000), row(1901, 1, 1100)];
  assert.deepEqual(prepareAllYears(added).map(rows => rows[0].year), [1840, 1851, 1901]);
  assert.throws(() => prepareAllYears([]), /no weekly observations/);
  assert.throws(() => prepareAllYears([row(null, 1, 100)]), /valid year/);
});

const { preparePeriodAverage } = require('./chart-data.js');
function csvRows() {
  const [header, ...lines] = fs.readFileSync(`${__dirname}/farr.csv`, 'utf8').trim().split(/\r?\n/);
  const columns = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, i) =>
    [columns[i], columns[i] === 'week_ending' ? value : toNumber(value)])));
}

test('decade means use ten years, exclude 1850 and preserve the source', () => {
  const data = csvRows();
  const original = JSON.stringify(data);
  const period = preparePeriodAverage(data);
  assert.deepEqual(period.years, Array.from({length: 10}, (_, i) => 1840 + i));
  assert.equal(period.observationCount, 520);
  assert.equal(period.rows.length, 52);
  assert.ok(period.rows.every(row => row.years === 10));
  const changed1850 = data.map(row => row.year === 1850 ? {...row, deaths: 1e9, mean_temperature: 1e9} : row);
  assert.deepEqual(preparePeriodAverage(changed1850), period);
  const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
  const prepared = period.years.map(year => prepareYear(data, year));
  for (const row of period.rows) {
    const samples = prepared.map(rows => rows.find(sample => sample.week === row.week));
    assert.equal(row.deaths, mean(samples.map(sample => sample.deaths)));
    assert.equal(row.mean_temperature, mean(samples.map(sample => sample.mean_temperature)));
    assert.equal(row.deathDeviation, row.deaths - period.mortalityReference);
    assert.equal(row.temperatureDeviation, row.mean_temperature - period.temperatureReference);
    assert.equal(row.deaths_estimate_count, samples.filter(sample => sample.deaths_estimated).length);
    assert.ok(row.month >= 0 && row.month <= 11);
  }
  assert.ok(Math.abs(mean(period.rows.map(row => row.deathDeviation))) < 1e-10);
  assert.ok(Math.abs(mean(period.rows.map(row => row.temperatureDeviation))) < 1e-10);
  assert.equal(JSON.stringify(data), original);
});

test('unequal weekly coverage and missing years cannot silently change weighting', () => {
  const data = csvRows();
  assert.throws(() => preparePeriodAverage(data.filter(row => !(row.year === 1845 && row.week === 12))), /coverage/);
  assert.throws(() => preparePeriodAverage(data.filter(row => row.year !== 1845)), /Not enough data/);
  assert.throws(() => preparePeriodAverage([...data, data[0]]), /coverage/);
});

test('simple known means replace the CSV reference values', () => {
  const data = [1840, 1841].flatMap((year, i) => [1, 2, 3].map(week => ({
    year, week, week_ending: `${year}-01-${String(week * 7).padStart(2, '0')}`,
    deaths: week * 10 + i * 20, mean_temperature: week * 2 + i * 4,
    mortality_reference: 999, temperature_reference: 99
  })));
  const result = preparePeriodAverage(data, 1840, 1841);
  assert.equal(result.mortalityReference, 30);
  assert.equal(result.temperatureReference, 6);
  assert.deepEqual(result.rows.map(row => row.deaths), [20, 30, 40]);
  assert.deepEqual(result.rows.map(row => row.deathDeviation), [-10, 0, 10]);
  assert.deepEqual(result.rows.map(row => row.temperatureDeviation), [-2, 0, 2]);
});
