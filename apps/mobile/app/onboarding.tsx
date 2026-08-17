import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUpdateMe } from '../src/hooks/useUpdateMe';
import { useSchools } from '../src/hooks/useSchools';
import {
  AuthButton,
  AuthError,
  AuthFooter,
  AuthHeading,
  AuthHint,
  AuthProgress,
  AuthRule,
  AuthShell
} from '../src/components/authKit';
import { ToyShadow } from '../src/components/ToyShadow';

/* Order matches 6A's seven-segment bar exactly. */
const STEPS = ['rules', 'age', 'grade', 'school', 'name', 'username', 'gender'] as const;
type Step = (typeof STEPS)[number];

/* 6A designs only the four high-school grades, each with its class name. The pre-redesign list
   also had "Not in High School" / "Already Graduated"; those are dropped here to match the design
   — flagged in the handoff report, since existing users may still hold those values. */
const GRADES: { value: string; label: string; year: string }[] = [
  { value: '9', label: '9th', year: 'Freshman' },
  { value: '10', label: '10th', year: 'Sophomore' },
  { value: '11', label: '11th', year: 'Junior' },
  { value: '12', label: '12th', year: 'Senior' }
];

const GENDERS: { value: string; emoji: string; label: string; sub?: string }[] = [
  { value: 'girl', emoji: '👧', label: 'Girl' },
  { value: 'boy', emoji: '👦', label: 'Boy' },
  { value: 'nonbinary', emoji: '🧑', label: 'Nonbinary' },
  { value: 'private', emoji: '🤐', label: 'Rather not say', sub: 'Your flames just say "someone in 11th"' }
];

