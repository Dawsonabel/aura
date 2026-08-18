import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { flameGenderLabel, type Flame } from '@aura/api-client';
import { useFlames } from '../../src/hooks/useFlames';
import { useShop } from '../../src/hooks/useShop';
import { useRevealClue } from '../../src/hooks/useRevealClue';
import { AuraIcon } from '../../src/components/AuraIcon';
import { COIN_FILL, COIN_INK, COIN_SHADOW } from '../../src/components/coin';
import { ToyShadow } from '../../src/components/ToyShadow';
import { AuthError } from '../../src/components/authKit';
import { InlineFailure, SkeletonBlock } from '../../src/components/stateKit';
import { ScratchTile } from '../../src/components/scratch/ScratchTile';
import { gradeShort } from '../../src/components/profileKit';

/* 16A — one flame, four tiles.

   The ladder, and why it's ordered this way: **who** is free and arrives open, so every flame says
   something the moment it lands. Grade and initial are a coin each. The first name is the rung coins
   can't reach — it comes with Infinite Aura, and the footer says so, because the bottom of this screen
   is exactly where someone starts looking for a way to buy it outright.

   `who` is free rather than `grade` on purpose (the design's note): it's the least identifying of the
   four. It says a stranger noticed you without narrowing the room, which is the itch the coins get paid
   to scratch. */

export default function Clue() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useFlames();
  const { data: shop } = useShop();
  const reveal = useRevealClue();

  const flame = data?.flames.find(f => f.id === id) ?? null;

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AuraIcon name="chevronLeft" size={22} color="#727074" />
        </Pressable>
        {/* The balance rides along, because every tap on this screen might spend from it. */}
        <View className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]">
          <AuraIcon name="coin" size={16} color={COIN_FILL} />
          <Text className="font-nunito-900 text-[15px] text-white">{shop?.coins ?? 0}</Text>
        </View>
      </View>

      {isError ? (
        <View className="mt-5">
          <InlineFailure
            icon="aura"
            title="That flame didn't load"
            body="Nothing has been spent. It just didn't come back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading ? (
        <View className="mt-6 gap-3">
          <SkeletonBlock height={70} radius={20} />
          <SkeletonBlock height={300} radius={30} />
        </View>
      ) : !flame ? (
        <View className="mt-5">
          <InlineFailure
            icon="aura"
            title="This one's gone"
            body="Flames disappear after 30 days, and blocking someone hides theirs."
            onRetry={() => router.back()}
          />
        </View>
      ) : (
        <ClueCard flame={flame} shop={shop} reveal={reveal} onPaywall={() => router.push('/infinite')} />
      )}
    </View>
  );
}

