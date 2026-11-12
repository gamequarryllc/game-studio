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

  const facts: string[] = [];
  if (thing.detail) facts.push(esc(thing.detail));
  if (reading) facts.push(`Odometer ${esc(distanceText(reading.value, unit))} on ${esc(displayYmd(reading.ymd))}`);
  facts.push(`${done.length} ${done.length === 1 ? 'entry' : 'entries'}${total !== null ? `, ${esc(formatMoney(total, currency))} in all` : ''}`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(thing.name)}: service record</title>
<style>
  @page { size: auto; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.4 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #171b1f; margin: 0; padding: 0; }
  header { border-bottom: 2pt solid #171b1f; padding-bottom: 9pt; margin-bottom: 16pt; }
  .kicker { font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #59626b; }
  h1 { font-size: 21pt; line-height: 1.15; margin: 3pt 0 5pt; font-weight: 700; }
  .facts { color: #3b434a; }
  .facts span + span::before { content: "  ·  "; color: #8e969d; }
  h2 { font-size: 11pt; margin: 18pt 0 5pt; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; font-weight: 600; color: #59626b; border-bottom: 0.75pt solid #171b1f; padding: 4pt 8pt 4pt 0; }
  td { vertical-align: top; padding: 6pt 8pt 6pt 0; border-bottom: 0.5pt solid #d8dcda; }
  tr { page-break-inside: avoid; }
  th.num, td.num { text-align: right; white-space: nowrap; padding-right: 0; font-variant-numeric: tabular-nums; }
  td.date { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .what { font-weight: 600; }
  .note { color: #59626b; font-size: 9.5pt; }
  tfoot td { border-bottom: 0; border-top: 0.75pt solid #171b1f; font-weight: 700; }
  .empty { color: #59626b; padding: 8pt 0; }
  footer { margin-top: 22pt; font-size: 8.5pt; color: #59626b; }
</style>
</head>
<body>
<header>
  <div class="kicker">Service record</div>
  <h1>${esc(thing.name)}</h1>
  <div class="facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div>
</header>

<h2>What has been done</h2>
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
    : `<h2>What is kept up</h2>
<table>
<thead><tr><th>Job</th><th>How often</th><th>Last done</th><th>Next</th></tr></thead>
<tbody>
${jobRows}
</tbody>
</table>`
}

<footer>Kept with Plainkeep. Printed ${esc(displayYmd(today))}. Dates, readings and costs are as the owner entered them.</footer>
</body>
</html>`;
}
