import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMe } from '../../src/hooks/useMe';
import { useUpdateMe, type UpdateMeInput } from '../../src/hooks/useUpdateMe';
import { useRegisterPushToken } from '../../src/hooks/useRegisterPushToken';
import { getPushPermission, registerForPush, tzOffsetMinutes, type PermissionResult } from '../../src/lib/push';
import { AuthError, AuthShell } from '../../src/components/authKit';
import { InfoCard, SettingsNav, SettingsSection, Toggle } from '../../src/components/settingsKit';
import { AuraIcon, type AuraIconName } from '../../src/components/AuraIcon';

/* 7A's notification settings — the destination 6A's "Notifications" row never had.

   Defaults matter here: a preference the user has never touched comes back null, and the server's
   sender treats null as its own default (flames/rounds on, friend-joined off). Rendering null as
   "off" would show a switch that contradicts what actually gets sent, so the fallbacks below mirror
   push.ts exactly. */

const DEFAULTS = { notifyFlames: true, notifyRound: true, notifyFriendJoined: false, quietHours: true };

type PrefKey = keyof typeof DEFAULTS;

export default function NotificationSettings() {
  const router = useRouter();
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const registerToken = useRegisterPushToken();
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* Reading the OS permission is a genuine external-system sync, not derived state — there's nothing
     in props or query data that can tell us whether iOS currently allows notifications. */
  useEffect(() => {
    let alive = true;
    getPushPermission().then(p => {
      if (alive) setPermission(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  function valueOf(key: PrefKey): boolean {
    const stored = me?.[key];
    return typeof stored === 'boolean' ? stored : DEFAULTS[key];
  }

  function toggle(key: PrefKey) {
    updateMe.mutate({ [key]: !valueOf(key) } as UpdateMeInput);
  }

  async function enable() {
    setNote(null);
    const result = await registerForPush();
    if (result.status === 'ok') {
      registerToken.mutate({ token: result.token, tzOffsetMinutes: tzOffsetMinutes() });
      setPermission('granted');
      return;
    }
    if (result.status === 'denied') {
      setPermission('denied');
      return;
    }
    // Granted-but-tokenless (simulator / Expo Go / no EAS project yet) — say so plainly instead of
    // leaving the row looking broken.
    setPermission('granted');
    setNote(
      result.status === 'error'
        ? result.message
        : "This build can't receive push notifications — you'll need a dev or TestFlight build for that."
    );
  }

  return (
    <AuthShell aboveTabBar>
      <SettingsNav title="Notifications" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Permission gate first: every switch below is moot if iOS is blocking delivery, so the real
            OS state leads rather than hiding behind toggles that appear to work. */}
        {permission === 'denied' ? (
          <View className="mt-5 gap-[10px]">
            <InfoCard icon="bell">
              iPhone Settings is blocking notifications for Aura. iOS won't let the app ask again, so the switch
              has to be flipped there.
            </InfoCard>
            <Pressable
              onPress={() => Linking.openSettings()}
              className="items-center rounded-pill bg-surface py-[15px]"
            >
              <Text className="font-nunito-900 text-[15px] text-ink-secondary">Take me to Settings</Text>
            </Pressable>
          </View>
        ) : permission === 'undetermined' || (permission === 'granted' && me?.pushEnabled === false) ? (
          <View className="mt-5 gap-[10px]">
            <InfoCard icon="bell">
              Notifications aren't switched on for this device yet. Your preferences below are saved either way.
            </InfoCard>
            <Pressable onPress={enable} className="items-center rounded-pill bg-mint py-[15px]">
              <Text className="font-nunito-900 text-[15px]" style={{ color: '#0A3B2C' }}>
                Turn on notifications
              </Text>
            </Pressable>
          </View>
        ) : null}

        <AuthError message={note} />
        {updateMe.isError && <AuthError message={(updateMe.error as Error).message} />}

        <View className="mt-6 gap-2">
          <PrefRow
            icon="aura"
            label="Someone picked you"
            sub="The moment someone picks you"
            on={valueOf('notifyFlames')}
            onPress={() => toggle('notifyFlames')}
          />
          <PrefRow
            icon="ballot"
            label="Round going live"
            sub="Once a day, when voting opens"
            on={valueOf('notifyRound')}
            onPress={() => toggle('notifyRound')}
          />
          <PrefRow
            icon="people"
            label="Friend joined Aura"
            sub="Someone you invited signed up"
            on={valueOf('notifyFriendJoined')}
            onPress={() => toggle('notifyFriendJoined')}
          />
        </View>

        <SettingsSection label="QUIET HOURS" marginTop={20} />
        <View className="mt-[10px]">
          <PrefRow
            icon="clock"
            label="Hold overnight"
            sub="Nothing between 10pm and 7am"
            on={valueOf('quietHours')}
            onPress={() => toggle('quietHours')}
          />
        </View>

        <View className="mt-5">
          <InfoCard icon="lock">
            A pick notification never names who sent it. Anyone reading over your shoulder learns nothing.
          </InfoCard>
        </View>
      </ScrollView>

      <View className="pb-1 pt-4">
        <Text className="font-nunito-700 text-center text-[12.5px] leading-[18px] text-ink-faint">
          iPhone-level delivery is controlled in iOS Settings → Notifications → Aura.
        </Text>
      </View>
    </AuthShell>
  );
}

function PrefRow({
  icon,
  label,
  sub,
  on,
  onPress
}: {
  icon: AuraIconName;
  label: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <View className="flex-row items-center gap-[13px] rounded-20 bg-surface px-4 py-[15px]">
      <AuraIcon name={icon} size={20} color="#C1C0C0" />
      <View className="flex-1">
        <Text className="font-nunito-900 text-[14.5px] text-white">{label}</Text>
        <Text className="font-nunito-700 mt-[2px] text-[12px] text-ink-dim">{sub}</Text>
      </View>
      <Toggle on={on} onPress={onPress} />
    </View>
  );
}
