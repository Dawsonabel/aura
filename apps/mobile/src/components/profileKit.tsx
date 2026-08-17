import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SOCIALS, type Socials } from '@aura/api-client';
import type { Superlative } from '../hooks/useProfile';
import { ToyShadow } from './ToyShadow';
import { AuraIcon, type AuraIconName } from './AuraIcon';

/* Shared pieces of 13A's Profile, used by both your own profile and the public one so the two can't
   drift apart — the whole point of the public view is that it's recognisably the same person. */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/* Grade is free text server-side, and real rows hold both bare numbers ("11", from onboarding) and
   prefixed ones ("Grade 11", from the admin screens). Everything user-facing goes through these, so the
   two forms render identically instead of showing "Grade 11 grade" or a chip reading "Grade 10" that's
   twice as wide as its neighbours. The same normalisation exists server-side in schema.ts's gradeKey,
   which is what makes "follow all of 11th grade" match both spellings. */
export function gradeNumber(grade: string | null | undefined): string | null {
  const digits = (grade ?? '').match(/\d+/)?.[0];
  return digits ?? null;
}

/** "11" / "Grade 11" -> "11th grade". Non-numeric text passes through as written. */
export function gradeLabel(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const n = gradeNumber(grade);
  return n ? `${n}th grade` : grade;
}

/** The short form for chips and the Vote card's meta line: "11th". */
export function gradeShort(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const n = gradeNumber(grade);
  return n ? `${n}th` : grade;
}

/** 78px avatar + name + meta line + an optional badge pill (streak on yours, rank on theirs). */
export function ProfileIdentity({
  name,
  meta,
  avatarColor = '#FF5CA8',
  avatarShadow = '#C43A7C',
  badge
}: {
  name: string;
  meta: string;
  avatarColor?: string;
  avatarShadow?: string;
  badge?: ReactNode;
}) {
  return (
    <View className="mt-[14px] flex-row items-center gap-[15px]">
      <ToyShadow depth={4} shadowColor={avatarShadow} backgroundColor={avatarColor} radius={9999}>
        <View className="h-[78px] w-[78px] items-center justify-center">
          <Text className="font-fredoka-700 text-[29px] text-white">{initialsOf(name)}</Text>
        </View>
      </ToyShadow>
      <View className="flex-1 items-start">
        <Text className="font-fredoka-700 text-[28px] leading-[30px] text-white" numberOfLines={1}>
          {name}
        </Text>
        <Text className="font-nunito-700 mt-[3px] text-[13.5px] text-ink-muted" numberOfLines={1}>
          {meta}
        </Text>
        {badge ? <View className="mt-2">{badge}</View> : null}
      </View>
    </View>
  );
}

/** A small toy pill — the orange streak on your profile, the yellow "#1 this week" on a public one. */
export function ProfileBadge({
  label,
  backgroundColor,
  shadowColor,
  color
}: {
  label: string;
  backgroundColor: string;
  shadowColor: string;
  color: string;
}) {
  return (
    <ToyShadow depth={3} shadowColor={shadowColor} backgroundColor={backgroundColor} radius={9999}>
      <View className="px-[11px] py-1">
        <Text className="font-nunito-900 text-[13px]" style={{ color }}>
          {label}
        </Text>
      </View>
    </ToyShadow>
  );
}

