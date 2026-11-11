import { ActionSheetIOS, Alert, Platform } from 'react-native';

// Questions the app asks: on iPhone these are the system's own alerts and
// action sheets. The web preview draws its own (dialogs.web.tsx). Both files
// end in .tsx on purpose: the bundler only swaps in a .web file whose ending
// matches this one's.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  cancelLabel?: string;
}

export interface Choice<T extends string> {
  key: T;
  label: string;
  destructive?: boolean;
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], { cancelable: true, onDismiss: () => resolve() });
  });
}

export function choose<T extends string>(opts: { title?: string; message?: string; choices: Choice<T>[] }): Promise<T | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      const labels = [...opts.choices.map((ch) => ch.label), 'Cancel'];
      const destructive = opts.choices.map((ch, i) => (ch.destructive ? i : -1)).filter((i) => i >= 0);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: opts.title, message: opts.message, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive },
        (index) => resolve(index < opts.choices.length ? opts.choices[index].key : null),
      );
      return;
    }
    Alert.alert(
      opts.title ?? '',
      opts.message,
      [
        ...opts.choices.map((ch) => ({ text: ch.label, style: ch.destructive ? ('destructive' as const) : ('default' as const), onPress: () => resolve(ch.key) })),
        { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export function ask(opts: { title: string; message?: string; placeholder?: string; initial?: string; confirmLabel: string }): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      // Alert.prompt only exists on iPhone, which is the only place this app ships.
      resolve(null);
      return;
    }
    Alert.prompt(
      opts.title,
      opts.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: opts.confirmLabel, onPress: (text?: string) => resolve(text ?? '') },
      ],
      'plain-text',
      opts.initial ?? '',
      'default',
    );
  });
}

/** Nothing to draw on iPhone: the system shows its own dialogs. */
export function DialogHost(): null {
  return null;
}
