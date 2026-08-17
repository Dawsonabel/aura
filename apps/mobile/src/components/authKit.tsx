import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToyShadow } from './ToyShadow';
import { Wobble } from './Wobble';

/* Building blocks for the auth flow, per the "Aura Auth · phone + code" (4A) design.

   Design rules carried over verbatim:
   - Mint CTAs, because auth is an account surface. Pink appears only for errors.
   - No password anywhere — the SMS code IS the login, on both sign-in and sign-up. */

/* Screen frame. The design's `padding: 56px 21px 0` is measured from the physical top of the
   402×874 frame: in ios-frame.jsx the status bar is absolutely positioned *over* the content, and
   the Dynamic Island ends at 48px — so 56px is the design deliberately clearing it by 8px. That
   is the same thing the real safe-area inset expresses (~59px here), so we take whichever is
   larger: the design's intent on devices without an island, the true inset on devices with one. */
export function AuthShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-ground px-[21px]"
      style={{ paddingTop: Math.max(insets.top, 56), paddingBottom: Math.max(insets.bottom, 32) }}
    >
      {children}
    </View>
  );
}

/** 😎 aura. The one-door welcome centers it and runs slightly larger than inner screens do. */
export function AuthBrand({ centered = false }: { centered?: boolean }) {
  return (
    <View className={`flex-row items-center gap-[9px] ${centered ? 'self-center' : ''}`}>
      <Wobble>
        <Text style={{ fontSize: centered ? 32 : 30 }}>😎</Text>
      </Wobble>
      <Text
        className="font-fredoka-700 text-white"
        style={{ fontSize: centered ? 30 : 27, letterSpacing: -0.5 }}
      >
        aura
      </Text>
    </View>
  );
}

/** Welcome hero: `surface` card with a rotated yellow sticker badge breaking its top edge. */
export function AuthHero({ badge, title, body }: { badge: string; title: string; body: string }) {
  return (
    <View className="mt-[26px] rounded-26 bg-surface px-5 py-[22px]" style={{ position: 'relative' }}>
      <View
        className="rounded-pill bg-yellow px-3 py-[5px]"
        style={{ position: 'absolute', top: -14, left: 20, transform: [{ rotate: '-3deg' }] }}
      >
        <Text className="font-nunito-900 text-[12px]" style={{ color: '#3A2A00' }}>
          {badge}
        </Text>
      </View>
      <Text className="font-fredoka-700 text-[33px] leading-[36px] text-white">{title}</Text>
      <Text className="font-nunito-700 mt-[9px] text-[13.5px] leading-[19px] text-ink-muted">{body}</Text>
    </View>
  );
}

/** Cream sample-prompt pill with the 3px toy shadow. */
export function PromptPill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <ToyShadow depth={3} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={9999}>
      <View className="flex-row items-center gap-[7px] px-[14px] py-[9px]">
        <Text style={{ fontSize: 14 }}>{emoji}</Text>
        <Text className="font-nunito-900 text-[13px]" style={{ color: '#2D2A2E' }}>
          {label}
        </Text>
      </View>
    </ToyShadow>
  );
}

/** All-caps section label — "ENTER YOUR NUMBER TO START". */
export function AuthLabel({ children }: { children: string }) {
  return <Text className="font-nunito-900 text-[12.5px] text-ink-muted">{children}</Text>;
}

/** Ground-rules card: bold white lead-in, then the explanation. */
export function AuthRule({ emoji, lead, children }: { emoji: string; lead: string; children: string }) {
  return (
    <View className="flex-row gap-[11px] rounded-20 bg-raised px-4 py-[15px]">
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text className="font-nunito-700 flex-1 text-[13px] leading-[18.5px] text-ink-secondary">
        <Text className="font-nunito-900 text-white">{lead}</Text> {children}
      </Text>
    </View>
  );
}

/** Mint dot + muted label — the returning handoff's "Taking you to today's round…". */
export function AuthStatus({ children }: { children: string }) {
  return (
    <View className="mt-[22px] flex-row items-center gap-[7px]">
      <View className="h-[8px] w-[8px] rounded-pill" style={{ backgroundColor: '#6BF2C2' }} />
      <Text className="font-nunito-800 text-[13px] text-ink-faint">{children}</Text>
    </View>
  );
}

/** Four-step wizard bars; sign-up is step 1 of 4 (school and grade come later). */
export function AuthProgress({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <View className="flex-row gap-[5px]">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} className="h-[8px] flex-1 rounded-pill" style={{ backgroundColor: i < step ? '#6BF2C2' : '#403E41' }} />
      ))}
    </View>
  );
}

export function AuthHeading({ title, subtitle, marginTop }: { title: string; subtitle: ReactNode; marginTop: number }) {
  return (
    <View style={{ marginTop }}>
      <Text className="font-fredoka-700 text-[38px] leading-[40px] text-white">{title}</Text>
      <Text className="font-nunito-700 mt-[10px] text-[15px] leading-[22px] text-ink-muted">{subtitle}</Text>
    </View>
  );
}

/** Back chevron used on the sign-in code step. */
export function AuthBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} className="self-start">
      <Text className="text-[22px] leading-[22px] text-ink-faint">‹</Text>
    </Pressable>
  );
}

/* US-only country chip + number field. The chip is presentational for now — the design draws a
   `▾` affordance but no country-picker screen exists, so it is not wired to one rather than
   implying a chooser that goes nowhere. Everything submits as +1. */
