import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/tanstack-react-start';
import { useUpdateMe } from '../hooks/useUpdateMe';
import { useSchools } from '../hooks/useSchools';
import { GENDER_LABEL, GENDER_VALUES } from '@aura/api-client';

export const Route = createFileRoute('/onboarding')({
  component: Onboarding
});

const GRADES = ['9', '10', '11', '12', 'Not in High School', 'Already Graduated'];
// Derived from the shared list so this can't drift out of step with mobile's own gender step or
// with the server's allowlist, which now rejects (rather than silently drops) anything unknown.
const GENDERS: { value: string; label: string }[] = GENDER_VALUES.map(value => ({
  value,
  label: GENDER_LABEL[value]
}));

const STEPS = ['age', 'grade', 'school', 'name', 'username', 'gender'] as const;
type Step = (typeof STEPS)[number];

function Onboarding() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const updateMe = useUpdateMe();
  const [stepIndex, setStepIndex] = useState(0);

  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');

  if (isSignedIn === false) {
    navigate({ to: '/' });
    return null;
  }

  const step: Step = STEPS[stepIndex];

  async function next(fields: Record<string, unknown>) {
    await updateMe.mutateAsync(fields);
    if (stepIndex === STEPS.length - 1) {
      await updateMe.mutateAsync({ onboarded: true });
      navigate({ to: '/' });
    } else {
      setStepIndex(stepIndex + 1);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      {step === 'age' && (
        <Step title="How old are you?">
          <input
            type="number"
            min={13}
            max={99}
            value={age}
            onChange={e => setAge(e.target.value)}
            className="rounded border px-3 py-2"
          />
          <NextButton disabled={!age} onClick={() => next({ age: Number(age) })} />
        </Step>
      )}

      {step === 'grade' && (
        <Step title="What grade are you in?">
          <div className="grid grid-cols-2 gap-2">
            {GRADES.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                className={`rounded border px-3 py-2 ${grade === g ? 'border-black bg-black text-white' : ''}`}
              >
                {g}
              </button>
            ))}
          </div>
          <NextButton disabled={!grade} onClick={() => next({ grade })} />
        </Step>
      )}

      {step === 'school' && <SchoolStep schoolId={schoolId} setSchoolId={setSchoolId} onNext={() => next({ schoolId })} />}

      {step === 'name' && (
        <Step title="What's your name?">
          <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} className="rounded border px-3 py-2" />
          <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} className="rounded border px-3 py-2" />
          <NextButton disabled={!firstName || !lastName} onClick={() => next({ firstName, lastName })} />
        </Step>
      )}

      {step === 'username' && (
        <Step title="Pick a username">
          <input value={username} onChange={e => setUsername(e.target.value)} className="rounded border px-3 py-2" />
          <NextButton disabled={!username} onClick={() => next({ username })} />
        </Step>
      )}

      {step === 'gender' && (
        <Step title="I am a...">
          <div className="flex flex-col gap-2">
            {GENDERS.map(g => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                className={`rounded border px-3 py-2 ${gender === g.value ? 'border-black bg-black text-white' : ''}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <NextButton disabled={!gender} onClick={() => next({ gender })} label="Finish" />
        </Step>
      )}
    </main>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function NextButton({ disabled, onClick, label = 'Next' }: { disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function SchoolStep({ schoolId, setSchoolId, onNext }: { schoolId: string; setSchoolId: (id: string) => void; onNext: () => void }) {
  const { data: schools, isLoading } = useSchools();
  const [query, setQuery] = useState('');
  const filtered = (schools || []).filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Step title="What school do you go to?">
      <input placeholder="Search schools" value={query} onChange={e => setQuery(e.target.value)} className="rounded border px-3 py-2" />
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {filtered.map(s => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSchoolId(s.id)}
                className={`w-full rounded border px-3 py-2 text-left ${schoolId === s.id ? 'border-black bg-black text-white' : ''}`}
              >
                {s.name} {s.city ? `· ${s.city}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NextButton disabled={!schoolId} onClick={onNext} />
    </Step>
  );
}
