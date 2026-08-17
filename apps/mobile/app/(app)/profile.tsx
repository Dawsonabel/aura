import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIALS, normalizeHandle, type SocialKey } from '@aura/api-client';
import { useMe } from '../../src/hooks/useMe';
import { useUpdateMe, type UpdateMeInput } from '../../src/hooks/useUpdateMe';
import { useMySuperlatives } from '../../src/hooks/useProfile';
import { useBoard } from '../../src/hooks/useBoard';
import { useFlames } from '../../src/hooks/useFlames';
import { AuthError } from '../../src/components/authKit';
import { InfoCard } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { EditProfileSheet } from '../../src/components/EditProfileSheet';
import { SkeletonBlock } from '../../src/components/stateKit';
import { PersonPlusButton } from '../../src/components/voteKit';
import { AuraIcon } from '../../src/components/AuraIcon';
import { COIN_FILL } from '../../src/components/coin';
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

/* Both numbers on one row, and only on your own profile.

   14A's rule is that follower and following counts appear nowhere — in a 200-person school a public one
   is a popularity score by another name. Your own is the stated exception: it's self-knowledge, not a
   ranking, and it's the number that tells you whether following anyone is working. Nothing renders it on
   someone else's profile, and the server refuses to compute it for anyone but you. */
function peopleRowLabel(following: number, followers: number): string {
  /* Both numbers always show, zero included. Hiding "0 follow you" hid the whole idea that the number
     existed — and zero is the reading that actually prompts you to do something about it. */
  return `Following ${following} · ${followers} ${followers === 1 ? 'follows' : 'follow'} you`;
}

/* 13A — your own profile, the trophy case.

   How many superlative chips show without God Mode. The design gates the rest behind the paywall
   ("locked superlatives open the paywall"), which only bites once you've actually won more than this. */
