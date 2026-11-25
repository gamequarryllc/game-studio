import { createElement } from 'react';

import type { IconName } from './icons';

// The web preview's look-alikes for the iPhone's symbols (icons.tsx), drawn
// as plain SVG shapes on a 24-point grid.

export type { IconName } from './icons';

const stroke = (c: string, w = 2.2) => `stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;

const DRAWN: Record<IconName, (c: string) => string> = {
  essentials: (c) => `<path fill="${c}" d="M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.9a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 10.1-7.5 10.1z"/>`,
  lock: (c) => `<rect fill="${c}" x="5" y="10.5" width="14" height="10.5" rx="2.8"/><path d="M8.3 10.5V8a3.7 3.7 0 0 1 7.4 0v2.5" ${stroke(c, 2.4)}/>`,
  recharge: (c) => `<path d="M3 17.5h18M7 17.5a5 5 0 0 1 10 0M12 6.5v2.2M5.3 9.8l1.5 1.5M18.7 9.8l-1.5 1.5" ${stroke(c)}/>`,
  widget: (c) => `<rect x="4" y="4" width="7" height="7" rx="2" fill="${c}"/><rect x="13" y="4" width="7" height="7" rx="2" fill="${c}" opacity=".55"/><rect x="4" y="13" width="16" height="7" rx="2" fill="${c}"/>`,
  tips: (c) => `<path d="M8.5 14.5a6 6 0 1 1 7 0c-.6.5-1 1.2-1 2v.5h-5v-.5c0-.8-.4-1.5-1-2zM9.8 20.5h4.4" ${stroke(c)}/>`,
  pro: (c) => `<path fill="${c}" d="M12 3.2l2.5 5.6 6.1.6-4.6 4.1 1.4 6-5.4-3.2-5.4 3.2 1.4-6-4.6-4.1 6.1-.6z"/>`,
  secondThought: (c) => `<path ${stroke(c, 1.9)} d="M8 12.5V5.6a1.4 1.4 0 0 1 2.8 0v5.6M10.8 10.6V4.2a1.4 1.4 0 0 1 2.8 0v6.4M13.6 10.8V5.2a1.4 1.4 0 0 1 2.8 0v7M16.4 12.4V8.4a1.4 1.4 0 0 1 2.8 0v6.2c0 4-2.8 6.8-6.6 6.8h-.8c-2.4 0-3.9-1-5.2-2.8l-2.9-4.2a1.5 1.5 0 0 1 2.3-1.9L8 14.2"/>`,
  lockMessage: (c) => `<path fill="${c}" d="M12 4c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.7C4 15 3 13.2 3 11.2 3 7.2 7 4 12 4z"/>`,
  sums: (c) => `<path d="M7 4.5v6M4 7.5h6M14.5 7.5h5.5M4.5 16.5h5.5M14.8 14.3l4.4 4.4M19.2 14.3l-4.4 4.4" ${stroke(c)}/>`,
  history: (c) => `<path d="M5 19.5v-6M10 19.5v-11M15 19.5v-8M20 19.5V5" ${stroke(c, 2.8)}/>`,
  pass: (c) => `<path fill="${c}" d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>`,
  warn: (c) => `<path d="M12 4.2 21 19.5H3z" ${stroke(c)}/><path d="M12 10v4.3" ${stroke(c, 2.4)}/><circle cx="12" cy="17" r="1.3" fill="${c}"/>`,
  phone: (c) => `<path fill="${c}" d="M7.2 3.5c.7-.3 1.5 0 1.9.7l1.4 2.7c.3.6.2 1.3-.3 1.8l-1.1 1.1c.9 1.9 2.4 3.4 4.3 4.3l1.1-1.1c.5-.5 1.2-.6 1.8-.3l2.7 1.4c.7.4 1 1.2.7 1.9-.6 1.7-2.2 2.8-4 2.6C9.9 18 5.3 13.4 4.6 7.5c-.2-1.8.9-3.4 2.6-4z"/>`,
  message: (c) => `<path fill="${c}" d="M12 4c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.7C4 15 3 13.2 3 11.2 3 7.200 7 4 12 4z"/>`,
  map: (c) => `<path fill="${c}" d="M12 2.8a6.7 6.7 0 0 0-6.7 6.7c0 4.8 6.7 11.7 6.7 11.7s6.7-6.9 6.7-11.7A6.7 6.7 0 0 0 12 2.8zm0 9.2a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>`,
  iphone: (c) => `<rect x="6.5" y="2.5" width="11" height="19" rx="2.8" ${stroke(c, 2)}/><path d="M10.5 18.3h3" ${stroke(c, 2)}/>`,
  battery: (c) => `<rect x="2.5" y="7" width="16.5" height="10" rx="2.6" ${stroke(c, 2)}/><path d="M21.5 10.5v3" ${stroke(c, 2)}/><rect x="5.3" y="9.8" width="7" height="4.4" rx="1" fill="${c}"/>`,
  bell: (c) => `<path fill="${c}" d="M12 3.2a6 6 0 0 0-6 6v3.6l-1.6 3a.9.9 0 0 0 .8 1.4h13.6a.9.9 0 0 0 .8-1.4l-1.6-3V9.2a6 6 0 0 0-6-6zM9.6 18.6a2.4 2.4 0 0 0 4.8 0z"/>`,
  bellOff: (c) => `<path fill="${c}" opacity=".9" d="M12 3.2a6 6 0 0 0-6 6v3.6l-1.6 3a.9.9 0 0 0 .8 1.4h13.6a.9.9 0 0 0 .8-1.4l-1.6-3V9.2a6 6 0 0 0-6-6z"/><path d="M5 5l14 14" ${stroke(c, 2.4)}/>`,
  refresh: (c) => `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2" ${stroke(c)}/>`,
  edit: (c) => `<path d="M5 19l1-4.2L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L9.2 18zM13.5 7.3l3.2 3.2" ${stroke(c, 2.1)}/>`,
  check: (c) => `<path d="M5 12.5l4.5 4.5L19 7.5" ${stroke(c, 2.8)}/>`,
};

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, style: { flex: 'none' }, dangerouslySetInnerHTML: { __html: DRAWN[name](color) } });
}
