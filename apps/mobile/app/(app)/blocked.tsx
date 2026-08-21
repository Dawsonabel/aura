import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBlockedPeople, type BlockedPerson } from '../../src/hooks/useBlockedPeople';
import { useUnblockUser } from '../../src/hooks/useUnblockUser';
import { AuthError, AuthShell } from '../../src/components/authKit';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { InfoCard, SettingsNav } from '../../src/components/settingsKit';
import { InlineFailure, SkeletonRows } from '../../src/components/stateKit';
import { AuraIcon } from '../../src/components/AuraIcon';

/* 8A's blocked list. Unblock is muted while the caller's own report on that person is still open —
   `reportOpen` comes from the server so the client never has to see report rows to know. */

function displayName(u: { firstName: string | null; lastName: string | null }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || 'Someone';
}

function initials(u: { firstName: string | null; lastName: string | null }): string {
  return ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase() || '?';
}

/* "Blocked 3 weeks ago" / "Blocked in April" / "today" — the design uses all three registers, so
   this picks by distance the way a person would. Null (blocked before timestamps were recorded)
   renders no subtitle at all rather than a guess. */
function blockedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'Blocked today';
  if (days === 1) return 'Blocked yesterday';
  if (days < 7) return `Blocked ${days} days ago`;
  if (days < 35) {
    const weeks = Math.round(days / 7);
    return `Blocked ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return `Blocked in ${new Date(iso).toLocaleDateString(undefined, { month: 'long' })}`;
}

export default function Blocked() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useBlockedPeople();
  const unblock = useUnblockUser();
  const [pending, setPending] = useState<BlockedPerson | null>(null);

  const people = data ?? [];
  const count = people.length;
  const headline =
    count === 0
      ? "You haven't blocked anyone."
      : `${count === 1 ? 'One person' : `${count} people`}. They can't see you in a round, and you can't see them. None of them know.`;

  return (
    <AuthShell aboveTabBar>
      <SettingsNav title="Blocked people" onBack={() => router.back()} />
      <Text className="font-nunito-700 mt-4 text-[14px] leading-[20px] text-ink-muted">
        {isLoading ? 'Loading…' : headline}
      </Text>

      <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <SkeletonRows n={3} height={66} radius={20} avatarSize={42} avatarRadius={100} />
        ) : isError ? (
          <InlineFailure
            icon="block"
            title="Your blocked list didn't load"
            body="Nothing has changed — we just couldn't read it back."
            onRetry={() => refetch()}
          />
        ) : (
          <View className="gap-2">
            {people.map(entry => (
              <BlockedRow key={entry.user.id} entry={entry} onUnblock={() => setPending(entry)} />
            ))}
          </View>
        )}

        {unblock.isError && <AuthError message={(unblock.error as Error).message} />}

        {count > 0 && (
          <View className="mt-[18px]">
            {/* The design said these auras were "gone for good either way", but blocking hides them
                rather than deleting them (see aurasFor) — so the copy says what actually happens. */}
            <InfoCard icon="reroll">
              While someone's blocked, the aura they gave you is hidden from your inbox. Unblocking puts you both
              back in each other's rounds and brings it back.
            </InfoCard>
          </View>
        )}
      </ScrollView>

      <View className="pb-1 pt-4">
        <Pressable
          onPress={() => router.push('/report')}
          className="flex-row items-center justify-center gap-[9px] rounded-pill bg-surface py-[15px]"
        >
          <AuraIcon name="flag" size={17} color="#C1C0C0" />
          <Text className="font-nunito-900 text-[15px] text-ink-secondary">Report someone</Text>
        </Pressable>
      </View>

      <ConfirmSheet
        visible={pending !== null}
        title={pending ? `Unblock ${displayName(pending.user)}?` : ''}
        body={
          <>
            You'll both show up in each other's rounds again, and any aura they already gave you comes back
            into your inbox.
          </>
        }
        confirmLabel="Unblock"
        cancelLabel="Keep them blocked"
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target) unblock.mutate(target.user.id);
        }}
        onCancel={() => setPending(null)}
      />
    </AuthShell>
  );
}

function BlockedRow({ entry, onUnblock }: { entry: BlockedPerson; onUnblock: () => void }) {
  const when = blockedLabel(entry.blockedAt);
  return (
    <View className="flex-row items-center gap-3 rounded-20 bg-surface px-[15px] py-3">
      <View className="h-[42px] w-[42px] items-center justify-center rounded-pill" style={{ backgroundColor: '#524F53' }}>
        <Text className="font-fredoka-700 text-[16px]" style={{ color: '#B0AEB2' }}>
          {initials(entry.user)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-nunito-900 text-[15px] text-white">{displayName(entry.user)}</Text>
        {entry.reportOpen ? (
          <View className="mt-[2px] flex-row items-center gap-[6px]">
            <View className="rounded-pill px-2 py-[3px]" style={{ backgroundColor: '#5A3247' }}>
              <Text className="font-nunito-900 text-[10.5px]" style={{ color: '#FF9CCB' }}>
                REPORT OPEN
              </Text>
            </View>
            {when && <Text className="font-nunito-700 text-[12px] text-ink-dim">{when.replace('Blocked ', '')}</Text>}
          </View>
        ) : (
          when && <Text className="font-nunito-700 mt-[2px] text-[12px] text-ink-dim">{when}</Text>
        )}
      </View>
      {/* Muted while a report is open, so an unblock can't quietly undo the thing an admin is still
          looking at. The row stays listed — it just can't be acted on yet. */}
      <Pressable
        onPress={entry.reportOpen ? undefined : onUnblock}
        disabled={entry.reportOpen}
        className="rounded-pill px-[15px] py-[9px]"
        style={{ backgroundColor: '#4A474B' }}
      >
        <Text className="font-nunito-900 text-[12.5px]" style={{ color: entry.reportOpen ? '#727074' : '#C1C0C0' }}>
          Unblock
        </Text>
      </Pressable>
    </View>
  );
}