/** Whole years between a birthday and today. */
function ageFromBirthday(month: string, day: string, year: string): number | null {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31) || !(y >= 1900)) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export default function Onboarding() {
  const router = useRouter();
  const updateMe = useUpdateMe();
  const [stepIndex, setStepIndex] = useState(0);

  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');

  const step: Step = STEPS[stepIndex];
  const stepNumber = stepIndex + 1;
  const age = ageFromBirthday(month, day, year);

  async function next(fields: Record<string, unknown> | null) {
    if (fields) await updateMe.mutateAsync(fields);
    if (stepIndex === STEPS.length - 1) {
      await updateMe.mutateAsync({ onboarded: true });
      router.replace('/');
    } else {
      setStepIndex(stepIndex + 1);
    }
  }

  /* Design collects one name field ("First name and last initial is plenty") but the server keeps
     firstName/lastName separate — split on the first space so the grid and initials still work. */
  function submitName() {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const [first, ...rest] = trimmed.split(' ');
    return next({ firstName: first, lastName: rest.join(' ') });
  }

  if (step === 'rules') {
    return (
      <AuthShell>
        <AuthProgress step={stepNumber} />
        <AuthHeading
          marginTop={30}
          title="First, the ground rules"
          subtitle="Three of them, then six quick questions and you're voting."
        />
        <View className="mt-[22px] gap-[10px]">
          {/* 6A removed the old "We check your grade with your school" line — the product doesn't
              do that, so the claim is gone rather than left as an unbacked promise. */}
          <AuthRule emoji="🔒" lead="Aura is 13+.">Your number stays private — it's only how you get back in.</AuthRule>
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
          {/* Not "pick my school" — 5A wrote that copy when school was step 2, but 6A's order puts
              age next and the school picker fourth, so naming a destination here was a promise the
              next screen broke. */}
          <AuthButton label="Got it" onPress={() => next(null)} disabled={false} />
          <Text className="font-nunito-800 text-center text-[12.5px] leading-[18px] text-ink-faint">
            By continuing you agree to the Terms and Privacy Policy.
          </Text>
        </AuthFooter>
      </AuthShell>
    );
  }

  if (step === 'age') {
    const tooYoung = age !== null && age < 13;
    return (
      <AuthShell>
        <AuthProgress step={stepNumber} />
        <AuthHeading
          marginTop={30}
          title="When's your birthday?"
          subtitle="Aura is 13+. Nobody sees your birthday — we only check the number."
        />
        <View className="mt-[22px] flex-row gap-[9px]">
          <DateBox label="MONTH" value={month} onChangeText={setMonth} maxLength={2} />
          <DateBox label="DAY" value={day} onChangeText={setDay} maxLength={2} />
          <DateBox label="YEAR" value={year} onChangeText={setYear} maxLength={4} flex={1.5} />
        </View>
        {age !== null && (
          <View className="mt-[14px] flex-row items-center gap-2 self-start rounded-pill bg-surface px-[15px] py-[9px]">
            <Text style={{ fontSize: 14 }}>{tooYoung ? '🚫' : '🎂'}</Text>
            <Text className="font-nunito-900 text-[13px]" style={{ color: tooYoung ? '#FF5CA8' : '#6BF2C2' }}>
              {tooYoung ? `You're ${age} — too young for Aura` : `You're ${age} — you're good`}
            </Text>
          </View>
        )}
        <AuthError message={updateMe.isError ? (updateMe.error as Error).message : null} />
        <AuthFooter>
          {/* Server independently enforces 13+ (MIN_AGE) — this gate is the friendly half. */}
          <AuthButton label="Next" onPress={() => next({ age })} disabled={age === null || tooYoung} />
          <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
            Under 13? Aura isn't for you yet.
          </Text>
        </AuthFooter>
      </AuthShell>
    );
  }

  if (step === 'grade') {
    return (
      <AuthShell>
        <AuthProgress step={stepNumber} />
        <AuthHeading
          marginTop={30}
          title="What grade are you in?"
          subtitle={'This is how your flames get labelled — "someone in 11th picked you."'}
        />
        <View className="mt-[22px] flex-row flex-wrap gap-[11px]">
          {GRADES.map(g => (
            <View key={g.value} style={{ width: '47.5%' }}>
              <GradeCard grade={g} selected={grade === g.value} onPress={() => setGrade(g.value)} />
            </View>
          ))}
        </View>
        <AuthHint emoji="🔁">
          You can move up a grade each August. Ask an admin if you need it changed sooner.
        </AuthHint>
        <AuthFooter>
          <AuthButton label="Next" onPress={() => next({ grade })} disabled={!grade} />
        </AuthFooter>
      </AuthShell>
    );
  }

  if (step === 'school') {
    return <SchoolStep schoolId={schoolId} setSchoolId={setSchoolId} stepNumber={stepNumber} onNext={() => next({ schoolId })} />;
  }

  if (step === 'name') {
    const trimmed = name.trim();
    const initials =
      trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map(p => p[0] ?? '')
        .join('')
        .toUpperCase() || 'A';
    return (
      <AuthShell>
        <AuthProgress step={stepNumber} />
        <AuthHeading
          marginTop={30}
          title="What do people call you?"
          subtitle="Use the name your classmates would pick you out by. First name and last initial is plenty."
        />
        <TextInput
          className="font-nunito-800 mt-[22px] rounded-20 bg-surface px-[17px] py-[15px] text-[16px] text-white"
          placeholder="Riley B."
          placeholderTextColor="#848286"
          selectionColor="#6BF2C2"
          value={name}
          onChangeText={setName}
        />
        <View className="mt-[18px]">
          <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={22}>
            <View className="p-4">
              <Text className="font-nunito-900 text-[12px]" style={{ color: '#8B888D' }}>
                HOW YOU'LL LOOK IN THE GRID
              </Text>
              <View className="mt-3 flex-row items-center gap-3">
                <ToyShadow depth={3} shadowColor="#C43A7C" backgroundColor="#FF5CA8" radius={9999}>
                  <View className="h-[54px] w-[54px] items-center justify-center">
                    <Text className="font-fredoka-700 text-[21px] text-white">{initials}</Text>
                  </View>
                </ToyShadow>
                <View>
                  <Text className="font-nunito-900 text-[17px]" style={{ color: '#2D2A2E' }}>
                    {trimmed || 'Your name'}
                  </Text>
                  <Text className="font-nunito-700 mt-[2px] text-[13px]" style={{ color: '#8B888D' }}>
                    {grade ? `${grade}th` : 'Your grade'}
                  </Text>
                </View>
              </View>
              <View className="mt-[14px] pt-[13px]" style={{ borderTopWidth: 1.5, borderTopColor: '#E4D6BF' }}>
                <Text className="font-nunito-700 text-[12.5px] leading-[18px]" style={{ color: '#8B888D' }}>
                  Everyone starts as initials. Link Instagram later in settings and your IG photo takes over.
                </Text>
              </View>
            </View>
          </ToyShadow>
        </View>
        <AuthFooter>
          <AuthButton label="Next" onPress={submitName} disabled={trimmed.length === 0} />
          <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
            Fake names get reported and removed.
          </Text>
        </AuthFooter>
      </AuthShell>
    );
  }

  if (step === 'username') {
    const handle = username.trim().replace(/^@/, '');
    const base = (name.trim().split(/\s+/)[0] || 'you').toLowerCase().replace(/[^a-z0-9]/g, '');
    const suggestions = [`${base}.b`, `${base}${new Date().getFullYear() % 100}`, `${base}${(grade || '').slice(0, 2)}`]
      .filter(s => s && s !== handle)
      .slice(0, 3);
    return (
      <AuthShell>
        <AuthProgress step={stepNumber} />
        <AuthHeading
          marginTop={30}
          title="Pick your handle"
          subtitle="Only shows on your profile. It's how friends find you to add."
        />
        <View className="mt-[22px] flex-row items-center gap-1 rounded-20 bg-surface px-[17px] py-[15px]">
          <Text className="font-fredoka-700 text-[17px] text-ink-dim">@</Text>
          <TextInput
            className="font-nunito-800 flex-1 text-[16px] text-white"
            placeholder="handle"
            placeholderTextColor="#848286"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#6BF2C2"
            value={handle}
            onChangeText={t => setUsername(t.replace(/[^A-Za-z0-9._]/g, '').toLowerCase())}
          />
        </View>
        {/* No availability API exists — the design's green "@x is free" check would be a lie, so
            the affordance is omitted rather than faked. Flagged in the handoff report. */}
        <Text className="font-nunito-900 mt-[18px] text-[12px] text-ink-muted">OR TAKE ONE OF THESE</Text>
        <View className="mt-[10px] flex-row flex-wrap gap-[9px]">
          {suggestions.map(s => (
            <Pressable
              key={s}
              onPress={() => setUsername(s)}
              className="rounded-pill bg-surface px-[15px] py-[9px]"
            >
              <Text className="font-nunito-800 text-[13.5px] text-ink-secondary">@{s}</Text>
            </Pressable>
          ))}
        </View>
        <AuthFooter>
          <AuthButton label="Next" onPress={() => next({ username: handle })} disabled={handle.length === 0} />
          <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
            Change it whenever in settings.
          </Text>
        </AuthFooter>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthProgress step={stepNumber} />
      <AuthHeading
        marginTop={30}
        title="Last one"
        subtitle={'When you pick someone, this is the first clue they get about you — "a girl in 11th picked you."'}
      />
      <View className="mt-[22px] gap-[10px]">
        {GENDERS.map(g => (
          <GenderRow key={g.value} option={g} selected={gender === g.value} onPress={() => setGender(g.value)} />
        ))}
      </View>
      <AuthFooter>
        <AuthButton label="Start voting" onPress={() => next({ gender })} disabled={!gender} />
        <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
          You can change this in settings.
        </Text>
      </AuthFooter>
    </AuthShell>
  );
}

function DateBox({
  label,
  value,
  onChangeText,
  maxLength,
  flex = 1
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  maxLength: number;
  flex?: number;
}) {
  const active = value.length > 0;
  return (
    <View style={{ flex }} className="gap-[6px]">
      <Text className="font-nunito-900 pl-1 text-[11px] text-ink-dim">{label}</Text>
      <TextInput
        className="font-fredoka-700 h-[62px] text-center text-[24px] text-white"
        style={{
          borderRadius: 18,
          backgroundColor: active ? '#4A474B' : '#403E41',
          borderWidth: active ? 2 : 0,
          borderColor: active ? '#6BF2C2' : 'transparent'
        }}
        keyboardType="number-pad"
        maxLength={maxLength}
        selectionColor="#6BF2C2"
        value={value}
        onChangeText={t => onChangeText(t.replace(/\D/g, ''))}
      />
    </View>
  );
}

function GradeCard({
  grade,
  selected,
  onPress
}: {
  grade: { value: string; label: string; year: string };
  selected: boolean;
  onPress: () => void;
}) {
  if (selected) {
    return (
      <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24} onPress={onPress}>
        <View className="gap-1 px-4 py-[22px]" style={{ position: 'relative' }}>
          <View
            className="items-center justify-center rounded-pill bg-mint"
            style={{ position: 'absolute', top: 14, right: 14, width: 24, height: 24 }}
          >
            <Text className="font-nunito-900 text-[13px]" style={{ color: '#0A3B2C' }}>
              ✓
            </Text>
          </View>
          <Text className="font-fredoka-700 text-[28px]" style={{ color: '#2D2A2E' }}>
            {grade.label}
          </Text>
          <Text className="font-nunito-700 text-[12.5px]" style={{ color: '#8B888D' }}>
            {grade.year}
          </Text>
        </View>
      </ToyShadow>
    );
  }
  return (
    <Pressable onPress={onPress} className="gap-1 rounded-24 bg-surface px-4 py-[22px]">
      <Text className="font-fredoka-700 text-[28px] text-white">{grade.label}</Text>
      <Text className="font-nunito-700 text-[12.5px] text-ink-dim">{grade.year}</Text>
    </Pressable>
  );
}

