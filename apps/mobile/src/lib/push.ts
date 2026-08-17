import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

/* Push plumbing for 7A.

   Two hard constraints worth knowing before touching this:

   1. **A push token needs an EAS project id.** `getExpoPushTokenAsync` refuses without one, and it
      only exists after someone runs `eas init` against the Expo account that will ship the app —
      which writes `extra.eas.projectId` into app.json. Until then `projectId()` returns null and
      `registerForPush` reports 'no-project' rather than throwing an opaque error.
   2. **Expo Go on iOS cannot get a token at all.** Expo removed remote-push support from Expo Go in
      SDK 53, so this whole path only works in a dev build or a store build. The permission *prompt*
      still appears in Expo Go, which is why the result distinguishes 'granted' (the OS said yes)
      from actually holding a token. */

export type PermissionResult = 'granted' | 'denied' | 'undetermined';

export type RegisterResult =
  | { status: 'ok'; token: string }
  | { status: 'denied' }
  | { status: 'no-project' }
  | { status: 'unsupported' } // simulator, or Expo Go on iOS
  | { status: 'error'; message: string };

function projectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return typeof fromExtra === 'string' && fromExtra.length > 0 ? fromExtra : null;
}

/** Current permission state without prompting — safe to call on mount. */
export async function getPushPermission(): Promise<PermissionResult> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/* Asks the OS, then fetches a token. Only ever called from an explicit tap: iOS grants exactly one
   prompt per install, so firing it on mount would spend the single ask before the user has read why
   they'd want it — which is the entire point of the priming screen. */
export async function registerForPush(): Promise<RegisterResult> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // requestPermissionsAsync on an already-denied app resolves immediately as denied without a
    // prompt, so this is safe to call rather than something to guard against.
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return { status: 'denied' };

    // A real device is required for a token; the simulator can show the prompt but never gets one.
    if (!Device.isDevice) return { status: 'unsupported' };

    const id = projectId();
    if (!id) return { status: 'no-project' };

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { status: 'ok', token: data };
  } catch (e) {
    /* The Expo Go / iOS case surfaces here as a thrown error rather than a status, and it is not
       something the user can act on — report it as unsupported so the UI doesn't show them a stack
       trace for an environment limitation. */
    const message = (e as Error).message || 'Could not set up notifications';
    if (Platform.OS === 'ios' && /Expo Go|projectId|not supported/i.test(message)) return { status: 'unsupported' };
    return { status: 'error', message };
  }
}

/** Minutes to add to UTC to get the device's local time — the server stores this for quiet hours. */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/* Foreground presentation. Without this a notification that arrives while the app is open is
   swallowed silently, which reads as "push is broken" during testing. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    })
  });
}