const FREE_CHIPS = 3;

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const { data: superlatives, isLoading: chipsLoading } = useMySuperlatives();
  const { data: board } = useBoard('overall');
  const { data: flames } = useFlames();
  const updateMe = useUpdateMe();

  const [editing, setEditing] = useState(false);
  const [socialKey, setSocialKey] = useState<SocialKey | null>(null);
  const [draft, setDraft] = useState('');

  const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'You';
  const meta = ['@' + (me?.username || 'you'), gradeLabel(me?.grade), me?.school?.name].filter(Boolean).join(' · ');

  const all = superlatives ?? [];
  const godMode = !!me?.godMode;
  const shown = godMode ? all : all.slice(0, FREE_CHIPS);
  const locked = godMode ? 0 : Math.max(0, all.length - FREE_CHIPS);

  /* Aura total comes from the Inbox query (the 30-day window), and rank from the board — so the two
     numbers on this screen always match the two screens they came from. Rank is null while the school
     is under the unlock threshold, which renders as a dash rather than a fake position. */
  const auraCount = flames?.flames.length ?? 0;
  const rank = board?.me?.rank ?? null;

  function startSocialEdit(key: SocialKey) {
    setSocialKey(key);
    setDraft((me?.socials?.[key] as string) ?? '');
  }

  function saveSocial() {
    if (!socialKey) return;
    const handle = normalizeHandle(draft);
    updateMe.mutate({ socials: { [socialKey]: handle || null } } as UpdateMeInput);
    setSocialKey(null);
    setDraft('');
  }

  async function invite() {
    const remaining = board ? Math.max(0, board.unlockThreshold - board.memberCount) : 0;
    const where = me?.school?.name ?? 'my school';
    try {
      await Share.share({
        message:
          remaining > 0
            ? `come vote on Aura — anonymous, ${where} only. we need ${remaining} more to unlock the board 🔥`
            : `come vote on Aura — anonymous, ${where} only 🔥`
      });
    } catch {
      // Dismissing the share sheet throws on some platforms; nothing to report.
    }
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-ground"
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 21, paddingBottom: 10 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-end gap-[9px]">
          {/* 14A: the People screen's two entry points are the mint person-plus in the Vote and Me
              headers. The "Following N · find more people" row further down stays — it carries the
              count, which is the thing that makes the button worth pressing. */}
          <PersonPlusButton onPress={() => router.push('/add')} />
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={16}
            accessibilityLabel="Settings"
            className="h-[40px] w-[40px] items-center justify-center rounded-pill bg-surface"
          >
            <AuraIcon name="sliders" size={20} color="#C1C0C0" />
          </Pressable>
        </View>

        <Pressable onPress={() => setEditing(true)}>
          <ProfileIdentity
            name={name}
            meta={meta}
            badge={
              /* Real streak now — `me.streak` is derived server-side and reads 0 the moment a day is
                 missed, so a stale run can't sit here looking alive. Hidden at 0 rather than showing
                 "0 day streak", which is just a reminder you lost it. */
              me && me.streak > 0 ? (
                <ProfileBadge
                  label={`🔥 ${me.streak} day streak`}
                  backgroundColor="#F2703A"
                  shadowColor="#C4501E"
                  color="#FFFFFF"
                />
              ) : undefined
            }
          />
        </Pressable>

        <StatRow
          stats={[
            { value: String(auraCount), label: 'AURA' },
            { value: rank !== null ? `#${rank}` : '—', label: 'IN SCHOOL', color: '#6BF2C2' },
            { value: String(me?.coins ?? 0), label: 'COINS', color: COIN_FILL }
          ]}
        />

        <SectionLabel>WHAT YOU'VE WON</SectionLabel>
        {chipsLoading ? (
          <View className="mt-[10px]">
            <SkeletonBlock height={36} width={160} radius={100} />
          </View>
        ) : all.length === 0 ? (
          <View className="mt-[10px]">
            <InfoCard icon="trophy">
              Nothing yet — a superlative shows up here the first time someone picks you for one.
            </InfoCard>
          </View>
        ) : (
          /* Locked chips now open 15A's Infinite Aura screen rather than the old God Mode overlay.
             Two paywalls selling the same entitlement, in two different visual languages, is worse than
             either one alone. */
          <SuperlativeChips superlatives={shown} lockedCount={locked} onLockedPress={() => router.push('/infinite')} />
        )}

        <SectionLabel trailing={<Text className="font-nunito-800 text-[11.5px] text-ink-faint">Shown at school · never on a pick</Text>}>
          SOCIALS
        </SectionLabel>

        {socialKey ? (
          <View className="mt-[10px] rounded-20 bg-surface px-4 py-[13px]">
            <View className="flex-row items-center gap-3">
              <View
                className="h-[38px] w-[38px] items-center justify-center"
                style={{ borderRadius: 12, backgroundColor: SOCIALS.find(s => s.key === socialKey)!.color }}
              >
                <Text style={{ fontSize: 18 }}>{SOCIALS.find(s => s.key === socialKey)!.emoji}</Text>
              </View>
              <View className="flex-1 flex-row items-center gap-1">
                <Text className="font-fredoka-700 text-[15px] text-ink-dim">@</Text>
                <TextInput
                  className="font-nunito-800 flex-1 text-[15px] text-white"
                  placeholder={SOCIALS.find(s => s.key === socialKey)!.placeholder}
                  placeholderTextColor="#848286"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  selectionColor="#6BF2C2"
                  value={draft}
                  // Strip a typed @ as it goes in — the static one is already rendered above.
                  onChangeText={t => setDraft(t.replace(/^@+/, ''))}
                  onSubmitEditing={saveSocial}
                  returnKeyType="done"
                />
              </View>
            </View>
            <View className="mt-3 flex-row gap-2">
              <Pressable onPress={saveSocial} className="flex-1 items-center rounded-pill bg-mint py-[11px]">
                <Text className="font-nunito-900 text-[13.5px]" style={{ color: '#0A3B2C' }}>
                  {draft.trim() ? 'Save' : 'Remove'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSocialKey(null)}
                className="flex-1 items-center rounded-pill py-[11px]"
                style={{ backgroundColor: '#4A474B' }}
              >
                <Text className="font-nunito-900 text-[13.5px] text-ink-secondary">Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <SocialsList socials={me?.socials ?? {}} onEdit={startSocialEdit} />
        )}

        {updateMe.isError && <AuthError message={(updateMe.error as Error).message} />}

        {/* 13A's invite card. The design's "3 of 5 joined" needs invite attribution, which doesn't
            exist — so the subtitle uses the school-unlock progress, which is real. */}
        <View className="mt-[18px]">
          <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24}>
            <View className="p-4">
              <View className="flex-row items-center gap-[11px]">
                <AuraIcon name="mail" size={24} color="#8B888D" />
                <View className="flex-1">
                  <Text className="font-fredoka-700 text-[19px]" style={{ color: '#2D2A2E' }}>
                    Bring your class
                  </Text>
                  <Text className="font-nunito-700 mt-[2px] text-[12.5px]" style={{ color: '#8B888D' }}>
                    {board
                      ? board.unlocked
                        ? `${board.memberCount} at your school · more classmates, more polls`
                        : `${board.memberCount} of ${board.unlockThreshold} · unlocks the board`
                      : 'More classmates means more people who can pick you'}
                  </Text>
                </View>
              </View>
              <View className="mt-3">
                <ToyShadow depth={4} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999} onPress={invite}>
                  <View className="items-center py-[13px]">
                    <Text className="font-fredoka-700 text-[16px] text-white">
                      {board && !board.unlocked
                        ? `Invite ${Math.max(0, board.unlockThreshold - board.memberCount)} more`
                        : 'Invite your class'}
                    </Text>
                  </View>
                </ToyShadow>
              </View>
            </View>
          </ToyShadow>
        </View>

        <View className="mt-[18px] gap-2">
          {/* The people surface. Shows the follow count because following is what weights your polls —
              a user with zero follows is seeing pure strangers and has no way to know that. */}
          <ProfileActionRow
            label={peopleRowLabel(me?.following?.length ?? 0, me?.followerCount ?? 0)}
            onPress={() => router.push('/add')}
          />
          <ProfileActionRow label="Block or report someone" onPress={() => router.push('/report')} />
        </View>
      </ScrollView>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
    </>
  );
}
