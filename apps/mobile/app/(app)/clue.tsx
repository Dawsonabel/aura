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
import { firstNameOf, gradeShort } from '../../src/components/profileKit';

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
     the promise that makes the whole app safe to use.

     When they are, it isn't only the name that's hidden — the grade and the initial are withheld too,
     and the server refuses to sell either (schema.ts throws on an anonymous flame). So those tiles must
     not wear foil and a price: a sealed tile is an offer, and offering something that cannot be bought
     takes a tap and gives back an error. They show as hidden instead, and only the gender stays free. */
  const nameOpen = !!flame.name;
  const anon = flame.anonymous;
  const revealedCount = 1 + (flame.gradeRevealed ? 1 : 0) + (flame.revealed ? 1 : 0) + (nameOpen ? 1 : 0);

  const who = flameGenderLabel(flame.gender) ?? 'Someone';
  const nextCost = !flame.gradeRevealed ? shop?.clueGradeCost ?? 1 : shop?.clueInitialCost ?? 1;
  const bothOpen = flame.gradeRevealed && flame.revealed;
  /* Members scratch too — the membership pays for the tile, it doesn't skip it. So the badge says FREE
     rather than a price, and the same is true of anyone's daily free tile. */
  const scratchFree = member || freeReady;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text className="font-nunito-900 mt-4 text-center text-[13px] text-ink-muted">
        {anon ? 'THIS ONE STAYS ANONYMOUS' : `${revealedCount} OF 4 REVEALED`}
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

                {anon ? (
                  <LockedTile caption="GRADE" value="Hidden" badge="ANONYMOUS" />
                ) : (
                  <ScratchTile
                    open={flame.gradeRevealed}
                    label="GRADE|SCRATCH IT OFF"
                    seed={4}
                    cost={shop?.clueGradeCost ?? 1}
                    free={scratchFree}
                    freeLabel={member ? 'FREE' : 'FREE TODAY'}
                    disabled={reveal.isPending}
                    onScratch={() => reveal.mutate({ id: flame.id, clue: 'grade' })}
                  >
                    <Face
                      tone="grade"
                      caption="GRADE"
                      emoji="🎓"
                      value={gradeShort(flame.grade) ?? 'Unknown'}
                      badge={flame.gradeRevealed ? 'NEW' : ''}
                      square={false}
                    />
                  </ScratchTile>
                )}
              </View>

              <View className="flex-row gap-[10px]">
                {anon ? (
                  <LockedTile caption="INITIAL" value="Hidden" badge="ANONYMOUS" />
                ) : (
                  <ScratchTile
                    open={flame.revealed}
                    label="INITIAL|SCRATCH IT OFF"
                    seed={19}
                    cost={shop?.clueInitialCost ?? 1}
                    free={scratchFree}
                    freeLabel={member ? 'FREE' : 'FREE TODAY'}
                    disabled={reveal.isPending}
                    onScratch={() => reveal.mutate({ id: flame.id, clue: 'initial' })}
                  >
                    <Face tone="initial" caption="INITIAL" emoji="🔤" value={flame.initial ?? '?'} badge="" square={false} />
                  </ScratchTile>
                )}

                {/* Never scratchable. Coins can't buy a name, so this tile has no price and no foil —
                    it's locked or it's open, and only Infinite Aura moves it. */}
                {nameOpen ? (
                  <Face tone="name" caption="FIRST NAME" emoji="🙋" value={firstNameOf(flame.name)} badge="INFINITE" />
                ) : anon ? (
                  <LockedTile caption="FIRST NAME" value="Hidden" badge="ANONYMOUS" />
                ) : (
                  <LockedTile caption="FIRST NAME" value="Locked" badge="INFINITE" onPress={onPaywall} />
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
        {/* Members get this too — they have tiles left to scratch like anyone else, just at no cost.
            It stays hidden on an anonymous flame, where there is nothing to tap. */}
        {!bothOpen && !anon && (
          <ToyShadow depth={5} shadowColor={COIN_SHADOW} backgroundColor={COIN_FILL} radius={9999}>
            <View className="flex-row items-center justify-center gap-2 py-4">
              <Text className="font-fredoka-700 text-[18px]" style={{ color: COIN_INK }}>
                {member
                  ? 'Tap a tile — they\'re all free'
                  : freeReady
                    ? 'Tap a tile — today\'s is free'
                    : 'Tap a tile to scratch'}
              </Text>
              {!scratchFree && (
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

        {!nameOpen && !anon && (
          <Pressable onPress={onPaywall} className="items-center rounded-pill bg-surface py-[14px]">
            <Text className="font-fredoka-700 text-[16px]" style={{ color: '#6BF2C2' }}>
              Get {possessiveOf(who)} first name · Infinite Aura
            </Text>
          </Pressable>
        )}
      </View>

      <Text className="font-nunito-800 mt-4 mb-8 text-center text-[12.5px] text-ink-faint">
        {anon
          ? 'They have Infinite Aura, so nothing here can be unlocked — not even with a membership.'
          : member
            ? 'Every clue is free for you.'
            : 'Free tile every day at 3pm'}
      </Text>
    </ScrollView>
  );
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

/* One revealed tile. Four colours so the rungs are distinguishable before any of them is opened.

   No `aspectRatio` here, deliberately — exactly one tile per row gets to define the square, and that's
   the ScratchTile. When these carried their own too, both squares competed: every tile in the row is
   `flex-1` (so `flexShrink: 1`), the aspect-ratio-derived width overflowed the row, and the *scratch*
   tile was the one that gave up the difference — leaving the foiled tiles visibly smaller than their
   neighbours, which is exactly what the tiles on the Infinite Aura paywall avoid: there the square is
   declared by an *inner* body, one level below the flex item, so the row's height is set without any
   flex item's width being derived from it. `square` is false for the two faces that live inside a
   ScratchTile — that Pressable is already the square, and a second one inside it would be the same
   fight one level down. */
function Face({
  tone,
  caption,
  emoji,
  value,
  badge,
  square = true
}: {
  tone: keyof typeof TONES;
  caption: string;
  emoji: string;
  value: string;
  badge: string;
  square?: boolean;
}) {
  const t = TONES[tone];
  return (
    <View className="flex-1 overflow-hidden rounded-22" style={{ backgroundColor: t.bg }}>
      <View
        className="flex-1 items-center justify-center gap-[7px] px-3"
        style={square ? { aspectRatio: 1 } : undefined}
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
    </View>
  );
}

/* A rung that isn't for sale, in the two ways that happens.

   "Locked" is the upsell: the first name, which coins can't buy and Infinite Aura can — tappable,
   pink badge, goes to the paywall. "Hidden" is the sender having Infinite Aura of their own, which
   takes *every* tile off the market including this one; it's a flat statement and isn't tappable.
   Selling a subscription that wouldn't open the tile would be a straight lie, and so would wearing
   foil and a price over a clue the server refuses to sell at any price. */
function LockedTile({
  caption,
  value,
  badge,
  onPress
}: {
  caption: string;
  /** "Locked" (buyable, elsewhere) or "Hidden" (not buyable at all). */
  value: string;
  badge: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-1 overflow-hidden rounded-22"
      style={{ backgroundColor: '#E4D6BF' }}
    >
      {/* Inner square, same as Face — see the note there. */}
      <View className="flex-1 items-center justify-center gap-[7px] px-3" style={{ aspectRatio: 1 }}>
        <Text className="font-nunito-900 text-[10.5px]" style={{ color: '#A2957F', letterSpacing: 0.6 }}>
          {caption}
        </Text>
        <AuraIcon name="lock" size={24} color="#A2957F" />
        <Text className="font-fredoka-700 text-[19px] leading-[21px]" style={{ color: '#A2957F' }}>
          {value}
        </Text>
        <View className="rounded-pill px-[9px] py-1" style={{ backgroundColor: onPress ? '#FF5CA8' : '#A2957F' }}>
          <Text className="font-nunito-900 text-[9.5px] text-white">{badge}</Text>
        </View>
      </View>
    </Pressable>
  );
}
