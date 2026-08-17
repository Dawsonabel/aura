import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

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
  emoji,
  label,
  value,
  onPress
}: {
  emoji?: string;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-[13px] rounded-20 bg-surface px-4 py-[14px]"
    >
      {emoji ? <Text style={{ fontSize: 17 }}>{emoji}</Text> : null}
      <Text className="font-nunito-800 flex-1 text-[14px] text-ink-secondary">{label}</Text>
      {value ? <Text className="font-nunito-800 text-[12.5px] text-ink-dim">{value}</Text> : null}
      <Text className="text-[18px] text-ink-faint">›</Text>
    </Pressable>
  );
}

/** Nav row with a centred title; the trailing spacer keeps the title optically centred. */
export function SettingsNav({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Pressable onPress={onBack} hitSlop={12}>
        <Text className="text-[22px] leading-[22px] text-ink-faint">‹</Text>
      </Pressable>
      <Text className="font-fredoka-700 text-[19px] text-white">{title}</Text>
      <View style={{ width: 14 }} />
    </View>
  );
}

/** `raised` consequence/《info》card with a bold-able lead — used by delete-account and grade. */
export function InfoCard({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <View className="flex-row gap-[11px] rounded-20 bg-raised px-4 py-[14px]">
      <Text style={{ fontSize: 17 }}>{emoji}</Text>
      <Text className="font-nunito-700 flex-1 text-[13px] leading-[18.5px] text-ink-secondary">{children}</Text>
    </View>
  );
}

/** Emphasised inline fragment inside an InfoCard. */
export function Strong({ children }: { children: ReactNode }) {
  return <Text className="font-nunito-900 text-white">{children}</Text>;
}