export function PhoneField({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  return (
    <View className="mt-[22px] flex-row gap-[9px]">
      <View className="flex-row items-center gap-[7px] rounded-20 bg-surface px-[15px] py-[15px]">
        <Text style={{ fontSize: 17 }}>🇺🇸</Text>
        <Text className="font-nunito-800 text-[16px] text-white">+1</Text>
        <Text className="text-[11px] text-ink-dim">▾</Text>
      </View>
      <TextInput
        className="font-nunito-800 flex-1 rounded-20 bg-surface px-[17px] py-[15px] text-[16px] text-white"
        placeholder="Phone number"
        placeholderTextColor="#848286"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        selectionColor="#6BF2C2"
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

/* Six-box OTP entry. RN has no native segmented-code input, so this is one real (visually hidden)
   TextInput driving six presentational boxes — that keeps a single caret, native SMS autofill and
   paste working, instead of six inputs fighting over focus.

   `textContentType="oneTimeCode"` is what makes iOS offer the real "From Messages" autofill above
   the keyboard. The design mocks that affordance as a cream chip inside the screen; drawing our own
   copy would be a decoration that cannot actually fill anything, so the native one is used instead. */
export function OtpField({
  value,
  onChangeText,
  error,
  length = 6
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: boolean;
  length?: number;
}) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.slice(0, length).split('');

  return (
    <Pressable className="mt-[22px]" onPress={() => inputRef.current?.focus()}>
      <View className="flex-row gap-[9px]">
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length;
          const active = i === digits.length;
          const ring = error ? '#FF5CA8' : active ? '#6BF2C2' : null;
          return (
            <View
              key={i}
              className="h-[62px] flex-1 items-center justify-center"
              style={{
                borderRadius: 18,
                backgroundColor: ring ? '#4A474B' : '#403E41',
                // Design uses `box-shadow: inset 0 0 0 2px` — a border is the RN equivalent, and
                // since it insets content rather than overlaying, the box keeps its 62px height.
                borderWidth: ring ? 2 : 0,
                borderColor: ring ?? 'transparent'
              }}
            >
              {filled ? (
                <Text className="font-fredoka-700 text-[26px] text-white">{digits[i]}</Text>
              ) : active ? (
                <View className="h-[26px] w-[2px] rounded-[2px]" style={{ backgroundColor: '#6BF2C2' }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={t => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus
        // Kept in the layout (not display:none) so the OS still targets it for autofill, but
        // invisible and non-interactive — the boxes above are the visible affordance.
        style={{ position: 'absolute', opacity: 0, height: 62, width: '100%' }}
      />
    </Pressable>
  );
}

/** Pink is the alert accent per the token table; the design pairs it with 😬. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="mt-3 flex-row items-start gap-2">
      <Text style={{ fontSize: 14 }}>😬</Text>
      <Text className="font-nunito-800 flex-1 text-[13.5px] leading-[19px]" style={{ color: '#FF5CA8' }}>
        {message}
      </Text>
    </View>
  );
}

/** `raised` privacy note (🔒). */
export function AuthNote({ emoji, children }: { emoji: string; children: string }) {
  return (
    <View className="mt-[20px] flex-row gap-[11px] rounded-20 bg-raised px-4 py-[15px]">
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text className="font-nunito-700 flex-1 text-[13px] leading-[18.5px] text-ink-secondary">{children}</Text>
    </View>
  );
}

/** Quieter `surface` note — the sign-up screen's "next up: school, grade" line. */
export function AuthHint({ emoji, children }: { emoji: string; children: string }) {
  return (
    <View className="mt-[18px] flex-row gap-[11px] rounded-20 bg-surface px-4 py-[14px]">
      <Text style={{ fontSize: 17 }}>{emoji}</Text>
      <Text className="font-nunito-800 flex-1 text-[13px] leading-[18px] text-ink-muted">{children}</Text>
    </View>
  );
}

/** Centered pill action — "🔄 Send a new code". */
export function AuthChip({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-[18px] flex-row items-center gap-[7px] self-center rounded-pill bg-surface px-[18px] py-[11px]"
    >
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Text className="font-nunito-800 text-[13.5px] text-ink-secondary">{label}</Text>
    </Pressable>
  );
}

/** Mint CTA. Disabled drops the toy shadow entirely and goes flat `surface`, per the design. */
export function AuthButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  if (disabled) {
    return (
      <View className="w-full items-center rounded-pill bg-surface py-[18px]">
        <Text className="font-fredoka-700 text-[19px] text-ink-faint">{label}</Text>
      </View>
    );
  }
  return (
    <View className="w-full">
      <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={onPress}>
        <View className="items-center py-[18px]">
          <Text className="font-fredoka-700 text-[19px]" style={{ color: '#0A3B2C' }}>
            {label}
          </Text>
        </View>
      </ToyShadow>
    </View>
  );
}

/** Bottom-anchored block: CTA + footer links, marginTop:auto per the design system. */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <View className="mt-auto items-center gap-3 pt-6">{children}</View>;
}

/** Footer line where the trailing half is the tappable, brighter part. */
export function AuthFooterLink({ lead, action, onPress }: { lead?: string; action: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text className="font-nunito-800 text-center text-[12.5px] text-ink-faint">
        {lead ? `${lead} ` : ''}
        <Text className="text-ink-secondary">{action}</Text>
      </Text>
    </Pressable>
  );
}
