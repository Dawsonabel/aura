import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { GENDER_LABEL } from '@aura/api-client';
import { useMe } from '../hooks/useMe';
import { useUpdateMe } from '../hooks/useUpdateMe';
import { useCheckUsername } from '../hooks/useProfile';
import { ToyShadow } from './ToyShadow';
import { AuthError } from './authKit';

/* 13A's edit sheet — and the new home for @handle, moved off the onboarding wizard per
   DESIGN-REQUESTS §2 (nothing but Profile ever read it, so asking for it during signup was a step
   that bought nothing).

   The design shows a mint "free" pill next to the handle. That used to be impossible to render
   honestly — there was no uniqueness check anywhere, so two people could hold the same handle. There
   now is one (`usernameAvailable`, plus enforcement inside updateMe), which is what earns the pill. */

const HANDLE_DEBOUNCE_MS = 400;

export function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const checkUsername = useCheckUsername();

  const [name, setName] = useState([me?.firstName, me?.lastName].filter(Boolean).join(' '));
  const [handle, setHandle] = useState(me?.username ?? '');
  const [error, setError] = useState<string | null>(null);

  const currentHandle = me?.username ?? '';
  const cleaned = handle.trim().toLowerCase();
  const unchanged = cleaned === currentHandle.toLowerCase();

  /* Debounced availability check — a genuine external-system sync, so an Effect is the right tool
     here rather than doing it in the change handler on every keystroke. */
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (unchanged || cleaned.length < 2) {
      setAvailable(null);
      return;
    }
    setAvailable(null);
    const id = setTimeout(() => {
      checkUsername.mutate(cleaned, { onSuccess: setAvailable });
    }, HANDLE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaned, unchanged]);

  const taken = available === false;

  async function save() {
    setError(null);
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const [first, ...rest] = trimmed.split(' ');
    try {
      await updateMe.mutateAsync({
        firstName: first ?? '',
        lastName: rest.join(' '),
        // Only sent when it actually changed, so an unchanged form can't trip the uniqueness check.
        ...(unchanged ? {} : { username: cleaned })
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const genderText = me?.gender ? GENDER_LABEL[me.gender] ?? me.gender : 'Not set';
  const gradeText = me?.grade ? (/^\d+$/.test(me.grade) ? `${me.grade}th` : me.grade) : 'Not set';
  const canSave = name.trim().length > 0 && !taken && !updateMe.isPending;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(13,12,13,0.68)' }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#2B282B', borderTopLeftRadius: 30, borderTopRightRadius: 30 }}
          className="px-[21px] pb-[34px] pt-[26px]"
        >
          <View className="mx-auto mb-5 h-[5px] w-[44px] rounded-pill" style={{ backgroundColor: '#4A474B' }} />
          <Text className="font-fredoka-700 text-center text-[26px] text-white">Edit profile</Text>

          <Text className="font-nunito-900 mt-5 text-[11.5px] text-ink-muted">NAME</Text>
          <TextInput
            className="font-nunito-800 mt-2 rounded-18 bg-surface px-4 py-[14px] text-[15.5px] text-white"
            placeholder="Riley B."
            placeholderTextColor="#848286"
            selectionColor="#6BF2C2"
            value={name}
            onChangeText={setName}
          />

          <Text className="font-nunito-900 mt-4 text-[11.5px] text-ink-muted">HANDLE</Text>
          <View
            className="mt-2 flex-row items-center gap-1 rounded-18 bg-surface px-4 py-[14px]"
            style={taken ? { borderWidth: 2, borderColor: '#FF5CA8' } : available ? { borderWidth: 2, borderColor: '#6BF2C2' } : undefined}
          >
            <Text className="font-fredoka-700 text-[16px] text-ink-dim">@</Text>
            <TextInput
              className="font-nunito-800 flex-1 text-[15.5px] text-white"
              placeholder="handle"
              placeholderTextColor="#848286"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#6BF2C2"
              value={handle}
              onChangeText={t => setHandle(t.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').toLowerCase())}
            />
            {/* Only ever claims "free" on a real server answer — never optimistically. */}
            {checkUsername.isPending ? (
              <Text className="font-nunito-900 text-[12.5px] text-ink-dim">checking…</Text>
            ) : taken ? (
              <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#FF5CA8' }}>
                taken
              </Text>
            ) : available ? (
              <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#6BF2C2' }}>
                free
              </Text>
            ) : null}
          </View>
          <Text className="font-nunito-700 mt-[7px] text-[12px] text-ink-faint">
            Only shows on your profile. Nothing else uses it.
          </Text>

          <Text className="font-nunito-900 mt-4 text-[11.5px] text-ink-muted">SHOWS ON YOUR AURAS</Text>
          {/* Read-only here: both are set during onboarding, and grade changes are admin-gated per 6A
              ("Ask an admin if you need it changed sooner"), so an editable field would imply
              otherwise. Shown because this is where someone comes to check what leaks. */}
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1 items-center rounded-18 bg-surface py-[13px]">
              <Text className="font-nunito-900 text-[14px] text-ink-secondary">{gradeText}</Text>
            </View>
            <View className="flex-1 items-center rounded-18 bg-surface py-[13px]">
              <Text className="font-nunito-900 text-[14px] text-ink-secondary">{genderText}</Text>
            </View>
          </View>
          <Text className="font-nunito-700 mt-[10px] text-[12px] leading-[17px] text-ink-faint">
            Socials live on your profile — add or change them there.
          </Text>

          <AuthError message={error} />

          <View className="mt-5 gap-[10px]">
            {canSave ? (
              <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={save}>
                <View className="items-center py-4">
                  <Text className="font-fredoka-700 text-[18px]" style={{ color: '#0A3B2C' }}>
                    Save
                  </Text>
                </View>
              </ToyShadow>
            ) : (
              <View className="items-center rounded-pill bg-surface py-4">
                <Text className="font-fredoka-700 text-[18px] text-ink-faint">
                  {updateMe.isPending ? 'Saving…' : 'Save'}
                </Text>
              </View>
            )}
            <Pressable onPress={onClose} className="items-center rounded-pill bg-surface py-[14px]">
              <Text className="font-nunito-900 text-[15px] text-ink-secondary">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