/** The stat trio (or pair, on a public profile). */
export function StatRow({ stats }: { stats: { value: string; label: string; color?: string }[] }) {
  return (
    <View className="mt-[22px] flex-row gap-[9px]">
      {stats.map(stat => (
        <View key={stat.label} className="flex-1 items-center rounded-20 bg-surface px-[10px] py-[14px]">
          <Text className="font-fredoka-700 text-[24px]" style={{ color: stat.color ?? '#FFFFFF' }}>
            {stat.value}
          </Text>
          <Text className="font-nunito-900 mt-[2px] text-[11px] text-ink-dim">{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <View className="mt-[18px] flex-row items-baseline justify-between">
      <Text className="font-nunito-900 text-[12.5px] text-ink-muted">{children}</Text>
      {trailing}
    </View>
  );
}

/* Superlative chips. Each takes the poll's own colour, which is why they're all different — the
   palette comes from the prompts, not from a fixed rotation. */
const CHIP_INK: Record<string, string> = { '#FFD84D': '#3A2A00', '#6BF2C2': '#0A3B2C' };

/** Snapchat's yellow needs dark ink; the other two tiles are dark enough for white. */
const SOCIAL_INK: Record<string, string> = { snapchat: '#1A1A00' };

function darken(hex: string): string {
  // Cheap shadow for an arbitrary poll colour: 70% toward black, which keeps the hue.
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#C43A7C';
  const r = Math.round(((n >> 16) & 255) * 0.7);
  const g = Math.round(((n >> 8) & 255) * 0.7);
  const b = Math.round((n & 255) * 0.7);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function SuperlativeChips({
  superlatives,
  lockedCount,
  onLockedPress
}: {
  superlatives: Superlative[];
  /** How many are withheld behind God Mode; 0 hides the lock chip. */
  lockedCount: number;
  onLockedPress?: () => void;
}) {
  return (
    <View className="mt-[10px] flex-row flex-wrap gap-[9px]">
      {superlatives.map(s => {
        const bg = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#FF5CA8';
        return (
          <ToyShadow key={s.text} depth={3} shadowColor={darken(bg)} backgroundColor={bg} radius={9999}>
            <View className="px-[14px] py-[9px]">
              <Text className="font-nunito-900 text-[13.5px]" style={{ color: CHIP_INK[bg] ?? '#FFFFFF' }}>
                {s.emoji} {s.text}
                {s.count > 1 ? ` ×${s.count}` : ''}
              </Text>
            </View>
          </ToyShadow>
        );
      })}
      {lockedCount > 0 && (
        <Pressable onPress={onLockedPress} className="rounded-pill bg-surface px-[14px] py-[9px]">
          <View className="flex-row items-center gap-[6px]">
            <AuraIcon name="lock" size={14} color="#848286" />
            <Text className="font-nunito-900 text-[13.5px] text-ink-dim">{lockedCount} still locked</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/* Socials, 13A's layout: a linked platform gets a full cream row, the unlinked ones collapse into
   compact pills. That way a profile with one handle doesn't show three empty rows. */
export function SocialsList({
  socials,
  onEdit
}: {
  socials: Socials;
  /** Omitted on a public profile, where the rows are open-only. */
  onEdit?: (key: (typeof SOCIALS)[number]['key']) => void;
}) {
  const linked = SOCIALS.filter(s => socials[s.key]);
  const unlinked = SOCIALS.filter(s => !socials[s.key]);

  return (
    <>
      <View className="mt-[10px] gap-2">
        {linked.map(social => {
          const handle = socials[social.key] as string;
          return (
            <ToyShadow
              key={social.key}
              depth={4}
              shadowColor="#D9C7AF"
              backgroundColor="#FFF6E8"
              radius={20}
              onPress={() => Linking.openURL(social.url(handle))}
            >
              <View className="flex-row items-center gap-3 px-[14px] py-3">
                {/* Category glyph, not a brand mark — see SOCIALS. On the platform's own colour, so the
                    row still reads as "that app" while the real marks are outstanding. */}
                <View className="h-[38px] w-[38px] items-center justify-center" style={{ borderRadius: 12, backgroundColor: social.color }}>
                  <AuraIcon name={social.icon as AuraIconName} size={20} color={SOCIAL_INK[social.key] ?? '#FFFFFF'} />
                </View>
                <View className="flex-1">
                  <Text className="font-nunito-900 text-[14.5px]" style={{ color: '#2D2A2E' }}>
                    {social.label}
                  </Text>
                  <Text className="font-nunito-700 mt-[1px] text-[12.5px]" style={{ color: '#8B888D' }}>
                    @{handle}
                  </Text>
                </View>
                {onEdit && (
                  <Pressable
                    onPress={() => onEdit(social.key)}
                    hitSlop={10}
                    className="rounded-pill px-[14px] py-2"
                    style={{ backgroundColor: '#F2E7D4' }}
                  >
                    <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#5B585C' }}>
                      Edit
                    </Text>
                  </Pressable>
                )}
              </View>
            </ToyShadow>
          );
        })}
      </View>

      {/* Only on your own profile: on someone else's, an unlinked platform is simply absent. */}
      {onEdit && unlinked.length > 0 && (
        <View className="mt-2 flex-row gap-[7px]">
          {unlinked.map(social => (
            <Pressable
              key={social.key}
              onPress={() => onEdit(social.key)}
              className="flex-1 flex-row items-center justify-center gap-[6px] rounded-pill bg-surface px-1 py-[10px]"
            >
              <AuraIcon name={social.icon as AuraIconName} size={16} color="#6BF2C2" />
              <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#6BF2C2' }}>
                {social.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

/** The `surface` row with a chevron — "Block or report someone" on both profiles. */
export function ProfileActionRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center rounded-20 bg-surface px-4 py-[13px]">
      <Text className="font-nunito-800 flex-1 text-[13.5px] text-ink-secondary">{label}</Text>
      <AuraIcon name="chevronRight" size={18} color="#727074" />
    </Pressable>
  );
}
