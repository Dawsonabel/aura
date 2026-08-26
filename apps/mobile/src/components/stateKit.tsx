import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { ToyShadow } from './ToyShadow';
import { Wobble } from './Wobble';
import { AuraIcon, type AuraIconName } from './AuraIcon';

/* 10A "Failure · loading · empty" — the states every screen used to improvise.

   The three rules the design states, encoded here so they're hard to break:
   1. A failure never takes the whole screen unless nothing on it can render. `InlineFailure` is the
      default; `FullScreenFailure` exists for exactly one case (the account itself won't load).
   2. Skeletons mirror the real layout in #2E2C2F, shimmering 0.55 → 1 → 0.55 over 1.4s with a 90ms
      stagger down a list. Never a spinner.
   3. An empty state names why it's empty and offers the one action that fills it. */

const SKELETON = '#2E2C2F';
/** Inner blocks (avatar, text lines) sit one step lighter than the card they're in. */
const SKELETON_INNER = '#3A383B';
const SHIMMER_HALF_MS = 700; // 1.4s round trip
const STAGGER_MS = 90;

/* Shimmer runs on Reanimated rather than RN's Animated deliberately: these are on screen precisely
   when the JS thread is busy fetching, and a UI-thread animation keeps moving while a JS-driven one
   stutters or freezes. */
function useShimmer(index = 0) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    const easing = Easing.inOut(Easing.ease);
    opacity.value = withDelay(
      index * STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: SHIMMER_HALF_MS, easing }),
          withTiming(0.55, { duration: SHIMMER_HALF_MS, easing })
        ),
        -1,
        false
      )
    );
  }, [index, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** A single blocked-out region. `index` staggers it against its siblings. */
export function SkeletonBlock({
  height,
  width,
  radius = 100,
  index = 0,
  style
}: {
  height: number;
  width?: number | string;
  radius?: number;
  index?: number;
  style?: object;
}) {
  const shimmer = useShimmer(index);
  return (
    <Animated.View
      style={[
        { height, width: (width as number) ?? undefined, borderRadius: radius, backgroundColor: SKELETON },
        width === undefined ? { alignSelf: 'stretch' } : null,
        style,
        shimmer
      ]}
    />
  );
}

/* The list-row skeleton: square-ish avatar, a long line, a short line. Matches the aura/blocked/
   schoolmate rows, which all share that shape. */
export function SkeletonRow({
  index = 0,
  height = 78,
  radius = 22,
  avatarRadius = 16,
  avatarSize = 46,
  lineWidths = ['75%', '50%'] as [string, string]
}: {
  index?: number;
  height?: number;
  radius?: number;
  avatarRadius?: number;
  avatarSize?: number;
  lineWidths?: [string, string];
}) {
  const shimmer = useShimmer(index);
  return (
    <Animated.View
      style={[
        { height, borderRadius: radius, backgroundColor: SKELETON, paddingHorizontal: 15 },
        { flexDirection: 'row', alignItems: 'center', gap: 13 },
        shimmer
      ]}
    >
      <View style={{ width: avatarSize, height: avatarSize, borderRadius: avatarRadius, backgroundColor: SKELETON_INNER }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: lineWidths[0] as unknown as number, height: 14, borderRadius: 100, backgroundColor: SKELETON_INNER }} />
        <View style={{ width: lineWidths[1] as unknown as number, height: 11, borderRadius: 100, backgroundColor: SKELETON_INNER }} />
      </View>
    </Animated.View>
  );
}

/** Convenience: `n` staggered SkeletonRows. */
export function SkeletonRows({ n = 4, ...row }: { n?: number } & Parameters<typeof SkeletonRow>[0]) {
  const widths: [string, string][] = [
    ['75%', '50%'],
    ['62%', '44%'],
    ['80%', '38%'],
    ['68%', '52%']
  ];
  return (
    <View className="gap-[10px]">
      {Array.from({ length: n }, (_, i) => (
        <SkeletonRow key={i} index={i} lineWidths={widths[i % widths.length]} {...row} />
      ))}
    </View>
  );
}

/* Rule 1's default. One section didn't come back; the rest of the screen is untouched and says so,
   which is the difference between "the app is broken" and "this list is stale". */
