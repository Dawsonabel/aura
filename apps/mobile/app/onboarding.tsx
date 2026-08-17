import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUpdateMe } from '../src/hooks/useUpdateMe';
import { useSchools } from '../src/hooks/useSchools';
import {
  AuthButton,
  AuthFooter,
  AuthHeading,
  AuthHint,
  AuthProgress,
  AuthRule,
  AuthShell
} from '../src/components/authKit';

const GRADES = ['9', '10', '11', '12', 'Not in High School', 'Already Graduated'];
const GENDERS: { value: string; label: string }[] = [
  { value: 'girl', label: 'Girl' },
  { value: 'boy', label: 'Boy' },
  { value: 'nonbinary', label: 'Non-binary' }
];

/* `rules` is 5A's new first step — it's where the 13+ notice lives now, having moved off the
   sign-up screen when the split sign-in/sign-up flow was replaced by the one-door welcome. It
   collects nothing, so `next()` skips the mutation for it. */
const STEPS = ['rules', 'age', 'grade', 'school', 'name', 'username', 'gender'] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const router = useRouter();
  const updateMe = useUpdateMe();
  const [stepIndex, setStepIndex] = useState(0);

  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');

  const step: Step = STEPS[stepIndex];

  // TextInput has no min/max concept (unlike web's <input type="number" min={13} max={99}>), and
  // the server rejects ages outside 13-99 — validate client-side so "Next" isn't just silently
  // inert, and surface the server's own message below if a mutation still fails for any reason.
  const ageNum = Number(age);
  const ageValid = age !== '' && Number.isInteger(ageNum) && ageNum >= 13 && ageNum <= 99;

  async function next(fields: Record<string, unknown> | null) {
    if (fields) await updateMe.mutateAsync(fields);
    if (stepIndex === STEPS.length - 1) {
      await updateMe.mutateAsync({ onboarded: true });
      router.replace('/');
    } else {
      setStepIndex(stepIndex + 1);
    }
  }

  if (step === 'rules') {
    return (
      <AuthShell>
        <AuthProgress step={1} />
        <AuthHeading
          marginTop={30}
          title="First, the ground rules"
          subtitle="Three of them. Then you're picking your school."
        />
        <View className="mt-[22px] gap-[10px]">
          <AuthRule emoji="🔒" lead="Aura is 13+.">
            We check your grade with your school, and your number stays private.
          </AuthRule>
          <AuthRule emoji="🙈" lead="Votes are anonymous.">
            Nobody ever sees who you picked — not even the person you picked.
          </AuthRule>
          <AuthRule emoji="🏫" lead="One school, one you.">
            You only ever see people from your school, and only they can see you.
          </AuthRule>
        </View>
        <AuthHint emoji="🚫">
          Prompts are compliments only. Anything cruel gets the person who sent it removed.
        </AuthHint>
        <AuthFooter>
          <AuthButton label="Got it — pick my school" onPress={() => next(null)} disabled={false} />
          <Text className="font-nunito-800 text-center text-[12.5px] leading-[18px] text-ink-faint">
            By continuing you agree to the Terms and Privacy Policy.
          </Text>
        </AuthFooter>
      </AuthShell>
    );
  }

  return (
    <View className="flex-1 justify-center gap-6 p-8">
      {step === 'age' && (
        <StepView title="How old are you?">
          <TextInput
            className="rounded border border-gray-300 p-3"
            keyboardType="number-pad"
            value={age}
            onChangeText={setAge}
          />
          <NextButton disabled={!ageValid} onPress={() => next({ age: ageNum })} />
        </StepView>
      )}

      {step === 'grade' && (
        <StepView title="What grade are you in?">
          <View className="flex-row flex-wrap gap-2">
            {GRADES.map(g => (
              <Pressable
                key={g}
                onPress={() => setGrade(g)}
                className={`rounded border px-3 py-2 ${grade === g ? 'border-black bg-black' : 'border-gray-300'}`}
              >
                <Text className={grade === g ? 'text-white' : 'text-black'}>{g}</Text>
              </Pressable>
            ))}
          </View>
          <NextButton disabled={!grade} onPress={() => next({ grade })} />
        </StepView>
      )}

      {step === 'school' && <SchoolStep schoolId={schoolId} setSchoolId={setSchoolId} onNext={() => next({ schoolId })} />}

      {step === 'name' && (
        <StepView title="What's your name?">
          <TextInput
            className="rounded border border-gray-300 p-3"
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            className="rounded border border-gray-300 p-3"
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
          />
          <NextButton disabled={!firstName || !lastName} onPress={() => next({ firstName, lastName })} />
        </StepView>
      )}

      {step === 'username' && (
        <StepView title="Pick a username">
          <TextInput
            className="rounded border border-gray-300 p-3"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <NextButton disabled={!username} onPress={() => next({ username })} />
        </StepView>
      )}

      {step === 'gender' && (
        <StepView title="I am a...">
          <View className="gap-2">
            {GENDERS.map(g => (
              <Pressable
                key={g.value}
                onPress={() => setGender(g.value)}
                className={`rounded border px-3 py-2 ${gender === g.value ? 'border-black bg-black' : 'border-gray-300'}`}
              >
                <Text className={gender === g.value ? 'text-white' : 'text-black'}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
          <NextButton disabled={!gender} onPress={() => next({ gender })} label="Finish" />
        </StepView>
      )}

      {updateMe.isError && <Text className="text-sm text-red-600">{(updateMe.error as Error).message}</Text>}
    </View>
  );
}

function StepView({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold">{title}</Text>
      {children}
    </View>
  );
}

function NextButton({ disabled, onPress, label = 'Next' }: { disabled: boolean; onPress: () => void; label?: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} className={`rounded bg-black px-4 py-3 ${disabled ? 'opacity-40' : ''}`}>
      <Text className="text-center text-white">{label}</Text>
    </Pressable>
  );
}

function SchoolStep({
  schoolId,
  setSchoolId,
  onNext
}: {
  schoolId: string;
  setSchoolId: (id: string) => void;
  onNext: () => void;
}) {
  const { data: schools, isLoading } = useSchools();
  const [query, setQuery] = useState('');
  const filtered = (schools ?? []).filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <StepView title="What school do you go to?">
      <TextInput
        className="rounded border border-gray-300 p-3"
        placeholder="Search schools"
        value={query}
        onChangeText={setQuery}
      />
      {isLoading ? (
        <Text>Loading…</Text>
      ) : (
        <ScrollView className="max-h-60">
          <View className="gap-1">
            {filtered.map(s => (
              <Pressable
                key={s.id}
                onPress={() => setSchoolId(s.id)}
                className={`rounded border px-3 py-2 ${schoolId === s.id ? 'border-black bg-black' : 'border-gray-300'}`}
              >
                <Text className={schoolId === s.id ? 'text-white' : 'text-black'}>
                  {s.name} {s.city ? `· ${s.city}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      <NextButton disabled={!schoolId} onPress={onNext} />
    </StepView>
  );
}
