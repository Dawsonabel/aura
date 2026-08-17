import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENDER_LABEL } from '@aura/api-client';
import { usePublicProfile } from '../../src/hooks/useProfile';
import { useMe } from '../../src/hooks/useMe';
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
  const { data: me } = useMe();
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
          <ProfileIdentity
            name={profile.name}
            meta={[
              profile.username ? `@${profile.username}` : null,
              gradeLabel(profile.grade),
              profile.schoolName
            ]
              .filter(Boolean)
              .join(' · ')}
            avatarColor={profile.blocked ? '#524F53' : '#7C6CF5'}
            avatarShadow={profile.blocked ? '#3E3B40' : '#5A4BC4'}
            badge={
              profile.rank === 1 ? (
                <ProfileBadge label="#1 this week" backgroundColor="#FFD84D" shadowColor="#D4AC17" color="#3A2A00" />
              ) : undefined
            }
          />

          {/* Two stats, not three: your balance is yours alone. */}
          <StatRow
            stats={[
              { value: String(profile.flames), label: 'AURA' },
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

          {/* 13A's crush-boost card. Priced from the server's own constant would be better, but
              boostCrush hardcodes 300 in the resolver and exposes no catalogue — see §7.2. The number
              here is therefore duplicated, which is exactly the drift that section warns about. */}
          {!profile.blocked && (
            <View className="mt-4">
              <ToyShadow depth={6} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24}>
                <View className="flex-row items-center gap-[13px] p-[18px]">
                  <AuraIcon name="sparkle" size={26} color="#7C5CFF" />
                  <View className="flex-1">
                    <Text className="font-fredoka-700 text-[19px]" style={{ color: '#2D2A2E' }}>
                      Want {first} to see you?
                    </Text>
                    <Text className="font-nunito-700 mt-[2px] text-[12.5px] leading-[18px]" style={{ color: '#8B888D' }}>
                      A crush boost puts you in {first}'s polls · 300 coins
                      {me && me.coins < 300 ? ` · you have ${me.coins}` : ''}
                    </Text>
                  </View>
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
