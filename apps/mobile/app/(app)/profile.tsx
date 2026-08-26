import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIALS, normalizeHandle, type SocialKey } from '@aura/api-client';
import { useMe } from '../../src/hooks/useMe';
import { useUpdateMe, type UpdateMeInput } from '../../src/hooks/useUpdateMe';
import { useMySuperlatives } from '../../src/hooks/useProfile';
import { useAuras } from '../../src/hooks/useAuras';
import { useBoard } from '../../src/hooks/useBoard';
import { useFriendRequests } from '../../src/hooks/useFriends';
import { AuthError } from '../../src/components/authKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { EditProfileSheet } from '../../src/components/EditProfileSheet';
import { AuraIcon } from '../../src/components/AuraIcon';
import { SPARK_FILL } from '../../src/components/currency';
import { BrandTile } from '../../src/components/BrandMark';
import {
  ProfileBadge,
  ProfileIdentity,
  SectionLabel,
  StatRow,
  SuperlativeChips,
  gradeLabel
} from '../../src/components/profileKit';

/* 13A — your own profile. Rebuilt around one reading: you → your numbers → your trophies → your
   handles → one invite. Everything that used to interrupt that spine is gone, each for the same
   reason — it existed somewhere better:

   - the AURA stat: it's the Aura tab's number, restated under a smaller font.
   - "N friends" / "N requests waiting" rows: the requests count now rides the person-plus button as a
     badge, the same way unread rides the tab bar. (This retires the app's only friend-count display —
     deliberate: the person-plus is a standing prompt to add people whether you have 0 friends or 40.)
   - "Block or report someone": an exact duplicate of two Settings rows.
   - the "WHAT YOU'VE WON" label and its "Nothing yet" empty card: chips with ×3 on them already read
     as wins, and for a new user the section now simply *appears* the first time someone picks them —
     the section showing up is itself the reward. */

/* 13A — your own profile, the trophy case.

   How many superlative chips show without Infinite Aura. The design gates the rest behind the paywall
   ("locked superlatives open the paywall"), which only bites once you've actually won more than this. */
