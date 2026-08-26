import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

/* A one-way "the user closed this" flag, persisted on the device.

   Component state can't hold this. `(app)` renders a `<Slot />`, so opening a card unmounts the Aura
   tab outright (see the segment comment in inbox.tsx) — a dismissal in `useState` would come back
   every time someone closed a reveal. The URL can't hold it either: it survives that round trip but
   not a relaunch, and an X that reappears next time you open the app reads as broken rather than as
   temporary.

   SecureStore rather than AsyncStorage because it's the only key/value store already in the app's
   dependencies (@clerk/expo uses it for the token cache), and adding a second storage library for one
   boolean isn't worth it. It's a keychain entry holding "1", which is heavier than this needs but
   costs nothing at one read per mount.

   `dismissed` is null until the read lands, so callers can hold the layout rather than flashing the
   thing being dismissed and then yanking it away. */
export function useDismissed(key: string): { dismissed: boolean | null; dismiss: () => void } {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(key)
      // A failed read means "not dismissed" — showing the card once too often is the harmless side.
      .then(v => alive && setDismissed(v === '1'))
      .catch(() => alive && setDismissed(false));
    return () => {
      alive = false;
    };
  }, [key]);

  /* State first, write after, and the write is deliberately not awaited: the tap should close the card
     on the same frame it happens. A failed write costs one reappearance, not a wrong screen. */
  const dismiss = () => {
    setDismissed(true);
    void SecureStore.setItemAsync(key, '1').catch(() => {});
  };

  return { dismissed, dismiss };
}
