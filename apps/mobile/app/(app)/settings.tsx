import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { AuthShell } from '../../src/components/authKit';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { SettingsNav, SettingsRow, SettingsSection } from '../../src/components/settingsKit';
import { AuraIcon } from '../../src/components/AuraIcon';
import { useActivateInfiniteAura } from '../../src/hooks/useActivateInfiniteAura';
import { useDevTools } from '../../src/hooks/useDevTools';
import type { DevToolAction, DevToolKind, DevResult } from '@aura/api-client';
import type { AuraIconName } from '../../src/components/AuraIcon';
import { ToyShadow } from '../../src/components/ToyShadow';

function initials(first: string | null, last: string | null): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || 'A';
}

/* One dev button. Two lines, because unlike the Infinite Aura toggle above it these have no visible
   on/off state to read back — the label says what it does and the detail says what that means for
   the state you're about to go look at. This is the one place in the app where an explanatory line
   earns itself: nothing on screen shows the consequence, and getting it wrong costs a reseed.

   The result replaces the detail line in the row that produced it, rather than collecting at the
   bottom of the section. A single shared line under the last button was invisible in practice: the
   DEV list is taller than the screen, so whichever row you press is usually nowhere near the bottom,
   and pressing a button and seeing nothing happen reads as the button not working. (It cost me two
   rounds of debugging a callback that was firing perfectly the whole time.) In the row, the feedback
   is by definition where you were already looking. */
