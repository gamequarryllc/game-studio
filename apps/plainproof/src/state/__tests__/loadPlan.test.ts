import { DocError, emptyDoc } from '@/domain/doc';
import { libraryOf, parseLibraryText, serializeLibrary, type Library } from '@/domain/library';
import { planLoad } from '../loadPlan';

const good = serializeLibrary(libraryOf(emptyDoc(1)));
const parse = (text: string): Library => parseLibraryText(text, 2);

describe('planLoad', () => {
  it('starts fresh only when there is no file at all', () => {
    expect(planLoad({ kind: 'missing' }, { kind: 'missing' }, parse).kind).toBe('fresh');
  });

  it('opens the main file when it reads', () => {
    const plan = planLoad({ kind: 'text', text: good }, { kind: 'missing' }, parse);
    expect(plan).toMatchObject({ kind: 'open', recovered: false });
  });

  it('never treats a file that could not be read as a fresh install', () => {
    expect(planLoad({ kind: 'error' }, { kind: 'missing' }, parse)).toEqual({ kind: 'failed', reason: 'unreadable' });
    expect(planLoad({ kind: 'error' }, { kind: 'error' }, parse)).toEqual({ kind: 'failed', reason: 'unreadable' });
  });

  it('falls back to the spare when the main file is damaged or unreadable', () => {
    expect(planLoad({ kind: 'text', text: '{"broken' }, { kind: 'text', text: good }, parse)).toMatchObject({ kind: 'open', recovered: true });
    expect(planLoad({ kind: 'error' }, { kind: 'text', text: good }, parse)).toMatchObject({ kind: 'open', recovered: true });
  });

  it('fails, rather than starting empty, when both copies are damaged', () => {
    expect(planLoad({ kind: 'text', text: 'nope' }, { kind: 'text', text: 'nope' }, parse)).toEqual({ kind: 'failed', reason: 'unreadable' });
  });

  it('refuses a file from a newer version instead of rolling back to the spare', () => {
    const newer = JSON.stringify({ format: 'plainproof-library', version: 99, places: [] });
    expect(() => parse(newer)).toThrow(DocError);
    expect(planLoad({ kind: 'text', text: newer }, { kind: 'text', text: good }, parse)).toEqual({ kind: 'failed', reason: 'too-new' });
  });
});
