import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { REPORT_REASONS, REPORT_REASON_MAX, composeReportReason, type ReportReason } from '@aura/api-client';
import { useSchoolmates, type Schoolmate } from '../../src/hooks/useSchoolmates';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { useBlockUser } from '../../src/hooks/useBlockUser';
import { useReportUser } from '../../src/hooks/useReportUser';
import { useMe } from '../../src/hooks/useMe';
import { AuthError, AuthShell } from '../../src/components/authKit';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { InfoCard, SettingsNav, Toggle } from '../../src/components/settingsKit';
import { EmptyState, SkeletonRows } from '../../src/components/stateKit';
import { ToyShadow } from '../../src/components/ToyShadow';
import { AuraIcon, type AuraIconName } from '../../src/components/AuraIcon';
import { avatarAccent } from '../../src/components/profileKit';

/* 8A "Report · block · blocked list". Two steps in one route: pick a person, then say what's wrong.
   Arriving with a `userId` param (from a profile or a aura) skips straight to the second step, per
   the design's note that the picker is skipped when the person is passed in.

   The reason chips are not an enum server-side — `reportUser` stores free text capped at 300 chars,
   which apps/web's admin table shows verbatim. composeReportReason() writes the chip label into
   that text so an admin sees the category without a schema change. */

function displayName(u: { firstName: string | null; lastName: string | null }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || 'Someone';
}

function initials(u: { firstName: string | null; lastName: string | null }): string {
  return ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase() || '?';
}

function metaLine(u: { username: string | null; grade: string | null }): string {
  const grade = u.grade && /^\d+$/.test(u.grade) ? `${u.grade}th` : u.grade;
  return [u.username ? `@${u.username}` : null, grade].filter(Boolean).join(' · ');
}

/* The deterministic avatar colour is profileKit's `avatarAccent` now. This file had its own palette
   in a different order, so the same person was one colour here and another on the People screen —
   which defeated the entire point of deriving it from a stable id. */

export default function Report() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const { data: schoolmates } = useSchoolmates();
  const { data: blockedPeople } = useBlockedPeople();
  const [selectedId, setSelectedId] = useState<string | null>(userId ?? null);

  const blockedIds = useMemo(() => new Set((blockedPeople ?? []).map(b => b.user.id)), [blockedPeople]);
  /* The picker searches schoolmates, which includes people already blocked so they can be shown
     greyed out — `blockedPeople` is what says which. Someone reached via a deep link who isn't in
     the directory (different school, deleted) simply has no row to select. */
  const selected = (schoolmates ?? []).find(s => s.id === selectedId) ?? null;

  if (!selected) {
    return (
      <PickPerson
        schoolmates={schoolmates}
        blockedIds={blockedIds}
        onPick={setSelectedId}
        onBack={() => router.back()}
        // A userId that matched nobody would otherwise render the picker with no explanation.
        notFound={selectedId !== null}
      />
    );
  }

  return (
    <ReasonForm
      person={selected}
      alreadyBlocked={blockedIds.has(selected.id)}
      cameFromPicker={!userId}
      onDone={() => router.back()}
      onPickAnother={() => setSelectedId(null)}
    />
  );
}