function DevAction({
  icon,
  label,
  detail,
  busy,
  result,
  onPress
}: {
  icon: AuraIconName;
  label: string;
  detail: string;
  busy: boolean;
  result?: DevResult | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className="flex-row items-center gap-[13px] rounded-20 bg-surface px-4 py-[12px]"
      style={busy ? { opacity: 0.5 } : undefined}
    >
      <AuraIcon name={icon} size={20} color={result?.ok ? '#6BF2C2' : '#727074'} />
      <View className="flex-1">
        <Text className="font-nunito-800 text-[14px] text-ink-secondary">{label}</Text>
        {result ? (
          <Text
            className="font-nunito-800 mt-[2px] text-[11.5px]"
            style={{ color: result.ok ? '#6BF2C2' : '#FF5CA8' }}
          >
            {result.message}
          </Text>
        ) : (
          <Text className="font-nunito-700 mt-[2px] text-[11.5px] text-ink-faint">{detail}</Text>
        )}
      </View>
      {busy && <Text className="font-nunito-900 text-[12.5px] text-ink-faint">…</Text>}
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { data: me } = useMe();
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Dev-only toggle below; the hook is harmless in release since nothing renders that calls it.
  const infiniteAura = useActivateInfiniteAura();

  /* Dev tools state. Same reasoning as the hook above — the rows that use these are inside a
     `__DEV__` block the bundler drops, so in a release build this is a mutation nothing can fire and
     two pieces of state nothing reads.

     `busyKind` rather than leaning on `devTools.isPending`: one mutation serves every button, so
     `isPending` alone can't say *which* is running, and every row would spin at once. */
  const devTools = useDevTools();
  const [busyKind, setBusyKind] = useState<DevToolKind | null>(null);
  /* Kept with the kind that produced it, so the result can be rendered in that row rather than in a
     shared line the list is usually scrolled away from. Only the most recent is held — these are
     one-shot confirmations, not a log. */
  const [devResult, setDevResult] = useState<{ kind: DevToolKind; result: DevResult } | null>(null);

  function run(action: DevToolAction) {
    if (busyKind) return; // these write overlapping rows; serialise rather than race them
    setBusyKind(action.kind);
    setDevResult(null);
    devTools.mutate(action, {
      onSuccess: result => setDevResult({ kind: action.kind, result }),
      // Surfaced, not swallowed: the most likely failure by far is AURA_DEV_TOOLS being unset, and
      // that has a specific fix the message names.
      onError: (e: unknown) =>
        setDevResult({ kind: action.kind, result: { ok: false, message: (e as Error).message } }),
      onSettled: () => setBusyKind(null)
    });
  }
  const resultFor = (kind: DevToolKind) => (devResult?.kind === kind ? devResult.result : null);

  const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Your account';
  const gradeLabel = me?.grade && /^\d+$/.test(me.grade) ? `${me.grade}th` : me?.grade;
  const meta = ['@' + (me?.username || 'you'), gradeLabel, me?.school?.name].filter(Boolean).join(' · ');
  // Real count now that 8A's blocked list exists; the row shows it the way the design does.
  const { data: blockedPeople } = useBlockedPeople();
  const blockedCount = blockedPeople?.length ?? 0;

  return (
    <AuthShell aboveTabBar>
      <SettingsNav title="Settings" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <SettingsSection label="ACCOUNT" marginTop={20} />
        <View className="mt-[10px]">
          <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={22}>
            <View className="flex-row items-center gap-[13px] p-[15px]">
              <ToyShadow depth={3} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999}>
                <View className="h-[48px] w-[48px] items-center justify-center">
                  <Text className="font-fredoka-700 text-[18px] text-white">
                    {initials(me?.firstName ?? null, me?.lastName ?? null)}
                  </Text>
                </View>
              </ToyShadow>
              <View className="flex-1">
                <Text className="font-nunito-900 text-[16px]" style={{ color: '#2D2A2E' }}>
                  {name}
                </Text>
                <Text className="font-nunito-700 mt-[2px] text-[12.5px]" style={{ color: '#8B888D' }}>
                  {meta}
                </Text>
              </View>
              <Text className="text-[20px]" style={{ color: '#B0AEB2' }}>
                ›
              </Text>
            </View>
          </ToyShadow>
        </View>

        {/* 6A's "Link Instagram" row is gone. It promised an IG profile photo, which Meta's current
            API can't deliver for personal accounts (Basic Display was shut down in Dec 2024), and
            socials now live as a linktree-style block on the Me tab instead. */}

        <SettingsSection label="PREFERENCES" />
        <View className="mt-[10px] gap-2">
          <SettingsRow
            icon="bell"
            label="Notifications"
            // Reflects whether a device is actually registered, not just the stored preferences —
            // "On" while iOS is blocking delivery would be the wrong answer.
            value={me?.pushEnabled ? 'On' : 'Off'}
            onPress={() => router.push('/notifications')}
          />
          <SettingsRow
            icon="block"
            label="Blocked people"
            value={blockedCount > 0 ? String(blockedCount) : undefined}
            onPress={() => router.push('/blocked')}
          />
          <SettingsRow icon="flag" label="Report someone" onPress={() => router.push('/report')} />
        </View>

        <SettingsSection label="ABOUT" />
        <View className="mt-[10px] gap-2">
          <SettingsRow label="Terms of Service" onPress={() => router.push('/about')} />
          <SettingsRow label="Privacy Policy" onPress={() => router.push('/about')} />
        </View>

        {/* Dev only, and structurally so: `__DEV__` is false in any release build, so this section is
            dead code the bundler drops rather than a switch hidden behind a flag someone could reach.

            It exists because Infinite Aura was a one-way door — `legacyInfiniteAura` only ever granted it,
            so once anyone on the team turned it on they could no longer see the free experience, which
            is what most users will actually have. Toggling it off is the only way to check the paywall,
            the locked cards and the zero-flip states against real data. */}
        {__DEV__ && (
          <>
            <SettingsSection label="DEV" />
            <View className="mt-[10px] gap-2">
              <Pressable
                onPress={() => infiniteAura.mutate(!me?.infiniteAura)}
                disabled={infiniteAura.isPending}
                className="flex-row items-center gap-[13px] rounded-20 bg-surface px-4 py-[14px]"
              >
                <AuraIcon name="aura" size={20} color={me?.infiniteAura ? '#6BF2C2' : '#727074'} />
                <Text className="font-nunito-800 flex-1 text-[14px] text-ink-secondary">Infinite Aura</Text>
                <Text
                  className="font-nunito-900 text-[12.5px]"
                  style={{ color: me?.infiniteAura ? '#6BF2C2' : '#727074' }}
                >
                  {infiniteAura.isPending ? '…' : me?.infiniteAura ? 'ON' : 'OFF'}
                </Text>
              </Pressable>

              {/* Everything below is a shortcut past a timer. See apps/api/src/devTools.ts for what
                  each one writes and why waiting is the only other way to get there.

                  The result line under the buttons is the whole point of them returning a message:
                  most of these change state on a screen you are not currently looking at, so without
                  it the only feedback is a button that dims and un-dims. */}
              <DevAction
                icon="hourglass"
                label="Reset flips"
                detail="Refill the allowance and put every card back to untouched"
                busy={busyKind === 'resetFlips'}
                result={resultFor('resetFlips')}
                onPress={() => run({ kind: 'resetFlips' })}
              />
              <DevAction
                icon="people"
                label="Seed 12 votes"
                detail="Fake cards from classmates, spread over the aura window"
                busy={busyKind === 'seedVotes'}
                result={resultFor('seedVotes')}
                onPress={() => run({ kind: 'seedVotes', count: 12 })}
              />
              {/* The detail line names the side effect rather than hiding it. This and the row below
                  are the two dev tools that write to accounts that aren't yours, and a button that
                  quietly upgrades a classmate's membership is exactly the sort of thing you'd want to
                  have been told about a week later when their cards are all anonymous and you can't
                  think why. */}
              <DevAction
                icon="ghost"
                label="Send an anonymous card"
                detail="Grants one classmate Infinite Aura, then votes as them"
                busy={busyKind === 'anonymousVote'}
                result={resultFor('anonymousVote')}
                onPress={() => run({ kind: 'anonymousVote' })}
              />
              <DevAction
                icon="people"
                label="Seed friend activity"
                detail="Befriends 3 classmates and gives them picks — the Activity feed"
                busy={busyKind === 'seedFriendActivity'}
                result={resultFor('seedFriendActivity')}
                onPress={() => run({ kind: 'seedFriendActivity', count: 9 })}
              />
              <DevAction
                icon="block"
                label="Clear my cards"
                detail="Delete every vote you've received — the empty grid"
                busy={busyKind === 'clearCards'}
                result={resultFor('clearCards')}
                onPress={() => run({ kind: 'clearCards' })}
              />
              <DevAction
                icon="bolt"
                label="+100 sparks"
                detail="For rerolls and the Shop without grinding rounds"
                busy={busyKind === 'grantSparks'}
                result={resultFor('grantSparks')}
                onPress={() => run({ kind: 'grantSparks', amount: 100 })}
              />
              <DevAction
                icon="clock"
                label="Reset round timer"
                detail="Refill the hourly allowance and drop the round in flight"
                busy={busyKind === 'resetRounds'}
                result={resultFor('resetRounds')}
                onPress={() => run({ kind: 'resetRounds' })}
              />
              {/* Day 7 rather than day 1: the streak bonus pays from the second consecutive day, so a
                  run that is already alive is the state where finishing a round actually pays it. */}
              <DevAction
                icon="flame"
                label="Set streak to 7"
                detail="Alive and dated yesterday, so the next round extends it"
                busy={busyKind === 'setStreak'}
                result={resultFor('setStreak')}
                onPress={() => run({ kind: 'setStreak', days: 7 })}
              />
            </View>
          </>
        )}
      </ScrollView>

      <View className="items-center gap-[14px] pb-1 pt-5">
        <Pressable onPress={() => setSignOutOpen(true)} className="w-full items-center rounded-pill bg-surface py-[15px]">
          <Text className="font-nunito-900 text-[15px] text-ink-secondary">Sign out</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/delete-account')} hitSlop={8}>
          <Text className="font-nunito-800 text-[13px]" style={{ color: '#FF5CA8' }}>
            Delete my account
          </Text>
        </Pressable>
        <Text className="font-nunito-700 text-[12px] text-ink-faint">
          Aura 1.0.0{me?.school?.name ? ` · ${me.school.name}` : ''}
        </Text>
      </View>

      <ConfirmSheet
        visible={signOutOpen}
        title="Sign out?"
        /* Design names the actual number here, but `User` deliberately doesn't expose `phone`
           over GraphQL and adding PII to that surface just for a confirm string isn't worth it —
           so the copy keeps the meaning without the digits. */
        body={<>You'll need a code texted to your number to get back in. Nothing is deleted.</>}
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setSignOutOpen(false);
          signOut();
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </AuthShell>
  );
}
