import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ToyShadow } from './ToyShadow';
import { AuraIcon, type AuraIconName } from './AuraIcon';
import { COIN_FILL, COIN_INK, COIN_SHADOW } from './coin';
import { SuperlativeChips, gradeLabel, initialsOf } from './profileKit';
import { SkeletonBlock } from './stateKit';
import type { PublicProfile } from '../hooks/useProfile';

/* 14A "Voting, rationed" — the pieces the Vote screen grew when rounds stopped being unlimited.

   All of it exists to answer one question the old screen couldn't: what happens when a resource runs
   out. Rounds run out (pips, then the out-of-rounds screen), coins run out (the reroll sheet), and one
   reroll per question runs out (the button's fourth state). The design's rule throughout is that a
   spent resource explains itself rather than going grey and silent. */

/* ---------------------------------------------------------------- rounds-left pips */

/* Pips, not a second progress bar. The screen already has one bar (questions answered), and two bars
   measuring different things next to each other read as one broken bar. */
export function RoundPips({ total, current }: { total: number; current: number }) {
  if (total <= 0) return null;
  return (
    <View className="flex-row items-center gap-[5px]">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        // Spent pips go flat and dark; the live one is mint; the ones you haven't reached are outlined.
        if (n < current) return <View key={n} className="h-[11px] w-[11px] rounded-pill" style={{ backgroundColor: '#3A383B' }} />;
        if (n === current) return <View key={n} className="h-[11px] w-[11px] rounded-pill bg-mint" />;
        return (
          <View
            key={n}
            className="h-[11px] w-[11px] rounded-pill bg-surface"
            style={{ borderWidth: 1.5, borderColor: '#565459' }}
          />
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------------- header person-plus */

/* The People screen's primary entry point, right of the coin pill. Mint because it's a growth/account
   action rather than a vote, and it carries the 3px toy shadow so it reads pressable next to the two
   flat status pills. */
export function PersonPlusButton({ onPress }: { onPress: () => void }) {
  return (
    <ToyShadow depth={3} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={onPress}>
      <View className="h-[38px] w-[38px] items-center justify-center" accessibilityLabel="Find people to follow">
        <AuraIcon name="personPlus" size={21} color="#0A3B2C" />
      </View>
    </ToyShadow>
  );
}

/* ---------------------------------------------------------------- refill countdown */

/* "⏳ 6h 12m until 3 more".

   Derived from the wall clock on a timer rather than counted down, for the same reason as useCooldown:
   iOS freezes JS timers while the app is backgrounded, and this particular wait is hours long, so a
   decrementing counter would be wrong by however long the phone was in a pocket. Ticks every 30s,
   which is as often as a minutes-resolution label can change. */
function untilLabel(iso: string, now: number): string | null {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const ms = at - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CountdownPill({ untilIso, trailing }: { untilIso: string | null; trailing: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const label = untilIso ? untilLabel(untilIso, now) : null;

  return (
    <View
      className="mt-[18px] flex-row items-center gap-[9px] self-start rounded-pill px-4 py-[10px]"
      style={{ backgroundColor: '#332F35' }}
    >
      <AuraIcon name="hourglass" size={17} color="#FF7A3D" />
      {/* No fake number when the refill time didn't arrive — the pill says "at midnight", which is
          true regardless, instead of a countdown to nothing. */}
      <Text className="font-fredoka-700 text-[17px] text-white">{label ?? 'Midnight UTC'}</Text>
      <Text className="font-nunito-800 text-[13px] text-ink-muted">{trailing}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- cream action card */

/* The out-of-rounds screen's two moves. Cream rather than a muted `surface` row because these are the
   only two things that change tomorrow's four — 14A: "so they are cream cards rather than muted rows". */
export function CreamActionCard({
  icon,
  iconBackground,
  iconShadow,
  iconColor,
  title,
  body,
  onPress
}: {
  icon: AuraIconName;
  iconBackground: string;
  iconShadow: string;
  iconColor: string;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  return (
    <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24} onPress={onPress}>
      <View className="flex-row items-center gap-[14px] px-[18px] py-[17px]">
        <ToyShadow depth={3} shadowColor={iconShadow} backgroundColor={iconBackground} radius={18}>
          <View className="h-[46px] w-[46px] items-center justify-center">
            <AuraIcon name={icon} size={24} color={iconColor} />
          </View>
        </ToyShadow>
        <View className="flex-1">
          <Text className="font-nunito-900 text-[16px]" style={{ color: '#2D2A2E' }}>
            {title}
          </Text>
          <Text className="font-nunito-700 mt-[2px] text-[12.5px] leading-[17px]" style={{ color: '#8B888D' }}>
            {body}
          </Text>
        </View>
      </View>
    </ToyShadow>
  );
}

/* ---------------------------------------------------------------- reroll: can't afford */

/* 14A's answer to "not enough coins": the button stays live and opens this, because "a disabled control
   teaches nothing" — a greyed-out reroll never explains that it has a price, or what the price is.

   Order is deliberate. Voting on is first because it's free and it's the behaviour the product wants;
   the shop is second and never pink, since being short of coins is a choice point, not an error. */
export function RerollShortSheet({
  visible,
  cost,
  balance,
  questionsLeft,
  payout,
  onKeep,
  onBuy
}: {
  visible: boolean;
  cost: number;
  balance: number;
  questionsLeft: number;
  payout: number;
  onKeep: () => void;
  onBuy?: () => void;
}) {
  const short = Math.max(0, cost - balance);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onKeep}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(13,12,13,0.68)' }} onPress={onKeep}>
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#2C2A2D', borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
          className="px-[22px] pb-[34px] pt-6"
        >
          <View className="mx-auto mb-5 h-[5px] w-[44px] rounded-pill" style={{ backgroundColor: '#4E4C50' }} />

          <View className="flex-row items-center gap-[13px]">
            <ToyShadow depth={3} shadowColor={COIN_SHADOW} backgroundColor={COIN_FILL} radius={20}>
              <View className="h-[52px] w-[52px] items-center justify-center">
                <AuraIcon name="coin" size={28} color={COIN_INK} />
              </View>
            </ToyShadow>
            <View className="flex-1">
              <Text className="font-fredoka-700 text-[24px] leading-[27px] text-white">
                You're {short} {short === 1 ? 'coin' : 'coins'} short
              </Text>
              <Text className="font-nunito-700 mt-[3px] text-[13.5px] text-ink-muted">
                A new four costs {cost}. You have {balance}.
              </Text>
            </View>
          </View>

          <View className="mt-5 gap-[10px]">
            <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={22} onPress={onKeep}>
              <View className="flex-row items-center justify-between px-[18px] py-4">
                <View className="flex-1">
                  <Text className="font-nunito-900 text-[16px]" style={{ color: '#0A3B2C' }}>
                    Finish this round
                  </Text>
  
                </View>
                <AuraIcon name="arrowRight" size={20} color="#0A3B2C" />
              </View>
            </ToyShadow>

            {/* Flat surface, no toy shadow and no pink: the shop is the second choice here, not the
                recommended one. */}
            <Pressable
              onPress={onBuy}
              className="flex-row items-center justify-between rounded-22 bg-surface px-[18px] py-4"
            >
              <View className="flex-1">
                <Text className="font-nunito-900 text-[16px] text-white">Buy coins</Text>
                <Text className="font-nunito-800 mt-[2px] text-[12.5px] text-ink-muted">
                  {/* The design prints "From 50 · $0.99". There is no coin IAP or price catalogue in
                      the app yet (see DESIGN-REQUESTS §7), so this says what's true rather than quoting
                      a price nothing can charge. */}
                  Not on sale yet — rounds are the only way to earn
                </Text>
              </View>
              <AuraIcon name="arrowRight" size={20} color="#C1C0C0" />
            </Pressable>
          </View>

          <Pressable onPress={onKeep} hitSlop={10} className="mt-4 items-center">
            <Text className="font-nunito-800 text-[13.5px] text-ink-faint">Keep these four</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------------------------------------------------------- long-press peek */

/* Holding a candidate lifts this over the blurred grid. A card, not a navigation, so the hold can
   never resolve into a vote — which is the whole reason peeking is a long-press and tapping is the
   ballot (§5.1: "a tap here is an irreversible vote, so the profile can't share it").

   Deviation from the design, stated plainly: the mock's footer reads "Let go to close", but the same
   card carries a Follow button and a Full profile button, and a card that vanishes on release makes
   both unreachable. So the peek persists until dismissed, and the footer says so. */
export function PeekCard({
  profile,
  loading,
  isFollowing,
  followBusy,
  onToggleFollow,
  onOpenProfile,
  onClose
}: {
  profile: PublicProfile | null | undefined;
  loading: boolean;
  isFollowing: boolean;
  followBusy: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center px-[18px]" style={{ backgroundColor: 'rgba(13,12,13,0.62)' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <ToyShadow depth={10} shadowColor="#C9B79F" backgroundColor="#FFF6E8" radius={30}>
            <View className="px-[22px] py-6">
              {loading ? (
                <View className="gap-4">
                  <SkeletonBlock height={62} radius={100} width={62} />
                  <SkeletonBlock height={20} radius={100} width="60%" />
                  <SkeletonBlock height={38} radius={100} />
                </View>
              ) : !profile ? (
                /* Same message as /u's: the server declines for a different school or a deleted
                   account, and saying which would leak whether that person exists. */
                <Text className="font-nunito-700 text-center text-[14px] leading-[20px]" style={{ color: '#8B888D' }}>
                  That profile isn't available. You can only see people at your own school.
                </Text>
              ) : (
                <>
                  <View className="flex-row items-center gap-[14px]">
                    <ToyShadow depth={4} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999}>
                      <View className="h-[62px] w-[62px] items-center justify-center">
                        <Text className="font-fredoka-700 text-[24px]" style={{ color: '#0A3B2C' }}>
                          {initialsOf(profile.name)}
                        </Text>
                      </View>
                    </ToyShadow>
                    <View className="flex-1">
                      <Text className="font-fredoka-700 text-[24px] leading-[27px]" style={{ color: '#2D2A2E' }} numberOfLines={1}>
                        {profile.name}
                      </Text>
                      <Text className="font-nunito-700 mt-[2px] text-[13px]" style={{ color: '#8B888D' }} numberOfLines={1}>
                        {[profile.username ? `@${profile.username}` : null, gradeLabel(profile.grade), profile.schoolName]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>

                  {/* Their trophies, not their totals: the peek deliberately shows nothing about how
                      many flames they have or who sent them. */}
                  {profile.superlatives.length > 0 && (
                    <SuperlativeChips superlatives={profile.superlatives.slice(0, 3)} lockedCount={0} />
                  )}

                  <View className="mt-4 flex-row gap-[9px]">
                    <View className="flex-1">
                      {isFollowing ? (
                        <Pressable
                          onPress={onToggleFollow}
                          disabled={followBusy}
                          className="items-center rounded-pill py-[13px]"
                          style={{ backgroundColor: '#EDE3D2', opacity: followBusy ? 0.6 : 1 }}
                        >
                          <View className="flex-row items-center gap-[6px]">
                            <Text className="font-nunito-900 text-[15px]" style={{ color: '#6E6B70' }}>
                              Following
                            </Text>
                            <AuraIcon name="check" size={15} color="#6E6B70" />
                          </View>
                        </Pressable>
                      ) : (
                        <ToyShadow
                          depth={4}
                          shadowColor="#C43A7C"
                          backgroundColor="#FF5CA8"
                          radius={9999}
                          onPress={onToggleFollow}
                          disabled={followBusy}
                          style={followBusy ? { opacity: 0.6 } : undefined}
                        >
                          <View className="items-center py-[13px]">
                            <Text className="font-nunito-900 text-[15px] text-white">Follow</Text>
                          </View>
                        </ToyShadow>
                      )}
                    </View>
                    <Pressable
                      onPress={onOpenProfile}
                      className="rounded-pill px-[18px] py-[13px]"
                      style={{ backgroundColor: '#EDE3D2' }}
                    >
                      <Text className="font-nunito-900 text-[15px]" style={{ color: '#6E6B70' }}>
                        Full profile
                      </Text>
                    </Pressable>
                  </View>

                  <Text className="font-nunito-800 mt-[14px] text-center text-[12.5px]" style={{ color: '#9A9691' }}>
                    Tap outside to close. Peeking casts no vote.
                  </Text>
                </>
              )}
            </View>
          </ToyShadow>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------------------------------------------------------- follow button */

/* The four states from 14A's state strip, in one place so the People screen, the peek card and any
   future profile button can't drift: Follow (pink, toy shadow) / Follow back (pink, they follow you) /
   Following ✓ (flat cream, tap to unfollow with no confirm) / in-flight (same, dimmed ink).

   There is deliberately no pending or requested state — following needs no approval and sends no
   notification, so there is nothing to be pending on. */
export function FollowButton({
  isFollowing,
  followsMe,
  busy,
  onPress
}: {
  isFollowing: boolean;
  followsMe: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  if (isFollowing) {
    return (
      <Pressable
        onPress={onPress}
        disabled={busy}
        hitSlop={8}
        className="rounded-pill px-[15px] py-[9px]"
        style={{ backgroundColor: '#EDE3D2' }}
      >
        <View className="flex-row items-center gap-[5px]">
          <Text className="font-nunito-900 text-[13.5px]" style={{ color: busy ? '#A8A29A' : '#6E6B70' }}>
            Following
          </Text>
          <AuraIcon name="check" size={14} color={busy ? '#A8A29A' : '#6E6B70'} />
        </View>
      </Pressable>
    );
  }
  return (
    <ToyShadow
      depth={3}
      shadowColor="#C43A7C"
      backgroundColor="#FF5CA8"
      radius={9999}
      onPress={onPress}
      disabled={busy}
      style={busy ? { opacity: 0.6 } : undefined}
    >
      <View className={followsMe ? 'px-[17px] py-[9px]' : 'px-5 py-[9px]'}>
        <Text className="font-nunito-900 text-[13.5px] text-white">{followsMe ? 'Follow back' : 'Follow'}</Text>
      </View>
    </ToyShadow>
  );
}