export function InlineFailure({
  icon = 'close',
  title,
  body,
  onRetry
}: {
  /* 15A: empty and error states draw their icon at 40. Muted rather than pink — a section that didn't
     load is a condition, not an alarm, and pink is reserved for things that are actually wrong. */
  icon?: AuraIconName;
  title: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="items-center rounded-24 bg-surface px-5 py-[26px]">
      <AuraIcon name={icon} size={40} color="#9A989B" />
      <Text className="font-fredoka-700 mt-3 text-center text-[21px] text-white">{title}</Text>
      {body ? (
        <Text className="font-nunito-700 mt-[7px] text-center text-[13px] leading-[19px] text-ink-muted">{body}</Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-4 flex-row items-center gap-2 rounded-pill px-5 py-[11px]"
          style={{ backgroundColor: '#4A474B' }}
        >
          <AuraIcon name="reroll" size={15} color="#FFFFFF" />
          <Text className="font-nunito-900 text-[13.5px] text-white">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* Rule 1's exception: nothing else on the screen can render, so the failure owns it. The sign-out
   escape is mandatory here — a valid session pointing at an unloadable profile is otherwise a dead
   end with no way out. The error code is for support, not decoration. */
export function FullScreenFailure({
  icon = 'person',
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  footer
}: {
  icon?: AuraIconName;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footer?: ReactNode;
}) {
  return (
    <>
      <View className="my-auto items-center">
        <AuraIcon name={icon} size={52} color="#9A989B" />
        <Text className="font-fredoka-700 mt-4 text-center text-[33px] leading-[36px] text-white">{title}</Text>
        <Text className="font-nunito-700 mt-[10px] text-center text-[14.5px] leading-[21px] text-ink-muted">{body}</Text>
        <View className="mt-[22px] w-full">
          <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={onPrimary}>
            <View className="items-center py-[17px]">
              <Text className="font-fredoka-700 text-[18px]" style={{ color: '#0A3B2C' }}>
                {primaryLabel}
              </Text>
            </View>
          </ToyShadow>
        </View>
        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary} hitSlop={8} className="mt-[14px]">
            <Text className="font-nunito-900 text-[14px] text-ink-secondary">{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {footer ? <View className="mb-[32px]">{footer}</View> : null}
    </>
  );
}

/* Rule 3. Cream card, because an empty state is an invitation rather than a problem — pink is
   reserved for things that are actually wrong. The CTA is the action that fills the emptiness. */
export function EmptyState({
  icon,
  iconColor = '#8B888D',
  title,
  body,
  ctaLabel,
  onCta,
  ctaTone = 'pink',
  wobble = false
}: {
  icon: AuraIconName;
  /** Defaults to the cream card's muted ink; pass an accent when the state is worth colouring. */
  iconColor?: string;
  title: string;
  /** Optional: a title and a button are a complete empty state when the title already says it. */
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaTone?: 'pink' | 'mint';
  /** 12A wobbles the empty-Inbox glyph. Opt-in, since most empty states hold theirs still. */
  wobble?: boolean;
}) {
  const pink = ctaTone === 'pink';
  const glyph = <AuraIcon name={icon} size={40} color={iconColor} />;
  return (
    <ToyShadow depth={6} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={26}>
      <View className="items-center px-5 py-6">
        {wobble ? <Wobble>{glyph}</Wobble> : glyph}
        <Text className="font-fredoka-700 mt-3 text-center text-[23px] leading-[26px]" style={{ color: '#2D2A2E' }}>
          {title}
        </Text>
        {body ? (
          <Text className="font-nunito-700 mt-2 text-center text-[13.5px] leading-[19px]" style={{ color: '#8B888D' }}>
            {body}
          </Text>
        ) : null}
        {ctaLabel && onCta ? (
          <View className="mt-4 w-full">
            <ToyShadow
              depth={4}
              shadowColor={pink ? '#C43A7C' : '#3FBF95'}
              backgroundColor={pink ? '#FF5CA8' : '#6BF2C2'}
              radius={9999}
              onPress={onCta}
            >
              <View className="items-center py-[15px]">
                <Text className="font-fredoka-700 text-[17px]" style={{ color: pink ? '#FFFFFF' : '#0A3B2C' }}>
                  {ctaLabel}
                </Text>
              </View>
            </ToyShadow>
          </View>
        ) : null}
      </View>
    </ToyShadow>
  );
}

/* Offline banner. Orange (not pink) because it's a condition rather than an error — the same orange
   as the streak pill, which is the only other "state of the world" indicator in the app. */
export function OfflinePill() {
  return (
    <View className="flex-row items-center gap-[10px] rounded-pill px-4 py-[11px]" style={{ backgroundColor: '#4A474B' }}>
      <View className="h-[9px] w-[9px] rounded-pill" style={{ backgroundColor: '#F2703A' }} />
      <Text className="font-nunito-900 flex-1 text-[13px] text-white">No connection</Text>
      <Text className="font-nunito-800 text-[12.5px] text-ink-muted">Retrying…</Text>
    </View>
  );
}
