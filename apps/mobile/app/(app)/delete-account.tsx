import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { useMe } from '../../src/hooks/useMe';
import { useFlames } from '../../src/hooks/useFlames';
import { useDeleteMe } from '../../src/hooks/useDeleteMe';
import { AuthBack, AuthError, AuthHeading, AuthShell } from '../../src/components/authKit';
import { InfoCard, Strong } from '../../src/components/settingsKit';
import { ToyShadow } from '../../src/components/ToyShadow';

const CONFIRM_WORD = 'DELETE';

export default function DeleteAccount() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { data: me } = useMe();
  const deleteMe = useDeleteMe();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function confirmDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteMe.mutateAsync();
      /* deleteMe only removes the app-side row — the Clerk session survives, so without signing
         out the very next `me` fetch lazily re-creates a blank row and drops the user into
         onboarding as if they'd just joined. Signing out makes "deleted" mean deleted. */
      await signOut();
      router.replace('/');
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Could not delete your account. Try again.');
    }
  }

  const { data: flamesData } = useFlames();
  const flameCount = flamesData?.flames.length ?? 0;
  const candy = me?.coins ?? 0;

  return (
    <AuthShell>
      <AuthBack onPress={() => router.back()} />
      <AuthHeading
        marginTop={14}
        title="Delete your account"
        subtitle="Read this part. It's permanent and we can't put it back."
      />

      <View className="mt-5 gap-[9px]">
        <InfoCard emoji="🔥">
          <>
            Your <Strong>{flameCount === 1 ? '1 flame' : `${flameCount} flames`}</Strong>, your streak and your{' '}
            <Strong>🍬 {candy}</Strong> are deleted. None of it comes back if you rejoin.
          </>
        </InfoCard>
        <InfoCard emoji="👻">
          <>You disappear from everyone's voting grid{me?.school?.name ? ` and off the ${me.school.name} board` : ''}.</>
        </InfoCard>
        <InfoCard emoji="💳">
          <>
            God Mode bills through the App Store — <Strong>cancel there too</Strong>, or it keeps charging.
          </>
        </InfoCard>
      </View>

      <Text className="font-nunito-900 mt-[22px] text-[12.5px] text-ink-muted">TYPE DELETE TO CONFIRM</Text>
      <TextInput
        className="font-fredoka-700 mt-[10px] rounded-20 bg-surface px-[17px] py-[15px] text-[18px] text-white"
        style={{ letterSpacing: 2, borderWidth: 2, borderColor: '#FF5CA8' }}
        autoCapitalize="characters"
        autoCorrect={false}
        selectionColor="#FF5CA8"
        value={typed}
        onChangeText={setTyped}
      />
      <AuthError message={error} />

      <View className="mt-auto items-center gap-[14px] pb-8">
        {/* Deliberately NOT the shared mint AuthButton — mint is the account-surface "go" colour,
            and this is the one destructive action in the app. Flat/inert until DELETE matches, then
            pink with the toy shadow, matching ConfirmSheet's destructive treatment. */}
        {matches && !busy ? (
          <View className="w-full">
            <ToyShadow depth={5} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999} onPress={confirmDelete}>
              <View className="items-center py-[17px]">
                <Text className="font-fredoka-700 text-[18px] text-white">Delete forever</Text>
              </View>
            </ToyShadow>
          </View>
        ) : (
          <View className="w-full items-center rounded-pill bg-surface py-[17px]">
            <Text className="font-fredoka-700 text-[18px] text-ink-faint">{busy ? 'Deleting…' : 'Delete forever'}</Text>
          </View>
        )}
        <Text className="font-nunito-900 text-[14px] text-ink-secondary" onPress={() => router.back()}>
          Keep my account
        </Text>
      </View>
    </AuthShell>
  );
}
