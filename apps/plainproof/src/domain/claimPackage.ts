import { claimedItems } from './actions';
import { displayDateTime, displayYmd } from './dates';
import { formatMoney } from './money';
import { claimFileLabel, claimReference, reportTitle } from './report';
import { claimSummary, claimTitle, lossCountLine, plural } from './selectors';
import { LOSS_CAUSE_LABELS, LOSS_LABELS, type Claim, type Doc } from './types';

// The claim package: one .zip for the adjuster with everything about the
// claimed items in folders a person can find their way around. This file only
// plans it (names and where each piece comes from); state/operations.ts reads
// the files and writes the zip.

export type PackageSource =
  | { kind: 'report' }
  | { kind: 'csv' }
  | { kind: 'text'; text: string }
  | { kind: 'photo'; id: string }
  | { kind: 'file'; name: string };

export interface PackageEntry {
  path: string;
  source: PackageSource;
}

/** A name that is safe as a file or folder on any computer: no slashes or other reserved marks, not too long. */
export function safeName(text: string, max = 60): string {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '');
  const short = cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned;
  return short || 'Untitled';
}

function withExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}

/** "Fern-Cottage-claim-package-CL-2026-0042-2026-11-15": the claim's number (or name) in it, so two claims' packages can't be mixed up. */
export function claimPackageName(doc: Doc, claim: Claim, generatedAt: number): string {
  const d = new Date(generatedAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = safeName(reportTitle(doc), 40).replace(/\s+/g, '-');
  const label = claimFileLabel(claim);
  return `${base}-claim-package-${label ? `${label}-` : ''}${stamp}`;
}

export function claimPackagePlan(doc: Doc, claim: Claim, opts: { generatedAt: number; reportExt: 'pdf' | 'html'; appVersion?: string }): PackageEntry[] {
  const items = claimedItems(doc, claim.id);
  const rooms = new Map(doc.rooms.map((r) => [r.id, r]));
  const entries: PackageEntry[] = [
    { path: `Schedule of loss.${opts.reportExt}`, source: { kind: 'report' } },
    { path: 'Schedule of loss.csv', source: { kind: 'csv' } },
    { path: 'Read me.txt', source: { kind: 'text', text: readMe(doc, claim, opts) } },
  ];

  const width = String(items.length).length;
  items.forEach((item, i) => {
    const room = rooms.get(item.roomId)?.name ?? 'No room';
    const folder = `Items/${String(i + 1).padStart(Math.max(2, width), '0')} ${safeName(`${room} - ${item.name}`)}`;
    item.photos.forEach((p, n) => entries.push({ path: `${folder}/Photo ${n + 1}.jpg`, source: { kind: 'photo', id: p.id } }));
    item.receipts.forEach((p, n) => entries.push({ path: `${folder}/Receipt ${n + 1}.jpg`, source: { kind: 'photo', id: p.id } }));
  });

  // The walk-through videos of every room a claimed item was in.
  const claimedRooms = new Set(items.map((i) => i.roomId));
  for (const room of doc.rooms) {
    if (!claimedRooms.has(room.id)) continue;
    room.videos.forEach((v, n) =>
      entries.push({ path: `Videos/${safeName(room.name)} walk-through ${n + 1}.${v.ext}`, source: { kind: 'file', name: `${v.id}.${v.ext}` } }),
    );
  }

  const used = new Set<string>();
  for (const a of doc.policy.documents) {
    const ext = a.kind === 'pdf' ? 'pdf' : 'jpg';
    const stem = safeName(a.name.replace(/\.(pdf|jpe?g|png|heic)$/i, ''));
    let path = `Policy/${withExt(stem, ext)}`;
    for (let n = 2; used.has(path.toLowerCase()); n += 1) path = `Policy/${stem} (${n}).${ext}`;
    used.add(path.toLowerCase());
    entries.push({ path, source: { kind: 'file', name: `${a.id}.${ext}` } });
  }
  return entries;
}

function readMe(doc: Doc, claim: Claim, opts: { generatedAt: number; reportExt: 'pdf' | 'html'; appVersion?: string }): string {
  const summary = claimSummary(doc, claim);
  const lines: string[] = [];
  lines.push(`Insurance claim: ${reportTitle(doc)}`);
  if (claim.name) lines.push(`Claim: ${claimTitle(claim)}`);
  if (doc.profile.ownerName) lines.push(`Prepared for: ${doc.profile.ownerName}`);
  if (doc.profile.address) lines.push(`Address: ${doc.profile.address.replace(/\s*\n\s*/g, ', ')}`);
  if (doc.profile.insurer) lines.push(`Insurer: ${doc.profile.insurer}`);
  if (doc.profile.policyNumber) lines.push(`Policy number: ${doc.profile.policyNumber}`);
  if (claim.claimNumber) lines.push(`Claim number: ${claim.claimNumber}`);
  if (claim.lossDate) lines.push(`Date of loss: ${displayYmd(claim.lossDate)}`);
  if (claim.cause) lines.push(`Cause: ${LOSS_CAUSE_LABELS[claim.cause]}`);
  lines.push(`Items: ${summary.count}${summary.count ? ` (${lossCountLine(summary.byStatus)})` : ''}`);
  lines.push(`Value claimed: ${formatMoney(summary.totalCents, doc.settings.currency)}${summary.unvalued ? `, with ${plural(summary.unvalued, 'item')} not valued` : ''}`);
  lines.push(`Prepared: ${displayDateTime(opts.generatedAt)}${opts.appVersion ? ` with Plainproof ${opts.appVersion}` : ''}, report reference ${claimReference(doc, claim)}`);
  lines.push('');
  lines.push('In this package');
  lines.push(`- Schedule of loss.${opts.reportExt}: every item in the claim with its photos, details, value and what happened to it.`);
  lines.push('- Schedule of loss.csv: the same list as a spreadsheet, for the adjuster’s own forms.');
  lines.push('- Items: a folder for each item, numbered as in the schedule, with every photo and receipt.');
  const claimedRooms = new Set(claimedItems(doc, claim.id).map((i) => i.roomId));
  if (doc.rooms.some((r) => claimedRooms.has(r.id) && r.videos.length > 0)) lines.push('- Videos: walk-through videos of the rooms the items were in.');
  if (doc.policy.documents.length > 0) lines.push('- Policy: the policy documents kept with this inventory.');
  lines.push('');
  lines.push('Values are the owner’s own figures: what each thing would cost to replace, or the price paid where no replacement value was given. The schedule says which. Each photo’s date taken, where the camera recorded one, is printed in the schedule.');
  if (claim.description) {
    lines.push('');
    lines.push('What happened');
    lines.push(claim.description);
  }
  const notes = claimedItems(doc, claim.id).filter((i) => i.lossNote);
  if (notes.length > 0) {
    lines.push('');
    lines.push('Notes on items');
    for (const i of notes) lines.push(`- ${i.name} (${LOSS_LABELS[i.loss]}): ${i.lossNote.replace(/\s*\n\s*/g, ' ')}`);
  }
  // Windows' Notepad reads this best with CRLF line ends.
  return `${lines.join('\r\n')}\r\n`;
}
