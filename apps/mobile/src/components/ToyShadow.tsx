import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

export type ToyShadowProps = {
  /** Offset in px of the flat shadow slab beneath the face — see README's "Toy button shadows". */
  depth: number;
  shadowColor: string;
  backgroundColor: string;
  radius: number;
  onPress?: () => void;
  /** Secondary gesture — the Vote card uses it to peek at a profile without casting the vote. */
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/* React Native has no un-blurred `box-shadow`, so the "toy button" look — a solid, flat-offset
   slab in a darker shade, never a soft/blurred shadow — is built as two stacked Views instead:
   an outer slab in `shadowColor` and an inner face in `backgroundColor`, the face inset from the
   slab's bottom edge by `depth` so exactly that many px of slab show through underneath.

   When `onPress` is given, pressing translates the face down by `depth` (covering the slab
   entirely) — "the toy button physically depresses" — rather than animating a shadow property,
   since RN shadows aren't real box-shadows to animate in the first place. */
export function ToyShadow({ depth, shadowColor, backgroundColor, radius, onPress, onLongPress, disabled, style, children }: ToyShadowProps) {
  const face = (pressed: boolean) => (
    <View style={{ backgroundColor: shadowColor, borderRadius: radius }}>
      <View
        style={[
          { backgroundColor, borderRadius: radius, marginBottom: depth },
          pressed && { transform: [{ translateY: depth }] },
          style
        ]}
      >
        {children}
      </View>
    </View>
  );

  if (!onPress && !onLongPress) return face(false);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled}>
      {({ pressed }) => face(pressed && !disabled)}
    </Pressable>
  );
}
