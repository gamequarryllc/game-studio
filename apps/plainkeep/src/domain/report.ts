import { displayYmd, todayYmd } from './dates';
import { distanceText, dueText, repeatText } from './labels';
import { formatMoney } from './money';
import { currentReading, dueOf, lastDone } from './schedule';
import { sumCost } from './selectors';
import type { Doc, Thing } from './types';

// The service record: one thing's whole history on paper, for a buyer, a
// landlord or a warranty claim. Plain HTML that the iPhone prints to a PDF.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function reportBaseName(thing: Thing, now: number): string {
  const safe = thing.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 40) || 'Service record';
  return `${safe} service record ${todayYmd(now)}`;
}

export function serviceRecordHtml(doc: Doc, thingId: string, now: number): string {
  const thing = doc.things.find((t) => t.id === thingId);
  if (!thing) return '';
  const today = todayYmd(now);
  const unit = doc.settings.distanceUnit;
  const currency = doc.settings.currency;
  const vehicle = thing.kind === 'vehicle';
  const done = doc.entries
    .filter((e) => e.thingId === thing.id && !e.skipped)
    .sort((a, b) => (a.ymd === b.ymd ? b.createdAt - a.createdAt : a.ymd < b.ymd ? 1 : -1));
  const jobs = doc.jobs.filter((j) => j.thingId === thing.id && !j.paused);
  const total = sumCost(done);
  const reading = vehicle ? currentReading(thing) : null;

  const logRows = done
    .map(
      (e) => `<tr>
  <td class="date">${esc(displayYmd(e.ymd))}</td>
  <td><div class="what">${esc(e.title)}</div>${e.note ? `<div class="note">${esc(e.note).replace(/\n/g, '<br>')}</div>` : ''}</td>
  ${vehicle ? `<td class="num">${e.distance === null ? '' : esc(distanceText(e.distance, unit))}</td>` : ''}
  <td class="num">${e.cost === null ? '' : esc(formatMoney(e.cost, currency))}</td>
</tr>`,
    )
    .join('\n');

  const jobRows = jobs
    .map((j) => {
      const last = lastDone(j.id, doc.entries);
      const due = dueOf(j, doc, today);
      return `<tr>
  <td><div class="what">${esc(j.name)}</div>${j.note ? `<div class="note">${esc(j.note).replace(/\n/g, '<br>')}</div>` : ''}</td>
  <td>${esc(repeatText(j, unit))}</td>
  <td>${last ? esc(displayYmd(last.ymd)) : 'Not logged'}</td>
  <td>${esc(dueText(due, unit, today))}</td>
</tr>`;
    })
    .join('\n');

  const first = done.length > 0 ? done[done.length - 1].ymd : null;
  const facts: [string, string][] = [];
  if (thing.detail) facts.push(['Details', esc(thing.detail)]);
  if (reading) facts.push(['Odometer', `${esc(distanceText(reading.value, unit))} <span class="soft">on ${esc(displayYmd(reading.ymd))}</span>`]);
  facts.push(['Period', first ? `${esc(displayYmd(first))} to ${esc(displayYmd(today))}` : `To ${esc(displayYmd(today))}`]);
  facts.push(['Entries', String(done.length)]);
  if (total !== null) facts.push(['Total spent', esc(formatMoney(total, currency))]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(thing.name)}: service record</title>
<style>
  @page { margin: 0.75in; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 10.5pt/1.42 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #161a1e; margin: 0; }
  /* On a screen (the web preview) the page gets the margins paper has. */
  @media screen { body { max-width: 7in; margin: 0 auto; padding: 0.6in 0.5in; } }
  .plate { font-family: "Avenir Next Condensed", "HelveticaNeue-CondensedBold", "Arial Narrow", sans-serif; font-weight: 600; letter-spacing: 0.01em; }
  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18pt; border-bottom: 2.25pt solid #1d4f7c; padding-bottom: 10pt; }
  .kicker { font-size: 10pt; color: #1d4f7c; }
  h1 { font-size: 30pt; line-height: 1.02; margin: 2pt 0 0; }
  .made { font-size: 8.5pt; color: #57616a; text-align: right; white-space: nowrap; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(1.5in, 1fr)); gap: 9pt 18pt; margin: 12pt 0 0; padding: 0; }
  dt { font-size: 8pt; color: #57616a; margin: 0; }
  dd { margin: 1pt 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .soft { font-weight: 400; color: #57616a; }
  h2 { font-size: 15pt; margin: 22pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8pt; font-weight: 600; color: #57616a; border-bottom: 0.75pt solid #161a1e; padding: 4pt 10pt 4pt 0; }
  td { vertical-align: top; padding: 6.5pt 10pt 6.5pt 0; border-bottom: 0.5pt solid #d5dad8; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  th.num, td.num { text-align: right; white-space: nowrap; padding-right: 0; font-variant-numeric: tabular-nums; }
  td.date { white-space: nowrap; font-variant-numeric: tabular-nums; width: 1.05in; }
  .what { font-weight: 600; }
  .note { color: #57616a; font-size: 9.5pt; }
  tfoot td { border-bottom: 0; border-top: 0.75pt solid #161a1e; font-weight: 700; }
  .empty { color: #57616a; padding: 8pt 0; }
  footer { margin-top: 24pt; padding-top: 8pt; border-top: 0.5pt solid #d5dad8; font-size: 8.5pt; color: #57616a; }
</style>
</head>
<body>
<header>
  <div>
    <div class="kicker plate">Service record</div>
    <h1 class="plate">${esc(thing.name)}</h1>
  </div>
  <div class="made">Printed ${esc(displayYmd(today))}</div>
</header>
<dl>
${facts.map(([k, v]) => `  <div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n')}
</dl>

<h2 class="plate">Work done</h2>
${
  done.length === 0
    ? '<div class="empty">Nothing has been logged yet.</div>'
    : `<table>
<thead><tr><th>Date</th><th>Work</th>${vehicle ? '<th class="num">Odometer</th>' : ''}<th class="num">Cost</th></tr></thead>
<tbody>
${logRows}
</tbody>
${total !== null ? `<tfoot><tr><td colspan="${vehicle ? 3 : 2}">Total</td><td class="num">${esc(formatMoney(total, currency))}</td></tr></tfoot>` : ''}
</table>`
}

${
  jobs.length === 0
    ? ''
    : `<h2 class="plate">Maintenance schedule</h2>
<table>
<thead><tr><th>Job</th><th>How often</th><th>Last done</th><th>Next</th></tr></thead>
<tbody>
${jobRows}
</tbody>
</table>`
}

<footer>Kept with Plainkeep. Dates, readings and costs are as the owner entered them.</footer>
</body>
</html>`;
}
