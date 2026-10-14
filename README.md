# Farr's Visualisation

Radial diagrams of London's weekly temperature and deaths for **every year
1840–1850**, followed by a final **1840–1849 average** diagram. Four diagrams
per row place the average in the last position of the third row. Compact column
spacing makes the diagrams larger, and titles sit just above each chart. Rows
reserve extra space only where peaks extend vertically. All panels
use the same radial scales, with room for each year's largest observations.
The month circle and labels have fixed radii across all diagrams. Mortality
peaks, including 1849, spill beyond this circle without expanding it or changing
the scales. Labels switch to plain white where they cross black mortality areas, without
text outlines, and points beyond
the circle retain their hover details.
Smaller screens can scroll horizontally through the four columns.

Click any year heading or diagram (including the average) to open an enlarged
view. Keyboard users can Tab to a heading and press Enter or Space. The enlarged
view retains the fixed month rim, mortality overflow, hover details and keyboard
inspection. Close, Escape or a click on the backdrop returns to the grid and
restores focus to the heading. On small screens the enlarged chart can scroll.

The yearly diagrams use each year’s `temperature_reference` and
`mortality_reference` from the CSV. Reference circles, colours and tooltip
deviations all use those values. Their tooltips show dates, weekly values and
estimates. The final panel uses the computed decade means
and shows ten-year weekly averages. 1850 appears as its own panel but is excluded
from the decade average.

Run from this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. An internet connection is needed to load D3 from
jsDelivr.

## Reading the final average diagram

The 52 spokes run clockwise by week number, starting at twelve o'clock. Each
point is the arithmetic mean of that week's values across the ten years.
Every month label, including January, is centred in its section.
Month labels use the most common week-ending month for each week number;
they are a seasonal guide, not a single year's dates.

- The inner series shows average temperature: red above the overall mean,
  blue below it.
- The outer series shows average weekly deaths: black above the overall mean,
  white below it. The CSV contains counts, not population-adjusted rates.
- Dashed reference circles show the computed overall means: **46.663461538…**
  temperature units and **956.355769230…** deaths per week. These use all
  520 weekly observations in 1840–1849, including estimated missing values.
- Radial position encodes each weekly mean. Distance from its reference
  circle encodes the signed deviation: outward is above, inward is below.
- The ten solid grid circles retain horizontal death-count ticks (200–1,100)
  and vertical temperature ticks (20–110). The reference circles use their
  actual positions on these scales; they are not fixed to grid circles.
- Hover a spoke or point, or Tab to a point, for weekly means, signed
  deviations and the number of estimated inputs out of ten. Escape hides
  the tooltip. Displayed details are rounded to two decimals; calculations
  and geometry retain full precision.
- Dashed point halos identify means containing estimated inputs. Grey points
  indicate zero deviation. Salubrity/Mortality and Cold/Hot label the largest
  connected below/above-average regions.

Temperature units are unspecified in the CSV. Closed Catmull–Rom curves
interpolate the weekly means; the curve between points is not an additional
observation. Only the area between each trend and its reference circle is
filled, with colours clipped at the reference circle.

## Calculation and missing values

`preparePeriodAverage()` in `chart-data.js` selects 1840–1849 and calls
`prepareYear()` for each year. Gaps are filled separately for temperature and
deaths, using the existing method:

- Single internal gaps use the mean of the adjacent recorded values.
- Consecutive gaps use the nearest original recorded week, with ties going
  to the earlier week.
- End gaps use the nearest recorded value within the same year.

The selected decade has 100 missing death counts and 43 missing temperatures.
Estimates are never used as neighbours for other estimates. The source CSV
and input rows remain unchanged. Missing years, duplicate weeks or unequal
week coverage cause an error rather than silently changing the weighting.

For metric `x`, week `w`, and year `y`:

```text
weekly_mean[w] = sum(x[y,w] for y in 1840..1849) / 10
overall_mean = sum(x[y,w] for all 520 selected year-weeks) / 520
deviation[w] = weekly_mean[w] - overall_mean
```

The CSV’s reference columns supply the yearly diagrams’ baselines, but do not
supply the final diagram’s overall means. Neither the previous fixed display baselines (50 and 1,000)
nor the 1850 observations affect the final average diagram.

Run the data checks:

```sh
node --test chart-data.test.cjs
```

Tests cover gap filling, period selection, equal year weighting, deviations,
source preservation, coverage errors and connected radial regions.

The overview footer contains only the colour legend and interaction instructions.
Calculation and data notes are kept in this README; weekly details remain in
hover/focus tooltips and the enlarged view.