function PickPerson({
  schoolmates,
  blockedIds,
  onPick,
  onBack,
  notFound
}: {
  schoolmates: Schoolmate[] | undefined;
  blockedIds: Set<string>;
  onPick: (id: string) => void;
  onBack: () => void;
  notFound: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (schoolmates ?? []).filter(s =>
    q.length === 0 ? true : `${displayName(s)} ${s.username ?? ''}`.toLowerCase().includes(q)
  );

  return (
    <AuthShell aboveTabBar>
      <SettingsNav title="Report someone" onBack={onBack} />
      <Text className="font-nunito-700 mt-4 text-[14px] leading-[20px] text-ink-muted">
        Search anyone at your school. They're never told you looked them up.
      </Text>

      <View className="mt-[14px] flex-row items-center gap-[10px] rounded-20 bg-surface px-4 py-[14px]">
        <AuraIcon name="search" size={17} color="#7A787C" />
        <TextInput
          className="font-nunito-800 flex-1 text-[15px] text-white"
          placeholder="Search by name or handle"
          placeholderTextColor="#848286"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor="#6BF2C2"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {notFound && (
        <View className="mt-3">
          <AuthError message="We couldn't find that person at your school. Search for them instead." />
        </View>
      )}

      <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
        {schoolmates === undefined ? (
          // 10A: a skeleton mirroring the real rows, not a "Loading…" line.
          <SkeletonRows n={4} height={66} radius={20} avatarSize={42} avatarRadius={100} />
        ) : matches.length === 0 ? (
          /* 10A quotes the query back and names the reason — search is school-scoped, which is the
             single most likely explanation for a miss and isn't obvious from the field. */
          <EmptyState
            icon="search"
            title={q ? `No one at your school matches "${query.trim()}"` : 'Nobody else is here yet'}
            body={
              q
                ? 'Search only covers your own school. Check the spelling, or try their handle without numbers.'
                : "You're the only person from your school on Aura so far."
            }
          />
        ) : (
          <View className="gap-2">
            {matches.map(person => (
              <PersonRow
                key={person.id}
                person={person}
                blocked={blockedIds.has(person.id)}
                onPress={() => onPick(person.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View className="pb-1 pt-4">
        <InfoCard icon="flag">
          If someone is in danger right now, call 911 or tell an adult at school. Reports here aren't read
          instantly.
        </InfoCard>
      </View>
    </AuthShell>
  );
}

function PersonRow({ person, blocked, onPress }: { person: Schoolmate; blocked: boolean; onPress: () => void }) {
  /* Already-blocked rows stay visible but inert, exactly as designed: you can still see they exist
     (so the search doesn't look broken) without being able to re-report through this screen. */
  return (
    <Pressable
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      className="flex-row items-center gap-3 rounded-20 bg-surface px-[15px] py-3"
      style={blocked ? { opacity: 0.55 } : undefined}
    >
      <View
        className="h-[42px] w-[42px] items-center justify-center rounded-pill"
        style={{ backgroundColor: blocked ? '#524F53' : avatarAccent(person.id).bg }}
      >
        {/* Ink from the accent, not a flat white: two of the five fills are light enough that white
            initials on them were unreadable. */}
        <Text
          className="font-fredoka-700 text-[16px]"
          style={{ color: blocked ? '#B0AEB2' : avatarAccent(person.id).ink }}
        >
          {initials(person)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-nunito-900 text-[15px]" style={{ color: blocked ? '#C1C0C0' : '#FFFFFF' }}>
          {displayName(person)}
        </Text>
        <Text className="font-nunito-700 mt-[2px] text-[12px] text-ink-dim">
          {blocked ? 'Already blocked' : metaLine(person)}
        </Text>
      </View>
      {!blocked && <Text className="text-[18px] text-ink-faint">›</Text>}
    </Pressable>
  );
}

function ReasonForm({
  person,
  alreadyBlocked,
  cameFromPicker,
  onDone,
  onPickAnother
}: {
  person: Schoolmate;
  alreadyBlocked: boolean;
  cameFromPicker: boolean;
  onDone: () => void;
  onPickAnother: () => void;
}) {
  const { data: me } = useMe();
  const reportUser = useReportUser();
  const blockUser = useBlockUser();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  // Design defaults this on. Someone already blocked doesn't need it, so it starts off there.
  const [alsoBlock, setAlsoBlock] = useState(!alreadyBlocked);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = (person.firstName || '').trim() || 'They';
  const busy = reportUser.isPending || blockUser.isPending;

  async function send() {
    if (!reason) return;
    setError(null);
    try {
      await reportUser.mutateAsync({ userId: person.id, reason: composeReportReason(reason, detail) });
      /* Block after the report, and only if the report landed: blocking first would hide them from
         the picker while leaving no report filed if the second call failed. */
      if (alsoBlock && !alreadyBlocked) await blockUser.mutateAsync(person.id);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const blockedNow = alsoBlock || alreadyBlocked;

  return (
    <AuthShell aboveTabBar>
      {/* The design's bare "‹" — goes back to the picker rather than off the screen, since the
          person here was chosen a moment ago and changing your mind about *who* is the likely
          reason for tapping it. Arriving with a userId param means there's no picker behind it, so
          it leaves the flow instead. */}
      <Pressable onPress={cameFromPicker ? onPickAnother : onDone} hitSlop={12} className="self-start">
        <Text className="text-[22px] leading-[22px] text-ink-faint">‹</Text>
      </Pressable>

      <ScrollView className="mt-[14px]" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center gap-3">
          <View
            className="h-[46px] w-[46px] items-center justify-center rounded-pill"
            style={{ backgroundColor: avatarAccent(person.id).bg }}
          >
            <Text className="font-fredoka-700 text-[17px]" style={{ color: avatarAccent(person.id).ink }}>
              {initials(person)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-fredoka-700 text-[22px] text-white">Report {displayName(person)}</Text>
            <Text className="font-nunito-700 mt-[1px] text-[12.5px] text-ink-dim">{metaLine(person)}</Text>
          </View>
        </View>

        <Text className="font-nunito-900 mt-4 text-[12.5px] text-ink-muted">WHAT'S HAPPENING?</Text>
        <View className="mt-[10px] gap-2">
          {REPORT_REASONS.map(r => (
            <ReasonChip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>

        <View className="mt-4 flex-row items-baseline justify-between">
          <Text className="font-nunito-900 text-[12.5px] text-ink-muted">ANYTHING ELSE TO ADD?</Text>
          <Text className="font-nunito-800 text-[11.5px] text-ink-faint">
            {detail.length} / {REPORT_REASON_MAX}
          </Text>
        </View>
        <TextInput
          className="font-nunito-700 mt-[9px] rounded-18 bg-surface px-[15px] py-[13px] text-[13.5px] leading-[19px] text-white"
          style={{ minHeight: 56, textAlignVertical: 'top' }}
          placeholder="Optional. Names, dates, what was said — it all helps."
          placeholderTextColor="#727074"
          multiline
          /* The chip label is written into the same 300-char field, so the free-text budget is what's
             left after it — otherwise the server would silently truncate the detail. */
          maxLength={Math.max(0, REPORT_REASON_MAX - ((reason?.length ?? 0) + 3))}
          selectionColor="#6BF2C2"
          value={detail}
          onChangeText={setDetail}
        />

        <View className="mt-4 flex-row items-center gap-3 rounded-20 bg-raised px-4 py-[14px]">
          <View className="flex-1">
            <Text className="font-nunito-900 text-[14px] text-white">
              {alreadyBlocked ? 'Already blocked' : 'Block them too'}
            </Text>
            <Text className="font-nunito-700 mt-[2px] text-[12px] leading-[17px] text-ink-muted">
              {alreadyBlocked
                ? "You blocked them earlier — you're already out of each other's grid."
                : "You both disappear from each other's grid right away"}
            </Text>
          </View>
          <Toggle on={blockedNow} disabled={alreadyBlocked} onPress={() => setAlsoBlock(v => !v)} />
        </View>

        <AuthError message={error} />
      </ScrollView>

      <View className="items-center gap-3 pb-1 pt-4">
        {/* Same shape as authKit's AuthButton — the width has to live on a wrapper, since ToyShadow
            sizes to its content — but pink rather than mint, because sending a report is one-way. */}
        {reason && !busy ? (
          <View className="w-full">
            <ToyShadow depth={5} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999} onPress={send}>
              <View className="items-center py-[17px]">
                <Text className="font-fredoka-700 text-[18px] text-white">Send report</Text>
              </View>
            </ToyShadow>
          </View>
        ) : (
          <View className="w-full items-center rounded-pill bg-surface py-[17px]">
            <Text className="font-fredoka-700 text-[18px] text-ink-faint">{busy ? 'Sending…' : 'Send report'}</Text>
          </View>
        )}
        <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
          {first} is never told who reported them.
        </Text>
      </View>

      <ConfirmSheet
        visible={sent}
        tone="positive"
        icon="shield"
        title="Report sent"
        body={
          blockedNow ? (
            <>
              {displayName(person)} is blocked and you're out of each other's grid. They aren't told about any
              of it.
            </>
          ) : (
            <>
              {displayName(person)} isn't told about any of it. You can still block them any time from
              Settings.
            </>
          )
        }
        confirmLabel="Done"
        cancelLabel="Report someone else"
        onConfirm={onDone}
        onCancel={() => {
          setSent(false);
          setReason(null);
          setDetail('');
          onPickAnother();
        }}
      >
        <View className="mt-5 gap-2">
          <SheetNote icon="eye">
            {me?.school?.name ? `A ${me.school.name} admin reviews it.` : 'An admin reviews it.'}
          </SheetNote>
          <SheetNote icon="mail">You'll get a note in your inbox when it's closed.</SheetNote>
        </View>
      </ConfirmSheet>
    </AuthShell>
  );
}

function SheetNote({ icon, children }: { icon: AuraIconName; children: React.ReactNode }) {
  return (
    <View className="flex-row gap-[11px] rounded-18 bg-surface px-[15px] py-[13px]">
      <AuraIcon name={icon} size={18} color="#C1C0C0" />
      <Text className="font-nunito-700 flex-1 text-[13px] leading-[18px] text-ink-secondary">{children}</Text>
    </View>
  );
}

function ReasonChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  if (selected) {
    return (
      <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={18} onPress={onPress}>
        <View className="flex-row items-center gap-[11px] px-[15px] py-[13px]">
          <Text className="font-nunito-900 flex-1 text-[14px]" style={{ color: '#2D2A2E' }}>
            {label}
          </Text>
          <View className="h-[23px] w-[23px] items-center justify-center rounded-pill bg-mint">
            <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#0A3B2C' }}>
              ✓
            </Text>
          </View>
        </View>
      </ToyShadow>
    );
  }
  return (
    <Pressable onPress={onPress} className="rounded-18 bg-surface px-[15px] py-[13px]">
      <Text className="font-nunito-800 text-[14px] text-ink-secondary">{label}</Text>
    </Pressable>
  );
}

