import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuraIcon, type AuraIconName } from './AuraIcon';

/** All-caps group heading — ACCOUNT / PREFERENCES / ABOUT. */
export function SettingsSection({ label, marginTop = 18 }: { label: string; marginTop?: number }) {
  return (
    <Text className="font-nunito-900 text-[12.5px] text-ink-muted" style={{ marginTop }}>
      {label}
    </Text>
  );
}

/** `surface` row: optional icon, label, optional trailing value, chevron. */
export function SettingsRow({
  icon,
  label,
  value,
  onPress
}: {
  icon?: AuraIconName;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-[13px] rounded-20 bg-surface px-4 py-[14px]"
    >
      {icon ? <AuraIcon name={icon} size={20} color="#C1C0C0" /> : null}
      <Text className="font-nunito-800 flex-1 text-[14px] text-ink-secondary">{label}</Text>
      {value ? <Text className="font-nunito-800 text-[12.5px] text-ink-dim">{value}</Text> : null}
      <AuraIcon name="chevronRight" size={18} color="#727074" />
    </Pressable>
  );
}

/** Nav row with a centred title; the trailing spacer keeps the title optically centred. */
export function SettingsNav({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Pressable onPress={onBack} hitSlop={12}>
        <AuraIcon name="chevronLeft" size={22} color="#727074" />
      </Pressable>
      <Text className="font-fredoka-700 text-[19px] text-white">{title}</Text>
      <View style={{ width: 14 }} />
    </View>
  );
}

/** `raised` consequence/《info》card with a bold-able lead — used by delete-account and grade. */
/* 15A: the leading glyph is a drawn icon, not an emoji. Nudged down 1px so its optical centre lines up
   with the first line of text rather than with the line box. */
export function InfoCard({ icon, iconColor = '#9A989B', children }: { icon: AuraIconName; iconColor?: string; children: ReactNode }) {
  return (
    <View className="flex-row gap-[11px] rounded-20 bg-raised px-4 py-[14px]">
      <View style={{ marginTop: 1 }}>
        <AuraIcon name={icon} size={19} color={iconColor} />
      </View>
      <Text className="font-nunito-700 flex-1 text-[13px] leading-[18.5px] text-ink-secondary">{children}</Text>
    </View>
  );
}

/** Emphasised inline fragment inside an InfoCard. */
export function Strong({ children }: { children: ReactNode }) {
  return <Text className="font-nunito-900 text-white">{children}</Text>;
}

/* The design's pill switch — 50×30 track, 24px knob, mint when on. RN's own Switch can't be styled
   to it (its track/thumb colours are the only knobs, and it keeps platform metrics), so it's a
   Pressable. Lives here rather than in a route file because 7A's prefs and 8A's report form both
   use it. */
export function Toggle({ on, disabled, onPress }: { on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      className="h-[30px] w-[50px] justify-center rounded-pill px-[3px]"
      style={{ backgroundColor: on ? '#6BF2C2' : '#524F53', opacity: disabled ? 0.6 : 1 }}
    >
      <View
        className="h-[24px] w-[24px] rounded-pill"
        style={{ backgroundColor: on ? '#FFFFFF' : '#8B888D', alignSelf: on ? 'flex-end' : 'flex-start' }}
      />
    </Pressable>
  );
}