function ClueCard({
  flame,
  shop,
  reveal,
  onPaywall
}: {
  flame: Flame;
  shop: ReturnType<typeof useShop>['data'];
  reveal: ReturnType<typeof useRevealClue>;
  onPaywall: () => void;
}) {
  const member = !!shop?.infiniteAura;
  const freeReady = !!shop?.freeClueReady;

  /* The name tile is open only when the server actually sent a name. `anonymous` is the other reason it
     might never open: a sender with Infinite Aura of their own stays hidden even from a member, which is
     the promise that makes the whole app safe to use. */
  const nameOpen = !!flame.name;
  const revealedCount = 1 + (flame.gradeRevealed ? 1 : 0) + (flame.revealed ? 1 : 0) + (nameOpen ? 1 : 0);

  const who = flameGenderLabel(flame.gender) ?? 'Someone';
  const nextCost = !flame.gradeRevealed ? shop?.clueGradeCost ?? 1 : shop?.clueInitialCost ?? 1;
  const bothOpen = flame.gradeRevealed && flame.revealed;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text className="font-nunito-900 mt-4 text-center text-[13px] text-ink-muted">
        {revealedCount} OF 4 REVEALED
      </Text>
      <Text className="font-fredoka-700 mt-2 text-center text-[29px] leading-[32px] text-white">
        {flame.q}
      </Text>

      <View className="mt-5">
        <ToyShadow depth={7} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={30}>
          <View className="p-4">
            <View className="gap-[10px]">
              <View className="flex-row gap-[10px]">
                {/* Free, and already open — nothing to scratch. */}
                <Face tone="who" caption="WHO" emoji="👧" value={who} badge="FREE" />

                <ScratchTile
                  open={flame.gradeRevealed}
                  label="GRADE|SCRATCH IT OFF"
                  seed={4}
                  cost={shop?.clueGradeCost ?? 1}
                  free={freeReady && !member}
                  disabled={reveal.isPending}
                  onScratch={() => reveal.mutate({ id: flame.id, clue: 'grade' })}
                >
                  <Face
                    tone="grade"
                    caption="GRADE"
                    emoji="🎓"
                    value={gradeShort(flame.grade) ?? 'Unknown'}
                    badge={flame.gradeRevealed ? 'NEW' : ''}
                  />
                </ScratchTile>
              </View>

              <View className="flex-row gap-[10px]">
                <ScratchTile
                  open={flame.revealed}
                  label="INITIAL|SCRATCH IT OFF"
                  seed={19}
                  cost={shop?.clueInitialCost ?? 1}
                  free={freeReady && !member}
                  disabled={reveal.isPending}
                  onScratch={() => reveal.mutate({ id: flame.id, clue: 'initial' })}
                >
                  <Face tone="initial" caption="INITIAL" emoji="🔤" value={flame.initial ?? '?'} badge="" />
                </ScratchTile>

                {/* Never scratchable. Coins can't buy a name, so this tile has no price and no foil —
                    it's locked or it's open, and only Infinite Aura moves it. */}
                {nameOpen ? (
                  <Face tone="name" caption="FIRST NAME" emoji="🙋" value={firstNameOf(flame.name)} badge="INFINITE" />
                ) : (
                  <LockedName anonymous={flame.anonymous} onPress={onPaywall} />
                )}
              </View>
            </View>

            {/* Who else, without saying who. Only shown when it's actually true. */}
            {flame.repeatAdmirer && (
              <View
                className="mt-[14px] flex-row items-center gap-[11px] pt-[13px]"
                style={{ borderTopWidth: 1.5, borderTopColor: '#E4D6BF' }}
              >
                <Text style={{ fontSize: 20 }}>🫂</Text>
                <View className="flex-1">
                  <Text className="font-nunito-900 text-[14px]" style={{ color: '#2D2A2E' }}>
                    {subjectOf(who)} picked you {flame.pickCount} times
                  </Text>
                  <Text className="font-nunito-700 mt-[1px] text-[12px]" style={{ color: '#8B888D' }}>
                    Same person, same prompt — that's not an accident.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </ToyShadow>
      </View>

      {reveal.isError && <AuthError message={(reveal.error as Error).message} />}

      <View className="mt-5 gap-[10px]">
        {!bothOpen && !member && (
          <ToyShadow depth={5} shadowColor={COIN_SHADOW} backgroundColor={COIN_FILL} radius={9999}>
            <View className="flex-row items-center justify-center gap-2 py-4">
              <Text className="font-fredoka-700 text-[18px]" style={{ color: COIN_INK }}>
                {freeReady ? 'Tap a tile — today\'s is free' : 'Tap a tile to scratch'}
              </Text>
              {!freeReady && (
                <View className="flex-row items-center gap-1">
                  <AuraIcon name="coin" size={18} color={COIN_INK} />
                  <Text className="font-fredoka-700 text-[18px]" style={{ color: COIN_INK }}>
                    {nextCost}
                  </Text>
                </View>
              )}
            </View>
          </ToyShadow>
        )}

        {!nameOpen && !flame.anonymous && (
          <Pressable onPress={onPaywall} className="items-center rounded-pill bg-surface py-[14px]">
            <Text className="font-fredoka-700 text-[16px]" style={{ color: '#6BF2C2' }}>
              Get {possessiveOf(who)} first name · Infinite Aura
            </Text>
          </Pressable>
        )}
      </View>

      <Text className="font-nunito-800 mt-4 mb-8 text-center text-[12.5px] text-ink-faint">
        {member ? 'Every clue is free for you.' : 'Free tile every day at 3pm'}
      </Text>
    </ScrollView>
  );
}

/** "Maya Patel" -> "Maya". The design shows a first name; the surname is never part of the reward. */
function firstNameOf(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Someone';
}

/* "A girl" -> "She". Falls back to "They" for nonbinary, for a sender who chose not to say, and for a
   cohort too small to name — the same neutral the rest of the app uses when it doesn't know. */
function subjectOf(who: string): string {
  const w = who.toLowerCase();
  if (w.includes('girl')) return 'She';
  if (w.includes('boy')) return 'He';
  return 'They';
}

function possessiveOf(who: string): string {
  const w = who.toLowerCase();
  if (w.includes('girl')) return 'her';
  if (w.includes('boy')) return 'his';
  return 'their';
}

const TONES = {
  who: { bg: '#6BF2C2', caption: '#12664C', value: '#0A3B2C', badge: '#12664C', size: 21 },
  grade: { bg: '#FFD84D', caption: '#7A5A00', value: '#3A2A00', badge: '#7A5A00', size: 24 },
  initial: { bg: '#7C5CFF', caption: '#D6CBFF', value: '#FFFFFF', badge: '#D6CBFF', size: 34 },
  name: { bg: '#FF5CA8', caption: '#FFD6E9', value: '#FFFFFF', badge: '#FFD6E9', size: 21 }
} as const;

/** One revealed tile. Four colours so the rungs are distinguishable before any of them is opened. */
function Face({
  tone,
  caption,
  emoji,
  value,
  badge
}: {
  tone: keyof typeof TONES;
  caption: string;
  emoji: string;
  value: string;
  badge: string;
}) {
  const t = TONES[tone];
  return (
    <View
      className="flex-1 items-center justify-center gap-[7px] overflow-hidden rounded-22 px-3"
      style={{ backgroundColor: t.bg, aspectRatio: 1 }}
    >
      <Text className="font-nunito-900 text-[10.5px]" style={{ color: t.caption, letterSpacing: 0.6 }}>
        {caption}
      </Text>
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text className="font-fredoka-700 text-center" style={{ fontSize: t.size, lineHeight: t.size + 2, color: t.value }} numberOfLines={1}>
        {value}
      </Text>
      {badge ? (
        <Text className="font-nunito-900 text-[10px]" style={{ color: t.badge }}>
          {badge}
        </Text>
      ) : null}
    </View>
  );
}

/* The rung coins can't reach.

   Two different locks wearing one face: usually it's "buy Infinite Aura", but when the *sender* has
   Infinite Aura they stay anonymous to everyone, member or not. Selling a subscription that wouldn't
   open this particular tile would be a straight lie, so that case says so and isn't tappable. */
function LockedName({ anonymous, onPress }: { anonymous: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={anonymous ? undefined : onPress}
      disabled={anonymous}
      className="flex-1 items-center justify-center gap-[7px] overflow-hidden rounded-22 px-3"
      style={{ backgroundColor: '#E4D6BF', aspectRatio: 1 }}
    >
      <Text className="font-nunito-900 text-[10.5px]" style={{ color: '#A2957F', letterSpacing: 0.6 }}>
        FIRST NAME
      </Text>
      <AuraIcon name="lock" size={24} color="#A2957F" />
      <Text className="font-fredoka-700 text-[19px] leading-[21px]" style={{ color: '#A2957F' }}>
        {anonymous ? 'Hidden' : 'Locked'}
      </Text>
      <View
        className="rounded-pill px-[9px] py-1"
        style={{ backgroundColor: anonymous ? '#A2957F' : '#FF5CA8' }}
      >
        <Text className="font-nunito-900 text-[9.5px] text-white">{anonymous ? 'ANONYMOUS' : 'INFINITE'}</Text>
      </View>
    </Pressable>
  );
}
