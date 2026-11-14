// "Use your phone less": plain advice for staying under the battery, each with
// where to do it. The battery sets the limit; these make it easier to keep.
// Settings paths are iOS 26's.

export interface Tip {
  title: string;
  why: string;
  how?: string;
}

export const TIPS: readonly Tip[] = [
  {
    title: 'Turn the screen gray',
    why: 'Feeds and games are far less tempting without color.',
    how: 'Settings app > Accessibility > Display & Text Size > Color Filters: turn it on and pick Grayscale. To switch it with a triple-click of the side button: Accessibility > Accessibility Shortcut > Color Filters.',
  },
  {
    title: 'Move time wasters to your computer',
    why: 'Use social media, video, shopping and news on the computer, and delete those apps from the phone. Sitting down for it keeps it a choice, not a reflex.',
  },
  {
    title: 'Delete the app that used the most',
    why: 'It is at the top of What used it on Today. If you need it now and then, use its website and don’t stay signed in.',
  },
  {
    title: 'Keep only tools on the first home screen',
    why: 'Phone, Messages, Maps, Camera, Calendar. Everything else goes to the App Library, a swipe away.',
    how: 'Hold an app > Remove App > Remove from Home Screen.',
  },
  {
    title: 'Only people get notifications',
    why: 'Calls and messages stay on. Every other app waits until you open it.',
    how: 'Settings app > Notifications > each app > turn off Allow Notifications.',
  },
  {
    title: 'Charge it outside the bedroom',
    why: 'Use a cheap alarm clock, so the phone isn’t the first and last thing you see each day.',
  },
  {
    title: 'Put it in another room when you work or eat',
    why: 'Out of reach beats willpower.',
  },
  {
    title: 'Lower the goal one step at a time',
    why: 'After a week under your goal, take 15 minutes off it. Small steps stick.',
    how: 'Plainlimit > Settings > Daily goal.',
  },
  {
    title: 'Choose Work for it or Locked',
    why: 'Warn is easy to tap through. Sums or a hard stop give you a moment to put the phone down.',
    how: 'Plainlimit > Settings > When the battery is empty.',
  },
  {
    title: 'Know what you’ll do instead',
    why: 'An empty moment fills itself with the phone. Keep a book, a walk or a call ready for it.',
  },
];