function GenderRow({
  option,
  selected,
  onPress
}: {
  option: { value: string; emoji: string; label: string; sub?: string };
  selected: boolean;
  onPress: () => void;
}) {
  const body = (
    <View className="flex-row items-center gap-[13px] px-4 py-[15px]">
      <Text style={{ fontSize: 21 }}>{option.emoji}</Text>
      <View className="flex-1">
        <Text className="font-nunito-900 text-[15.5px]" style={{ color: selected ? '#2D2A2E' : '#FFFFFF' }}>
          {option.label}
        </Text>
        {option.sub ? (
          <Text className="font-nunito-700 mt-[2px] text-[12.5px]" style={{ color: selected ? '#8B888D' : '#848286' }}>
            {option.sub}
          </Text>
        ) : null}
      </View>
      {selected && (
        <View className="h-[24px] w-[24px] items-center justify-center rounded-pill bg-mint">
          <Text className="font-nunito-900 text-[13px]" style={{ color: '#0A3B2C' }}>
            ✓
          </Text>
        </View>
      )}
    </View>
  );

  if (selected) {
    return (
      <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={20} onPress={onPress}>
        {body}
      </ToyShadow>
    );
  }
  return (
    <Pressable onPress={onPress} className="rounded-20 bg-surface">
      {body}
    </Pressable>
  );
}

