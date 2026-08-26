import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { registerForPush, tzOffsetMinutes } from '../src/lib/push';
import { useRegisterPushToken } from '../src/hooks/useRegisterPushToken';
import { AuthButton, AuthError, AuthFooter, AuthHeading, AuthShell } from '../src/components/authKit';
import { InfoCard, Strong } from '../src/components/settingsKit';
import { ToyShadow } from '../src/components/ToyShadow';
import { Wobble } from '../src/components/Wobble';
import { AuraIcon } from '../src/components/AuraIcon';

/* 7A push priming + denied recovery.

   Sits *after* onboarding step 7 rather than inside it, per the design: it isn't a profile field, and
   folding it into the seven would make the progress bar lie. By this point the user has seen what a
   a pick notification is, so the ask can show the actual thing instead of describing one.

   The OS prompt fires only from the mint CTA. "Not now" never triggers it — iOS gives exactly one
   prompt per install, and spending it on someone who is dismissing the screen burns the grant
   forever. */

type Stage = 'priming' | 'denied';

export default function Push() {
  const router = useRouter();
  const registerToken = useRegisterPushToken();
  const [stage, setStage] = useState<Stage>('priming');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Onboarding sent us here, so "done" always means into the app rather than back a screen.
  const finish = () => router.replace('/aura');

  async function turnOn() {
    setBusy(true);
    setNote(null);
    const result = await registerForPush();
    setBusy(false);

    if (result.status === 'ok') {
      registerToken.mutate({ token: result.token, tzOffsetMinutes: tzOffsetMinutes() });
      finish();
      return;
    }
    if (result.status === 'denied') {
      setStage('denied');
      return;
    }
    /* Permission was granted but no token is obtainable: a simulator, Expo Go on iOS (no remote push
       since SDK 53), or an app.json with no EAS project id yet. None of that is the user's problem
       and none of it is worth showing them the denied screen for — the grant is real and the token
       will register on the next launch in a build that can get one. */
    if (result.status === 'error') setNote(result.message);
    finish();
  }

  if (stage === 'denied') return <Denied onKeepOff={finish} />;

  return (
    <AuthShell>
      <View className="mt-[14px] self-start">
        <Wobble>
          <AuraIcon name="aura" size={46} color="#7C5CFF" />
        </Wobble>
      </View>

      <AuthHeading
        marginTop={14}
        title="Know the second someone picks you"
        subtitle="Aura lands while you're in class, at practice, asleep. Without notifications you find out days later — or never."
      />

      {/* The payoff shown as the thing itself, rather than described. */}
      <View className="mt-[22px] gap-[9px]">
        <FakeNotification
          iconColor="#FF5CA8"
          emoji="✨"
          when="now"
          body={
            <>
              A girl in 11th grade picked you for <Text className="font-nunito-900 text-white">"best hair in the room"</Text>
            </>
          }
        />
        <FakeNotification iconColor="#6BF2C2" emoji="🗳️" when="3:15 pm" body={<>Today's round is live. 12 minutes left.</>} dim />
      </View>

      <View className="mt-4">
        <InfoCard icon="eyeOff">
          Two kinds only: your aura, and the round going live. No streak nagging, no <Strong>"come back"</Strong> begging.
        </InfoCard>
      </View>

      <AuthError message={note} />

      <AuthFooter>
        <AuthButton label={busy ? 'Just a sec…' : 'Turn on notifications'} onPress={turnOn} disabled={busy} />
        <Pressable onPress={finish} hitSlop={8}>
          <Text className="font-nunito-900 text-center text-[14px] text-ink-faint">Not now</Text>
        </Pressable>
      </AuthFooter>
    </AuthShell>
  );
}

function FakeNotification({
  iconColor,
  emoji,
  when,
  body,
  dim = false
}: {
  iconColor: string;
  emoji: string;
  when: string;
  body: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <View
      className="flex-row items-start gap-[11px] rounded-20 px-[15px] py-[13px]"
      style={{ backgroundColor: dim ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.09)' }}
    >
      <View className="h-[30px] w-[30px] items-center justify-center" style={{ borderRadius: 8, backgroundColor: iconColor }}>
        <Text style={{ fontSize: 15 }}>{emoji}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-[6px]">
          <Text className="font-nunito-900 text-[12.5px] text-white">AURA</Text>
          <Text className="font-nunito-700 text-[11.5px] text-ink-dim">{when}</Text>
        </View>
        <Text className="font-nunito-800 mt-[3px] text-[13.5px] leading-[19px]" style={{ color: '#E4E2E5' }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

/* Denied: no guilt, no second ask (iOS wouldn't allow one anyway), and the literal three taps plus a
   deep link. Also the body of Settings → Notifications when permission is off. */
function Denied({ onKeepOff }: { onKeepOff: () => void }) {
  return (
    <AuthShell>
      <Text className="mt-[14px] self-start" style={{ fontSize: 44 }}>
        🔕
      </Text>

      <AuthHeading
        marginTop={14}
        title="Notifications are off"
        subtitle="That's allowed — you'll just have to open Aura to see who picked you. iOS won't let us ask again, so it has to happen in Settings."
      />

      <View className="mt-5">
        <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24}>
          <View className="p-[18px]">
            <Text className="font-nunito-900 text-[12px]" style={{ color: '#8B888D' }}>
              THREE TAPS
            </Text>
            <View className="mt-3 gap-[11px]">
              <Step n={1}>Open iPhone Settings</Step>
              <Step n={2}>Tap Notifications → Aura</Step>
              <Step n={3}>
                Switch <Text className="font-nunito-900">Allow Notifications</Text> on
              </Step>
            </View>
            {/* openSettings() lands on Aura's own settings page, which is where the switch lives —
                the three taps above are the fallback for when the OS ignores the deep link. */}
            <Pressable
              onPress={() => Linking.openSettings()}
              className="mt-[15px] items-center rounded-pill py-[14px]"
              style={{ backgroundColor: '#2D2A2E' }}
            >
              <Text className="font-fredoka-700 text-[16px] text-white">Take me to Settings</Text>
            </Pressable>
          </View>
        </ToyShadow>
      </View>

      <View className="mt-4">
        <InfoCard icon="aura">
          Your aura still arrives either way. It just waits in your inbox with the badge until you look.
        </InfoCard>
      </View>

      <AuthFooter>
        <Pressable onPress={onKeepOff} className="w-full items-center rounded-pill bg-surface py-[17px]">
          <Text className="font-fredoka-700 text-[18px] text-ink-secondary">Keep them off</Text>
        </Pressable>
      </AuthFooter>
    </AuthShell>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-[11px]">
      <View className="h-[24px] w-[24px] items-center justify-center rounded-pill" style={{ backgroundColor: '#2D2A2E' }}>
        <Text className="font-nunito-900 text-[12.5px] text-white">{n}</Text>
      </View>
      <Text className="font-nunito-800 flex-1 text-[14px]" style={{ color: '#2D2A2E' }}>
        {children}
      </Text>
    </View>
  );
}
