// "Use your phone less": plain advice for staying under the battery, each with
// where to do it. The battery sets the limit; these make it easier to keep.
// Settings paths are iOS 26's. Each tip has a small looping demo above its
// words (src/ui/tipDemos).

import type { TipDemoName } from './tipDemos/demos';

export interface Tip {
  title: string;
  why: string;
  how?: string;
  demo: TipDemoName;
}

export const TIPS: readonly Tip[] = [
  {
    title: 'Turn the screen gray',
    demo: 'gray',
    why: 'Feeds and games are far less tempting without color.',
    how: 'Settings app > Accessibility > Display & Text Size > Color Filters: turn it on and pick Grayscale. To switch it with a triple-click of the side button: Accessibility > Accessibility Shortcut > Color Filters.',
  },
  {
    title: 'Move time wasters to your computer',
    demo: 'computer',
    why: 'Use social media, video, shopping and news on the computer, and delete those apps from the phone. Sitting down for it keeps it a choice, not a reflex.',
  },
  {
    title: 'Keep only tools on the first home screen',
    demo: 'homeScreen',
    why: 'Phone, Messages, Maps, Camera, Calendar. Everything else goes to the App Library, a swipe away.',
    how: 'Hold an app > Remove App > Remove from Home Screen.',
  },
  {
    title: 'Only people get notifications',
    demo: 'notifications',
    why: 'Calls and messages stay on. Every other app waits until you open it.',
    how: 'Settings app > Notifications > each app > turn off Allow Notifications.',
  },
  {
    title: 'Charge it outside the bedroom',
    demo: 'bedroom',
    why: 'Use a cheap alarm clock, so the phone isn’t the first and last thing you see each day.',
  },
  {
    title: 'Put it in another room when you work or eat',
    demo: 'otherRoom',
    why: 'Out of reach beats willpower.',
  },
  {
    title: 'Lower the goal one step at a time',
    demo: 'lowerGoal',
    why: 'After a week under your goal, take 15 minutes off it. Small steps stick.',
    how: 'Plainlimit > Settings > Daily goal.',
  },
  {
    title: 'Choose Work for it or Locked',
    demo: 'emptyChoice',
    why: 'Warn is easy to tap through. Sums or a hard stop give you a moment to put the phone down.',
    how: 'Plainlimit > Settings > When the battery is empty.',
  },
  {
    title: 'Know what you’ll do instead',
    demo: 'instead',
    why: 'An empty moment fills itself with the phone. Keep a book, a walk or a call ready for it.',
  },
];
