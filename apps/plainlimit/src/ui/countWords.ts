// How the two ways of counting are described, on What counts and in setup.

export const EVERYTHING_ROWS = [
  ['Uses up the battery', 'Every app, always-allowed ones too'],
  ['Locks when empty', 'Every app except your always-allowed ones'],
] as const;

export const TICKED_ROWS = [
  ['Uses up the battery', 'Only the apps and categories you tick'],
  ['Locks when empty', 'Only those, and never an always-allowed one'],
] as const;

export const ALLOWED_EXPLAINED =
  'Always-allowed apps never lock, in either choice. They still use up the battery when they count: always with Everything, and with Only what I tick only if you tick them too.';
