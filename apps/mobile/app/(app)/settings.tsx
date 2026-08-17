import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
import { useBlockedPeople } from '../../src/hooks/useBlockedPeople';
import { AuthShell } from '../../src/components/authKit';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { SettingsNav, SettingsRow, SettingsSection } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';

function initials(first: string | null, last: string | null): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || 'A';
}

export default function Settings() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { data: me } = useMe();
  const [signOutOpen, setSignOutOpen] = useState(false);

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
