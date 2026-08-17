import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
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
  const blockedCount = 0; // `blocked` isn't on the shared Me query yet — see the handoff report.

  return (
    <AuthShell>
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

        {/* Instagram linking has no backend at all (no OAuth, no photo pipeline, and User.photo is
            read nowhere) — the row is built to design but tells the truth when tapped rather than
            silently doing nothing. See the handoff report. */}
        <Pressable
          onPress={() => Alert.alert('Not available yet', 'Instagram linking isn’t wired up yet — your avatar stays as initials for now.')}
          className="mt-2 flex-row items-center gap-[13px] rounded-20 bg-surface px-[15px] py-[13px]"
        >
          <Text style={{ fontSize: 19 }}>📸</Text>
          <View className="flex-1">
            <Text className="font-nunito-900 text-[14px] text-white">Link Instagram</Text>
            <Text className="font-nunito-700 mt-[2px] text-[12px] text-ink-dim">Use your IG photo instead of initials</Text>
          </View>
          <View className="rounded-pill bg-mint px-[14px] py-2">
            <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#0A3B2C' }}>
              Link
            </Text>
          </View>
        </Pressable>

        <SettingsSection label="PREFERENCES" />
        <View className="mt-[10px] gap-2">
          <SettingsRow
            emoji="🔔"
            label="Notifications"
            value="Off"
            onPress={() => Alert.alert('Not available yet', 'Push notifications aren’t built yet.')}
          />
          <SettingsRow
            emoji="🚫"
            label="Blocked people"
            value={blockedCount > 0 ? String(blockedCount) : undefined}
            onPress={() => Alert.alert('Not available yet', 'The blocked list screen isn’t designed yet.')}
          />
          <SettingsRow
            emoji="🚩"
            label="Report someone"
            onPress={() => Alert.alert('Not available yet', 'The report flow isn’t designed yet.')}
          />
        </View>

        <SettingsSection label="ABOUT" />
        <View className="mt-[10px] gap-2">
          <SettingsRow label="Terms of Service" onPress={() => router.push('/about')} />
          <SettingsRow label="Privacy Policy" onPress={() => router.push('/about')} />
        </View>
      </ScrollView>

      <View className="items-center gap-[14px] pb-[30px] pt-5">
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
