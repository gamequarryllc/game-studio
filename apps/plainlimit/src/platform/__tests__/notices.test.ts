import type { NotificationPermissionsStatus } from 'expo-notifications';

import { answerOf } from '../notices';

// The module sets up the phone's handler as it loads; a test has no phone.
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));

type Answer = Pick<NotificationPermissionsStatus, 'granted' | 'status' | 'ios'>;
const ios = (status: number, granted = false): Answer => ({ granted, status: (granted ? 'granted' : status === 0 ? 'undetermined' : 'denied') as Answer['status'], ios: { status } as unknown as Answer['ios'] });

describe('whether notifications are allowed', () => {
  it('is not asked yet until the iPhone has put its question', () => {
    expect(answerOf(ios(0))).toBe('unasked');
  });

  it('is off once turned down', () => {
    expect(answerOf(ios(1))).toBe('off');
  });

  it('is on when allowed, quietly or for a while included', () => {
    expect(answerOf(ios(2, true))).toBe('on');
    expect(answerOf(ios(3))).toBe('on');
    expect(answerOf(ios(4))).toBe('on');
  });

  it('goes by the plain answer when the iPhone gives no detail', () => {
    expect(answerOf({ granted: false, status: 'undetermined' as Answer['status'] })).toBe('unasked');
    expect(answerOf({ granted: false, status: 'denied' as Answer['status'] })).toBe('off');
    expect(answerOf({ granted: true, status: 'granted' as Answer['status'] })).toBe('on');
  });
});