/* School picker keeps README §8's shape; restyled onto the 6A shell so it stops being the one
   default-styled screen in the middle of the flow. */
function SchoolStep({
  schoolId,
  setSchoolId,
  stepNumber,
  onNext
}: {
  schoolId: string;
  setSchoolId: (id: string) => void;
  stepNumber: number;
  onNext: () => void;
}) {
  const { data: schools, isLoading } = useSchools();
  const [query, setQuery] = useState('');
  const filtered = (schools ?? []).filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AuthShell>
      <AuthProgress step={stepNumber} />
      <AuthHeading
        marginTop={30}
        title="Which school do you go to?"
        subtitle="You'll only ever see people from your school, and only they can see you."
      />
      <View className="mt-[22px] flex-row items-center gap-[11px] rounded-20 bg-surface px-[17px] py-[15px]">
        <Text style={{ fontSize: 17 }}>🔍</Text>
        <TextInput
          className="font-nunito-800 flex-1 text-[16px] text-white"
          placeholder="Search schools"
          placeholderTextColor="#848286"
          selectionColor="#6BF2C2"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {isLoading ? (
        <Text className="font-nunito-800 mt-3 text-[13.5px] text-ink-muted">Loading…</Text>
      ) : filtered.length === 0 ? (
        /* Placeholder, not a designed state — an empty search previously rendered nothing at all,
           which reads as a broken screen. Flagged in DESIGN-REQUESTS.md; pairs with the
           "Request your school" link below, which is the actual answer to "mine isn't listed". */
        <View className="mt-3 rounded-20 bg-surface px-4 py-[15px]">
          <Text className="font-nunito-800 text-[13.5px] text-ink-secondary">
            {query.trim() ? `No schools matching "${query.trim()}".` : 'No schools yet.'}
          </Text>
          <Text className="font-nunito-700 mt-[2px] text-[12.5px] text-ink-dim">
            Check the spelling, or ask us to add it below.
          </Text>
        </View>
      ) : (
        <ScrollView className="mt-3 max-h-[300px]">
          <View className="gap-[9px]">
            {filtered.map(s => (
              <SchoolRow
                key={s.id}
                name={s.name}
                city={s.city}
                userCount={s.userCount}
                selected={schoolId === s.id}
                onPress={() => setSchoolId(s.id)}
              />
            ))}
          </View>
        </ScrollView>
      )}
      <AuthFooter>
        <AuthButton label="That's my school" onPress={onNext} disabled={!schoolId} />
        {/* README §8 specifies this link. There's no backend for it — no requestSchool mutation,
            createSchool is admin-gated, and privacy.html's support address is still an unfilled
            placeholder — so it states that plainly instead of pretending to send anything. */}
        <Pressable
          hitSlop={8}
          onPress={() =>
            Alert.alert(
              'Can’t find your school?',
              'Requesting a new school isn’t wired up yet — an admin has to add it for now.'
            )
          }
        >
          <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
            Can't find it? Request your school
          </Text>
        </Pressable>
      </AuthFooter>
    </AuthShell>
  );
}

