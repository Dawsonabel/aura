import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { Modal, Pressable, View } from 'react-native';

/* Shared modal/overlay wrapper — backdrop press closes, panel press doesn't. Matches
   apps/web's Overlay. The inner Pressable with a no-op onPress is the standard RN idiom for
   "claim the responder so the touch doesn't fall through to the backdrop" — there's no DOM-style
   event bubbling/stopPropagation to rely on here. */
export function Overlay({ onClose, style, children }: { onClose: () => void; style?: ViewStyle; children: ReactNode }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 p-4" onPress={onClose}>
        <Pressable className="w-full max-w-sm rounded-lg bg-white p-6" style={style} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
