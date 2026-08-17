import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '../../src/hooks/useShop';
import { useBoostRandom, useBoostCrush } from '../../src/hooks/useBoosts';
import { AuraIcon, type AuraIconName } from '../../src/components/AuraIcon';
import { COIN_FILL, COIN_INK, COIN_SHADOW } from '../../src/components/coin';
import { ToyShadow } from '../../src/components/ToyShadow';
import { AuthError } from '../../src/components/authKit';
import { InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';

/* 15A's Shop — "earn, buy, spend, in that order".

   The ordering is the argument: a student who can earn what they need shouldn't be sold it, so the free
   routes lead and the packs come second. It also means the screen reads the same whether or not you have
   money, which is the point at a school where plenty of people don't.

   Both states of the design live here rather than in two routes, because they differ by three rows out
   of a dozen — a member's balance is for boosts only, clues stop having a price, and the upsell becomes a
   receipt. Splitting them would duplicate the earn and spend sections and let them drift.

   Every number comes from the `shop` query, which reads tuning.ts. Nothing here is a literal. */

export default function Shop() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop, isLoading, isError, refetch } = useShop();
  const boostRandom = useBoostRandom();
  const boostCrush = useBoostCrush();

  const member = !!shop?.infiniteAura;
  const error = boostRandom.error ?? boostCrush.error;
  const busy = boostRandom.isPending || boostCrush.isPending;

  async function invite() {
    try {
      await Share.share({ message: 'come vote on Aura — anonymous, our school only' });
    } catch {
      // Dismissing the share sheet throws on some platforms; nothing to report.
    }
  }

  return (
    <View className="flex-1 bg-ground px-[21px]" style={{ paddingTop: insets.top + 14 }}>
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AuraIcon name="chevronLeft" size={22} color="#727074" />
        </Pressable>
        <Text className="font-fredoka-700 text-[19px] text-white">Coins</Text>
        <View style={{ width: 22 }} />
      </View>

      {isError ? (
        <View className="mt-5">
          <InlineFailure
            icon="coin"
            title="The shop didn't load"
            body="Your coins are safe — we just couldn't read the prices back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading || !shop ? (
        <View className="mt-4 gap-3">
          <SkeletonBlock height={92} radius={26} />
          <SkeletonRows n={3} height={52} radius={20} avatarSize={20} avatarRadius={6} />
        </View>
      ) : (
        <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
          {/* Balance. Yellow card, dark ink — the currency reads as gold on every surface it appears on. */}
          <ToyShadow depth={6} shadowColor={COIN_SHADOW} backgroundColor={COIN_FILL} radius={26}>
            <View className="flex-row items-center gap-[14px] p-4">
              <AuraIcon name="coin" size={36} color={COIN_INK} />
              <View className="flex-1">
                <Text className="font-fredoka-700 text-[34px] leading-[36px]" style={{ color: COIN_INK }}>
                  {shop.coins}
                </Text>
                <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#7A5A00' }}>
                  {/* A member's coins still have a job, and the card says which one rather than going quiet. */}
                  {member
                    ? 'Boosts only — clues are free for you'
                    : `1 coin = 1 clue`}
                </Text>
              </View>
            </View>
          </ToyShadow>

          {member && (
            <MemberCard expires={shop.infiniteAuraExpires} />
          )}

          {error && <AuthError message={(error as Error).message} />}

          <Section>EARN IT</Section>
          <View className="mt-[9px] gap-2">
            <EarnRow icon="ballot" iconColor="#FFFFFF" label="Finish today's round" amount={shop.roundPayout} />
            <EarnRow icon="flame" iconColor="#FF7A3D" label="Keep your streak" amount={shop.streakBonus} />
            {/* Cream, because it's the one earn route that also grows the school — and the one the
                product most wants tapped. Priced but NOT yet credited: nothing tracks who invited whom,
                so this is the only row on the screen advertising a payout that doesn't arrive. */}
            <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={20} onPress={invite}>
              <View className="flex-row items-center gap-3 px-[15px] py-3">
                <AuraIcon name="mail" size={20} color="#2D2A2E" />
                <Text className="font-nunito-900 flex-1 text-[14px]" style={{ color: '#2D2A2E' }}>
                  Invite a classmate
                </Text>
                <Text className="font-nunito-900 text-[14.5px]" style={{ color: '#C43A7C' }}>
                  +{shop.inviteBonus}
                </Text>
              </View>
            </ToyShadow>
          </View>

          <Section>OR BUY IT</Section>
          <View className="mt-[9px] flex-row items-end gap-2">
            <CoinPack amount={shop.coinPackSmall} />
            <CoinPack amount={shop.coinPackMedium} featured />
            <CoinPack amount={shop.coinPackLarge} />
          </View>
          {/* Said plainly rather than showing a price nothing can charge. A native app with a priced
              button that takes no money is both a revenue leak and a Guideline 3.1.1 risk. */}
          <Text className="font-nunito-700 mt-[9px] text-center text-[11.5px] leading-[16px] text-ink-faint">
            Coin packs aren't on sale yet — prices come from the App Store once the products are live.
          </Text>

          <Section>{member ? 'SPEND COINS ON' : 'SPEND IT'}</Section>
          <View className="mt-[9px] gap-2">
            {/* A member never sees a clue price, because clues cost them nothing. Showing "1 coin" to
                someone with unlimited clues would contradict the card at the top of this screen. */}
            {!member && (
              <SpendRow
                icon="search"
                label="One more clue"
                sub="On any flame in your inbox"
                cost={shop.clueInitialCost}
              />
            )}
            <SpendRow
              icon="dice"
              label={member ? 'Extra random boost' : 'Random boost'}
              sub={`${shop.boostRandomUses} extra polls around your school`}
              cost={shop.boostRandomCost}
              disabled={busy || shop.coins < shop.boostRandomCost}
              onPress={() => boostRandom.mutate()}
            />
            <SpendRow
              icon="target"
              label="Crush boost"
              sub="One person's polls, all week"
              cost={shop.boostCrushCost}
              /* Dimmed on affordability like the row above it, even though tapping only navigates —
                 sending someone off to pick a classmate and refusing them at the end is worse than
                 saying up front that they can't. */
              disabled={busy || shop.coins < shop.boostCrushCost}
              /* No target picker here — boostCrush needs a userId, and the designed way in is the
                 "Want them to see you?" card on someone's profile. This row states the price; the
                 profile is where you choose who. */
              onPress={() => router.push('/add')}
            />
          </View>

          {!member ? (
            <View className="mt-5 mb-8">
              <ToyShadow
                depth={5}
                shadowColor="#3FBF95"
                backgroundColor="#6BF2C2"
                radius={22}
                onPress={() => router.push('/infinite')}
              >
                <View className="flex-row items-center gap-3 px-4 py-[14px]">
                  <AuraIcon name="aura" size={22} color="#0A3B2C" />
                  <View className="flex-1">
                    <Text className="font-fredoka-700 text-[17px]" style={{ color: '#0A3B2C' }}>
                      Infinite Aura
                    </Text>
                    <Text className="font-nunito-800 mt-[1px] text-[11.5px]" style={{ color: '#12664C' }}>
                      Every clue free · first names
                    </Text>
                  </View>
                  <AuraIcon name="chevronRight" size={18} color="#0A3B2C" />
                </View>
              </ToyShadow>
            </View>
          ) : (
            <Text className="font-nunito-800 mt-5 mb-8 text-center text-[12.5px] leading-[18px] text-ink-faint">
              First names come with Infinite Aura. Coins never buy one.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Section({ children }: { children: string }) {
  return <Text className="font-nunito-900 mt-4 text-[12.5px] text-ink-muted">{children}</Text>;
}

function EarnRow({
  icon,
  iconColor,
  label,
  amount
}: {
  icon: AuraIconName;
  iconColor: string;
  label: string;
  amount: number;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-20 bg-surface px-[15px] py-3">
      <AuraIcon name={icon} size={20} color={iconColor} />
      <Text className="font-nunito-900 flex-1 text-[14px] text-white">{label}</Text>
      <Text className="font-nunito-900 text-[14.5px]" style={{ color: '#6BF2C2' }}>
        +{amount}
      </Text>
    </View>
  );
}

/* Coin amounts without dollar prices, on purpose — see the note in useShop. The middle pack is the
   featured one, which is the standard three-tier shape: the anchor is the one they should take. */
function CoinPack({ amount, featured = false }: { amount: number; featured?: boolean }) {
  if (featured) {
    return (
      <View style={{ flex: 1.1 }}>
        <View style={{ position: 'absolute', top: -11, left: 0, right: 0, alignItems: 'center', zIndex: 1 }}>
          <View
            className="rounded-pill px-[10px] py-[3px]"
            style={{ backgroundColor: COIN_FILL, transform: [{ rotate: '-3deg' }] }}
          >
            <Text className="font-nunito-900 text-[10px]" style={{ color: COIN_INK }}>
              MOST GET THIS
            </Text>
          </View>
        </View>
        <ToyShadow depth={5} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={22}>
          <View className="items-center px-2 py-4">
            <Text className="font-fredoka-700 text-[25px] text-white">{amount}</Text>
            <Text className="font-nunito-700 text-[11.5px]" style={{ color: '#FFD6E9' }}>
              coins
            </Text>
          </View>
        </ToyShadow>
      </View>
    );
  }
  return (
    <View className="flex-1 items-center rounded-20 bg-surface px-2 py-[13px]">
      <Text className="font-fredoka-700 text-[21px] text-white">{amount}</Text>
      <Text className="font-nunito-700 text-[11.5px] text-ink-dim">coins</Text>
    </View>
  );
}

function SpendRow({
  icon,
  label,
  sub,
  cost,
  disabled,
  onPress
}: {
  icon: AuraIconName;
  label: string;
  sub?: string;
  cost: number;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      className="flex-row items-center gap-3 rounded-20 bg-surface px-[15px] py-3"
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      <AuraIcon name={icon} size={20} color="#FFFFFF" />
      <View className="flex-1">
        <Text className="font-nunito-900 text-[14px] text-white">{label}</Text>
        {sub ? <Text className="font-nunito-700 mt-[1px] text-[11.5px] text-ink-dim">{sub}</Text> : null}
      </View>
      <View className="flex-row items-center gap-[5px] rounded-pill bg-raised px-[10px] py-[7px]">
        <AuraIcon name="coin" size={14} color={COIN_FILL} />
        <Text className="font-nunito-900 text-[12.5px]" style={{ color: COIN_FILL }}>
          {cost}
        </Text>
      </View>
    </Pressable>
  );
}

/* The member block. Renewal date comes from the stored IAP expiry, so it's the real one — and it reads
   "no renewal date" rather than inventing one when the unlock has no purchase behind it. */
function MemberCard({ expires }: { expires: string | null }) {
  const renews = expires
    ? new Date(expires).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <View className="mt-4 rounded-24 bg-surface p-4" style={{ borderWidth: 2, borderColor: '#6BF2C2' }}>
      <View className="flex-row items-center gap-[11px]">
        <AuraIcon name="aura" size={22} color="#6BF2C2" />
        <View className="flex-1">
          <Text className="font-fredoka-700 text-[19px]" style={{ color: '#6BF2C2' }}>
            Infinite Aura
          </Text>
          <Text className="font-nunito-700 mt-[1px] text-[12px] text-ink-muted">
            {renews ? `Renews ${renews}` : 'No renewal date on file'}
          </Text>
        </View>
        <Text className="font-nunito-900 text-[12px]" style={{ color: '#6BF2C2' }}>
          ON
        </Text>
      </View>

      <IncludedRow emoji="🙋" label="First names on" sub="Every flame you have, and every new one" />
      <IncludedRow icon="search" label="Clues unlimited" sub="No coins spent, no daily wait" />

      <View className="mt-3 flex-row items-center gap-3 rounded-20 bg-raised px-[14px] py-[13px]">
        <AuraIcon name="receipt" size={20} color="#C1C0C0" />
        <Text className="font-nunito-700 flex-1 text-[12.5px] leading-[17.5px] text-ink-secondary">
          {renews
            ? `Billed through the App Store. Cancel there and you keep it until ${renews}.`
            : 'Billed through the App Store once purchases are live.'}
        </Text>
      </View>
    </View>
  );
}

/* The 🙋 stays an emoji: 15A's rule is that a clue describing a person reads warmer typed than drawn,
   and this row is naming that exact clue. The search glyph beside it is chrome, so it's an icon. */
function IncludedRow({
  emoji,
  icon,
  label,
  sub
}: {
  emoji?: string;
  icon?: AuraIconName;
  label: string;
  sub: string;
}) {
  return (
    <View className="mt-2 flex-row items-center gap-3 rounded-18 bg-raised px-[14px] py-[13px]">
      {emoji ? <Text style={{ fontSize: 19 }}>{emoji}</Text> : icon ? <AuraIcon name={icon} size={20} color="#FFFFFF" /> : null}
      <View className="flex-1">
        <Text className="font-nunito-900 text-[13.5px] text-white">{label}</Text>
        <Text className="font-nunito-700 mt-[1px] text-[11.5px] text-ink-muted">{sub}</Text>
      </View>
      <Text className="font-nunito-900 text-[12px]" style={{ color: '#6BF2C2' }}>
        INCLUDED
      </Text>
    </View>
  );
}