function SchoolRow({
  name,
  city,
  userCount,
  selected,
  onPress
}: {
  name: string;
  city: string;
  userCount: number;
  selected: boolean;
  onPress: () => void;
}) {
  /* README §8's format: "Austin, TX · 312 kids already here", falling back to just the count when
     a school has no city on file (several seeded ones don't). A school with nobody in it yet says
     so plainly rather than showing "0 kids already here", which reads as a dead school. */
  const countLabel = userCount > 0 ? `${userCount} ${userCount === 1 ? 'kid' : 'kids'} already here` : 'Be the first one here';
  const meta = [city, countLabel].filter(Boolean).join(' · ');

  const body = (
    <View className="flex-row items-center gap-[13px] px-4 py-[15px]">
      <View
        className="h-[44px] w-[44px] items-center justify-center"
        style={{ borderRadius: 15, backgroundColor: selected ? '#6BF2C2' : '#4A474B' }}
      >
        <Text style={{ fontSize: 21 }}>🏫</Text>
      </View>
      <View className="flex-1">
        <Text className="font-nunito-900 text-[15.5px]" style={{ color: selected ? '#2D2A2E' : '#FFFFFF' }}>
          {name}
        </Text>
        <Text className="font-nunito-700 mt-[2px] text-[12.5px]" style={{ color: selected ? '#8B888D' : '#848286' }}>
          {meta}
        </Text>
      </View>
      {selected && (
        <View className="h-[24px] w-[24px] items-center justify-center rounded-pill bg-mint">
          <Text className="font-nunito-900 text-[13px]" style={{ color: '#0A3B2C' }}>
            ✓
          </Text>
        </View>
      )}
    </View>
  );

  if (selected) {
    return (
      <ToyShadow depth={4} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={20} onPress={onPress}>
        {body}
      </ToyShadow>
    );
  }
  return (
    <Pressable onPress={onPress} className="rounded-20 bg-surface">
      {body}
    </Pressable>
  );
}