const FREE_CHIPS = 3;

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const { data: superlatives } = useMySuperlatives();
  const { data: board } = useBoard('overall');
  const { data: auras } = useAuras();
  const { data: friendRequests } = useFriendRequests();
  const updateMe = useUpdateMe();

  const [editing, setEditing] = useState(false);
  const [socialKey, setSocialKey] = useState<SocialKey | null>(null);
  const [draft, setDraft] = useState('');

  const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'You';
  // Handle and grade on one line; the school on its own — see metaSecondary in ProfileIdentity.
  const meta = ['@' + (me?.username || 'you'), gradeLabel(me?.grade)].filter(Boolean).join(' · ');

  const all = superlatives ?? [];
  const infiniteAura = !!me?.infiniteAura;
  const shown = infiniteAura ? all : all.slice(0, FREE_CHIPS);
  const locked = infiniteAura ? 0 : Math.max(0, all.length - FREE_CHIPS);

  /* Rank comes from the board, so this always matches the leaderboard — and since the pinned "You"
     row came off that screen, this is now the only place anyone outside the top ten sees their own
     rank at all. Null while the school is under the unlock threshold, which renders as a dash rather
     than a fake position. */
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
        /* +4, not +14. Most of the band above the avatar is the safe area, which isn't ours to take —
           this is the part that was, and with the gear no longer on its own line it was the last of
           the padding stacking up before any content. */
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: 21, paddingBottom: 10 }}
        showsVerticalScrollIndicator={false}
      >
      {/* The gear shares the identity's row rather than owning one above it.

          On its own line it cost its full 48pt plus the identity's top margin — 62pt of empty band
          between the safe area and the avatar, all of it to the left of a button sitting on the far
          right. Beside the identity that space is simply gone, and the two things that were already
          visually paired (who you are, and the door to your settings) now sit on one line.

          Flex siblings rather than an absolutely-positioned corner button: a long name can't run
          underneath it, because the identity is `flex-1` and the gear reserves its own width.

          One button up here, not two. The person-plus moved down into the body as the full-width
          Friends button — a 38px disc in the corner was the smallest thing on the screen doing the
          biggest job. Settings keeps the corner; it's chrome. */}
      <View className="flex-row items-start gap-3">
        <Pressable className="flex-1" onPress={() => setEditing(true)}>
          <ProfileIdentity
            name={name}
            meta={meta}
            metaSecondary={me?.school?.name ?? null}
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

        {/* `mt-[14px]` matches ProfileIdentity's own top margin, so the gear's top edge lines up with
            the avatar's rather than floating above it. */}
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={16}
          accessibilityLabel="Settings"
          className="mt-[14px] h-[48px] w-[48px] items-center justify-center rounded-pill bg-surface"
        >
          {/* Back to `sliders` — the design doc's own settings glyph, and the one this screen shipped
              with before the gear. The gear stays in AuraIcon (see its APP-AUTHORED note) but nothing
              draws it now; delete it if it's still unused next time that file is touched.

              34 rather than the gear's 38: sliders is two full-width rules with knobs on them, so it
              carries much more ink across its box than a ring-and-spokes shape and needs the smaller
              size to sit the same inside the 48pt disc. */}
          <AuraIcon name="sliders" size={34} color="#C1C0C0" />
        </Pressable>
      </View>

        {/* Three cells that don't repeat each other: where you stand, everything you've ever been
            given, and what you have to spend.

            LIFETIME AURA is not the count the Aura tab shows — that one is the 30-day window, and it
            goes *down* as cards fade. This is every aura ever received (`lifetimeAuras`, a server-side
            COUNT with no cutoff), so it only ever climbs. That's the difference that makes it worth a
            cell: a number that can't go down is the one worth watching.

            The sparks value is white now, with the yellow left on the bolt — colour where it
            identifies rather than decorates. Rank keeps its mint: only the sparks cell was in scope
            here, so its neighbour wasn't touched. */}
        <StatRow
          stats={[
            { value: rank !== null ? `#${rank}` : '—', label: 'IN SCHOOL', color: '#6BF2C2' },
            { value: String(auras?.lifetimeAuras ?? 0), label: 'LIFETIME AURA' },
            {
              value: String(me?.coins ?? 0),
              label: 'SPARKS',
              // Filled: a solid bolt reads as the currency token it is, where the outline read as chrome.
              icon: <AuraIcon name="bolt" size={20} color={SPARK_FILL} filled />
            }
          ]}
        />

        {/* No section label and no empty state: chips wearing ×3 already read as trophies, and until
            the first win the section doesn't exist. Locked chips open 15A's Infinite Aura screen —
            one paywall, not two visual languages for the same entitlement. */}
        {all.length > 0 && (
          <View className="mt-[18px]">
            <SuperlativeChips superlatives={shown} lockedCount={locked} onLockedPress={() => router.push('/infinite')} />
          </View>
        )}

        {/* The "Shown at school · never on a pick" caption came off — the product owner's call, and a
            knowing one: it was the consequence-stating kind of line the copy rule usually keeps, and
            nothing else in the app states it now. If handle visibility ever confuses anyone, the place
            to say it is the inline editor below, at the moment of typing, not a standing caption. */}
        <SectionLabel>SOCIALS</SectionLabel>

        {socialKey ? (
          <View className="mt-[10px] rounded-20 bg-surface px-4 py-[13px]">
            <View className="flex-row items-center gap-3">
              {/* Literally the same tile as the linked row on the profile itself, so editing a handle
                  and seeing it are recognisably the same thing. */}
              <BrandTile name={socialKey} size={38} />
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
          /* One row of brand tiles instead of the stacked card list. A linked platform is its tile at
             full colour with the handle under it; an unlinked one is the same tile dimmed with a plus
             riding its corner. The logo *is* the label, so the row needs no words of its own — tapping
             any tile opens the same inline editor above. */
          <View className="mt-[10px] flex-row gap-[9px]">
            {SOCIALS.map(s => {
              const handle = (me?.socials?.[s.key] as string) ?? '';
              const linked = handle.length > 0;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => startSocialEdit(s.key)}
                  accessibilityLabel={linked ? `${s.label}: @${handle}` : `Add ${s.label}`}
                  className="flex-1 items-center rounded-20 bg-surface py-[13px]"
                >
                  <View style={{ position: 'relative', opacity: linked ? 1 : 0.4 }}>
                    <BrandTile name={s.key} size={40} />
                  </View>
                  {linked ? (
                    <Text numberOfLines={1} className="font-nunito-800 mt-[7px] max-w-[86px] text-[11px] text-ink-secondary">
                      @{handle}
                    </Text>
                  ) : (
                    <View className="mt-[7px] h-[15px] items-center justify-center">
                      <AuraIcon name="plus" size={13} color="#727074" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {updateMe.isError && <AuthError message={(updateMe.error as Error).message} />}

        {/* The two growth actions, stacked and full width — this replaced the 38px person-plus disc in
            the header, which was the smallest control on the screen doing the biggest job.

            Friends leads and wears the requests count in its label when there are any: "2 friend
            requests" is a button about people waiting on you, which beats a generic verb every time
            it's true. Mint for in-app (add people already here), pink for outward (invite people who
            aren't) — the same in/out split the rest of the app's buttons use. */}
        <View className="mt-[22px] gap-[10px]">
          <ToyShadow
            depth={4}
            shadowColor="#3FBF95"
            backgroundColor="#6BF2C2"
            radius={9999}
            onPress={() => router.push('/add')}
          >
            <View className="flex-row items-center justify-center gap-[8px] py-[15px]">
              <AuraIcon name="personPlus" size={19} color="#0A3B2C" />
              <Text className="font-fredoka-700 text-[17px]" style={{ color: '#0A3B2C' }}>
                {friendRequests?.length
                  ? `${friendRequests.length} friend ${friendRequests.length === 1 ? 'request' : 'requests'}`
                  : 'Friends'}
              </Text>
            </View>
          </ToyShadow>

          {/* The invite, cut from a headline card to the button alone. "Bring your class" and its
              subtitle were describing the button under them; the one fact worth words — the board
              unlocking — rides the label, and only while it's true. */}
          <ToyShadow depth={4} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999} onPress={invite}>
            <View className="flex-row items-center justify-center gap-[8px] py-[15px]">
              <AuraIcon name="share" size={18} color="#FFFFFF" />
              <Text className="font-fredoka-700 text-[17px] text-white">
                {board && !board.unlocked
                  ? `Invite ${Math.max(0, board.unlockThreshold - board.memberCount)} more — unlocks the board`
                  : 'Invite your class'}
              </Text>
            </View>
          </ToyShadow>
        </View>
      </ScrollView>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
    </>
  );
}
