import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENDER_LABEL } from '@aura/api-client';
import { usePublicProfile } from '../../src/hooks/useProfile';
import { useShop } from '../../src/hooks/useShop';
import { useBoostCrush } from '../../src/hooks/useBoosts';
import { InfoCard } from '../../src/components/settingsKit';
import { InlineFailure, SkeletonBlock, SkeletonRows } from '../../src/components/stateKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { AuraIcon } from '../../src/components/AuraIcon';
import {
  ProfileActionRow,
  ProfileBadge,
  ProfileIdentity,
  SectionLabel,
  SocialsList,
  StatRow,
  SuperlativeChips,
  avatarAccent,
  gradeLabel
} from '../../src/components/profileKit';

/* 13A's public profile — what a Ranks row opens.

   Deliberately narrower than your own: no coins, no streak, no invite card, and nothing at all about
   who picked them. The server enforces that (see the publicProfile resolver); this screen just can't
   render what it isn't sent.

   Route is `/u?userId=…` rather than a dynamic segment because expo-router's typed-routes generation
   is enabled, and a query param keeps the deep-link surface flat and unguessable-by-crawling. */
export default function PublicProfileScreen() {
  const { userId = '' } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: shop } = useShop();
  const boostCrush = useBoostCrush();
  const { data: profile, isLoading, isError, refetch } = usePublicProfile(userId);

  const first = (profile?.name ?? '').trim().split(/\s+/)[0] || 'them';
  /* "WHAT SHE'S WON" in the design. Derived from their gender, falling back to "THEY'VE" — which is
     also what someone who chose "Rather not say" gets, rather than a guess. */
  const possessive =
    profile?.gender === 'girl' ? "SHE'S" : profile?.gender === 'boy' ? "HE'S" : "THEY'VE";

  return (
    <ScrollView
      className="flex-1 bg-ground"
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 21, paddingBottom: 10 }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={() => router.back()} hitSlop={12} className="self-start">
        <Text className="text-[22px] leading-[22px] text-ink-faint">‹</Text>
      </Pressable>

      {isError ? (
        <View className="mt-5">
          <InlineFailure
            icon="person"
            title="Couldn't load that profile"
            body="Everything else works. This one just didn't come back."
            onRetry={() => refetch()}
          />
        </View>
      ) : isLoading ? (
        <View className="mt-[14px]">
          <SkeletonBlock height={78} radius={100} width={78} />
          <View className="mt-5">
            <SkeletonRows n={2} height={74} radius={20} avatarSize={0} avatarRadius={0} />
          </View>
        </View>
      ) : !profile ? (
        /* Null means the server declined: different school, or yourself. Not an error — just nothing
           to show, and saying which would leak whether that person exists. */
        <View className="mt-5">
          <InfoCard icon="person">
            That profile isn't available. You can only see people at your own school.
          </InfoCard>
        </View>
      ) : (
        <>
          {/* Avatar takes their own colour, matching the People row and the candidate sheet. It was a
              fixed purple, so the person you tapped changed hue on the way to their own profile.
              Blocked still greys out — that override is the point of the blocked state. */}
          <ProfileIdentity
            name={profile.name}
            meta={[
              profile.username ? `@${profile.username}` : null,
              gradeLabel(profile.grade),
              profile.schoolName
            ]
              .filter(Boolean)
              .join(' · ')}
            avatarColor={profile.blocked ? '#524F53' : avatarAccent(profile.id).bg}
            avatarShadow={profile.blocked ? '#3E3B40' : avatarAccent(profile.id).shadow}
            badge={
              profile.rank === 1 ? (
                <ProfileBadge label="#1 this week" backgroundColor="#FFD84D" shadowColor="#D4AC17" color="#3A2A00" />
              ) : undefined
            }
          />

          {/* Two stats, not three: your balance is yours alone. */}
          <StatRow
            stats={[
              { value: String(profile.auras), label: 'AURA' },
              { value: profile.rank !== null ? `#${profile.rank}` : '—', label: 'IN SCHOOL', color: '#6BF2C2' }
            ]}
          />

          {profile.blocked ? (
            <View className="mt-[22px]">
              <InfoCard icon="block">
                You've blocked this person, so their name, handle and socials stay hidden. Their rank and
                aura are the real ones.
              </InfoCard>
            </View>
          ) : (
            <>
              <SectionLabel>WHAT {possessive} WON</SectionLabel>
              {profile.superlatives.length === 0 ? (
                <View className="mt-[10px]">
                  <InfoCard icon="trophy">Nothing yet this month.</InfoCard>
                </View>
              ) : (
                <SuperlativeChips superlatives={profile.superlatives} lockedCount={0} />
              )}

              {Object.values(profile.socials).some(Boolean) && (
                <>
                  <SectionLabel>SOCIALS</SectionLabel>
                  <SocialsList socials={profile.socials} />
                </>
              )}
            </>
          )}

          <View className="mt-4">
            <InfoCard icon="eyeOff">
              You can't see who picked {first}, and {first} can't see who picked you. Nobody's aura is
              public.
            </InfoCard>
          </View>

          {/* 13A's crush-boost card, live now — the way in the Shop's crush row points at. Priced from
              the server (shop.boostCrushCost is ctx.tuning's number), so the admin tuning page moves
              this label too; the old hardcoded 300 predated the catalogue and is gone.

              After a purchase the card *becomes* the confirmation rather than popping an alert —
              which also retires the button until the boost is spent, since buying twice in a row just
              queues placements the first purchase already covers. */}
          {!profile.blocked && shop && (
            <View className="mt-4">
              <ToyShadow depth={6} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24}>
                <View className="p-[18px]">
                  <View className="flex-row items-center gap-[13px]">
                    <AuraIcon name="sparkle" size={26} color="#7C5CFF" />
                    <View className="flex-1">
                      <Text className="font-fredoka-700 text-[19px]" style={{ color: '#2D2A2E' }}>
                        {boostCrush.isSuccess ? `You're in ${first}'s polls 💘` : `Want ${first} to see you?`}
                      </Text>
                      <Text className="font-nunito-700 mt-[2px] text-[12.5px] leading-[18px]" style={{ color: '#8B888D' }}>
                        {boostCrush.isSuccess
                          ? `Their next ${shop.boostCrushUses} rounds have you in them. They'll never know it was bought.`
                          : `A crush boost puts you in ${first}'s next ${shop.boostCrushUses} rounds`}
                      </Text>
                    </View>
                  </View>
                  {boostCrush.isError && (
                    <Text className="font-nunito-800 mt-3 text-[12.5px] text-red-600">
                      {(boostCrush.error as Error).message}
                    </Text>
                  )}
                  {!boostCrush.isSuccess && (
                    <View className="mt-3">
                      <ToyShadow
                        depth={4}
                        shadowColor="#C43A7C"
                        backgroundColor="#FF5CA8"
                        radius={9999}
                        onPress={() => boostCrush.mutate(profile.id)}
                        disabled={boostCrush.isPending || shop.coins < shop.boostCrushCost}
                        style={boostCrush.isPending || shop.coins < shop.boostCrushCost ? { opacity: 0.5 } : undefined}
                      >
                        <View className="flex-row items-center justify-center gap-[7px] py-[13px]">
                          <AuraIcon name="bolt" size={16} color="#FFFFFF" filled />
                          <Text className="font-fredoka-700 text-[15.5px] text-white">
                            {boostCrush.isPending
                              ? 'Boosting…'
                              : shop.coins < shop.boostCrushCost
                                ? `Boost me · needs ${shop.boostCrushCost}, you have ${shop.coins}`
                                : `Boost me · ${shop.boostCrushCost}`}
                          </Text>
                        </View>
                      </ToyShadow>
                    </View>
                  )}
                </View>
              </ToyShadow>
            </View>
          )}

          <View className="mt-[18px]">
            <ProfileActionRow
              label={profile.blocked ? 'Report this person' : `Block or report ${first}`}
              // The pre-filled report entry point the picker was built for — 8A's "skipped when you
              // arrive from a profile".
              onPress={() => router.push({ pathname: '/report', params: { userId: profile.id } })}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
