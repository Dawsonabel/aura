import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SOCIALS, type Socials } from '@aura/api-client';
import type { Superlative } from '../hooks/useProfile';
import { ToyShadow } from './ToyShadow';
import { AuraIcon, type AuraIconName } from './AuraIcon';
import { BrandTile } from './BrandMark';

/* Shared pieces of 13A's Profile, used by both your own profile and the public one so the two can't
   drift apart — the whole point of the public view is that it's recognisably the same person. */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** "Maya Patel" -> "Maya". Buttons and clue tiles use the first name; a surname is never the reward. */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Someone';
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

function darken(hex: string): string {
  // Cheap shadow for an arbitrary poll colour: 70% toward black, which keeps the hue.
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#C43A7C';
  const r = Math.round(((n >> 16) & 255) * 0.7);
  const g = Math.round(((n >> 8) & 255) * 0.7);
  const b = Math.round((n & 255) * 0.7);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* One person, one avatar colour, everywhere.

   There is no colour stored on User, so it's derived from the id — the id is stable, so the colour is
   too, and nobody's avatar changes hue between renders or between screens.

   This exists because that last part wasn't true. Two screens had grown their own copy of this idea
   with *different* palettes (People had `#FFD84D` where Report had `#F5D65C`, in a different order),
   and two more hardcoded a single colour for everyone — the candidate sheet was mint for every
   student alive, the public profile purple. So one person could be pink on the People screen, mint on
   the sheet that opens when you tap them, and purple on their own profile. The colour reads as an
   identity cue, which makes four answers worse than none.

   Ink is carried alongside the fill because two of these are light enough that white type on them is
   unreadable; keeping the pair together is what stops a call site from picking one and forgetting the
   other. */
const AVATAR_ACCENTS = ['#FF5CA8', '#6BF2C2', '#7C6CF5', '#FFD84D', '#F5A05C'];
const AVATAR_INK: Record<string, string> = { '#6BF2C2': '#0A3B2C', '#FFD84D': '#3A2A00' };

export function avatarAccent(id: string): { bg: string; shadow: string; ink: string } {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  const bg = AVATAR_ACCENTS[sum % AVATAR_ACCENTS.length];
  return { bg, shadow: darken(bg), ink: AVATAR_INK[bg] ?? '#FFFFFF' };
}

/* Three rows at most, and the overflow goes sideways.

   These used to wrap: every extra title pushed the rest of the profile — socials, the block/report
   row — further down, so the more someone had won the harder their profile was to use. Height is the
   scarce axis on a phone and horizontal space is free, so the shelf caps at three rows and scrolls.

   Rows are filled **round-robin**, not in sequence, and that's the load-bearing part: the server
   returns these most-picked-first, so round-robin puts #1, #2 and #3 in the leftmost column — the top
   three are what you see before scrolling anything. Chunking sequentially would bury #2 and #3 off the
   right edge. It also keeps the rows near-equal in width, so the shelf's scroll length is set by the
   real content rather than by one overloaded row.

   Row count grows with the collection instead of being fixed at three: a profile with two titles gets
   one row, not one title stranded above two empty ones. */
function rowsFor(n: number): number {
  return Math.min(3, Math.ceil(n / 2));
}

export function SuperlativeChips({
  superlatives,
  lockedCount,
  onLockedPress
}: {
  superlatives: Superlative[];
  /** How many are withheld behind Infinite Aura; 0 hides the lock chip. */
  lockedCount: number;
  onLockedPress?: () => void;
}) {
  /* At least one row even with nothing won: every superlative can be locked behind Infinite Aura, and
     that lock chip lives on the last row — with zero rows there'd be no row to put it on and the only
     route to the paywall would silently disappear. */
  const rowCount = Math.max(1, rowsFor(superlatives.length));
  const rows: Superlative[][] = Array.from({ length: rowCount }, () => []);
  superlatives.forEach((s, i) => rows[i % rowCount].push(s));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      /* The chips are pills with a toy shadow, so the shelf needs room below the last row for the slab
         and a little lead-in at the sides — a chip flush against the screen edge reads as cut off
         rather than as scrollable. */
      contentContainerStyle={{ paddingRight: 21, paddingBottom: 4 }}
      /* Pulled out to the screen edge (both screens pad by 21) so chips scroll off the edge instead of
         being clipped short of it — inside the padding, a full row looks truncated rather than
         scrollable. Plain style rather than a negative Tailwind margin, which NativeWind is fussy about. */
      style={{ marginTop: 10, marginRight: -21 }}
    >
      <View className="gap-[9px]">
        {rows.map((row, i) => (
          <View key={i} className="flex-row gap-[9px]">
            {row.map(s => {
              const bg = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#FF5CA8';
              return (
                <ToyShadow key={s.text} depth={3} shadowColor={darken(bg)} backgroundColor={bg} radius={9999}>
                  <View className="px-[14px] py-[9px]">
                    {/* One line, always. In a horizontal scroller there's no width to wrap against, so
                        a long prompt simply makes its row longer — which is what the scroll is for. */}
                    <Text
                      className="font-nunito-900 text-[13.5px]"
                      numberOfLines={1}
                      style={{ color: CHIP_INK[bg] ?? '#FFFFFF' }}
                    >
                      {s.emoji} {s.text}
                      {s.count > 1 ? ` ×${s.count}` : ''}
                    </Text>
                  </View>
                </ToyShadow>
              );
            })}
            {/* The lock chip rides the last row, so it's the thing you reach at the end rather than a
                fourth row that would break the cap. */}
            {lockedCount > 0 && i === rowCount - 1 && (
              <Pressable onPress={onLockedPress} className="rounded-pill bg-surface px-[14px] py-[9px]">
                <View className="flex-row items-center gap-[6px]">
                  <AuraIcon name="lock" size={14} color="#848286" />
                  <Text className="font-nunito-900 text-[13.5px] text-ink-dim">{lockedCount} still locked</Text>
                </View>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
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
                {/* Mark *and* tile from BrandTile — the background is as much the brand's as the glyph
                    is, and Instagram's is a gradient a View can't paint. See BrandMark. */}
                <BrandTile name={social.key} size={38} />
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
              {/* Deliberately the category glyph, not the brand mark, unlike the linked row above:
                  this pill is Aura mint, and tinting a platform's mark to a colour of ours is exactly
                  the modification their guidelines rule out. A generic icon beside the platform's name
                  in our own colour claims nothing. */}
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
