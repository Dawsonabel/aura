import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { ToyShadow } from './ToyShadow';
import { AuraIcon, type AuraIconName } from './AuraIcon';
import { SPARK_FILL, SPARK_INK, SPARK_SHADOW } from './currency';
import { CREAM_GRADE } from './auraKit';
import { SOCIALS, type FriendState } from '@aura/api-client';
import { SocialsList, avatarAccent, firstNameOf, gradeLabel, initialsOf } from './profileKit';
import { SkeletonBlock } from './stateKit';
import type { PublicProfile } from '../hooks/useProfile';

/* 14A "Voting, rationed" — the pieces the Vote screen grew when rounds stopped being unlimited.

   All of it exists to answer one question the old screen couldn't: what happens when a resource runs
   out. Rounds run out (pips, then the out-of-rounds screen), coins run out (the reroll sheet), and one
   reroll per question runs out (the button's fourth state). The design's rule throughout is that a
   spent resource explains itself rather than going grey and silent. */

/* `RoundPips` lived here — one dot per round of the daily allowance, spent/live/upcoming. The
   allowance is one round an hour now, so the pips had exactly one dot to draw and the row said
   "Round 1 of 1". The Vote screen's header is a notch per *question* instead (see ProgressRow). */

/* ---------------------------------------------------------------- header person-plus */

/* The People screen's primary entry point, right of the coin pill. Mint because it's a growth/account
   action rather than a vote, and it carries the 3px toy shadow so it reads pressable next to the two
   flat status pills. */
export function PersonPlusButton({ onPress }: { onPress: () => void }) {
  return (
    <ToyShadow depth={3} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={9999} onPress={onPress}>
      <View className="h-[38px] w-[38px] items-center justify-center" accessibilityLabel="Find people to follow">
        <AuraIcon name="personPlus" size={21} color="#0A3B2C" />
      </View>
    </ToyShadow>
  );
}

/* ---------------------------------------------------------------- status row */

/* Streak, coin balance, and the door to People.

   Lives on the Aura tab, not the Vote tab. It started on Vote because that's the screen people open
   most, but it was three pieces of standing-account state sitting directly above the one screen whose
   whole job is a single decision — the ballot competes badly with a streak pill and a shop button.
   Aura is where you go to look at your own status anyway, so they belong together and Vote gets to be
   just the question and four faces.

   Shared rather than duplicated: it reads the same `me.streak`/`me.coins` either way, and two copies
   would drift the moment one screen's pill got restyled. */
export function StatusRow({
  coins,
  streak,
  onPeople,
  onCoins
}: {
  coins: number;
  streak: number;
  onPeople: () => void;
  onCoins: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      {/* Real streak: `me.streak` is derived server-side (streak.ts) and reads 0 the moment a day is
          missed. This used to be a hardcoded 12 — an invented number on the app's most-visited screen.
          At 0 the pill goes quiet rather than announcing a streak of nothing. */}
      {streak > 0 ? (
        <ToyShadow depth={3} shadowColor="#C4501E" backgroundColor="#FF7A3D" radius={9999}>
          <View className="flex-row items-center gap-[7px] px-[14px] py-[7px]">
            <AuraIcon name="flame" size={18} color="#FFFFFF" />
            <Text className="font-nunito-900 text-[15px] text-white">{streak}</Text>
            <Text className="font-nunito-800 text-[13px]" style={{ color: '#FFE0CE' }}>
              {streak === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </ToyShadow>
      ) : (
        <View className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]">
          <AuraIcon name="flame" size={18} color="#848286" />
          <Text className="font-nunito-800 text-[13px] text-ink-dim">Start a streak</Text>
        </View>
      )}

      <View className="flex-row items-center gap-[9px]">
        {/* The balance is the natural door to the Shop — you tap the number you want more of. Keeps the
            Shop off the tab bar, which 14A already settled at four items. */}
        <Pressable
          onPress={onCoins}
          hitSlop={6}
          className="flex-row items-center gap-[7px] rounded-pill bg-surface px-[14px] py-[7px]"
        >
          <AuraIcon name="bolt" size={18} color={SPARK_FILL} />
          <Text className="font-nunito-900 text-[15px] text-white">{coins}</Text>
        </Pressable>
        {/* 14A's navigation call: People is not a fifth tab (five 78px items don't fit, and a tab would
            compete with voting for the session). This button is its primary entry point. */}
        <PersonPlusButton onPress={onPeople} />
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- refill countdown */

/* "⏳ 6h 12m until 3 more".

   Derived from the wall clock on a timer rather than counted down, for the same reason as useCooldown:
   iOS freezes JS timers while the app is backgrounded, and this particular wait is hours long, so a
   decrementing counter would be wrong by however long the phone was in a pocket. Ticks every 30s,
   which is as often as a minutes-resolution label can change. */
function untilLabel(iso: string, now: number): string | null {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const ms = at - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CountdownPill({ untilIso, trailing }: { untilIso: string | null; trailing: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const label = untilIso ? untilLabel(untilIso, now) : null;

  return (
    <View
      className="mt-[18px] flex-row items-center gap-[9px] self-start rounded-pill px-4 py-[10px]"
      style={{ backgroundColor: '#332F35' }}
    >
      <AuraIcon name="hourglass" size={17} color="#FF7A3D" />
      {/* No fake number when the refill time didn't arrive — the pill says "at midnight", which is
          true regardless, instead of a countdown to nothing. */}
      <Text className="font-fredoka-700 text-[17px] text-white">{label ?? 'Midnight UTC'}</Text>
      <Text className="font-nunito-800 text-[13px] text-ink-muted">{trailing}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- cream action card */

/* The out-of-rounds screen's two moves. Cream rather than a muted `surface` row because these are the
   only two things that change tomorrow's four — 14A: "so they are cream cards rather than muted rows". */
export function CreamActionCard({
  icon,
  iconBackground,
  iconShadow,
  iconColor,
  title,
  body,
  onPress
}: {
  icon: AuraIconName;
  iconBackground: string;
  iconShadow: string;
  iconColor: string;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  return (
    <ToyShadow depth={5} shadowColor="#D9C7AF" backgroundColor="#FFF6E8" radius={24} onPress={onPress}>
      <View className="flex-row items-center gap-[14px] px-[18px] py-[17px]">
        <ToyShadow depth={3} shadowColor={iconShadow} backgroundColor={iconBackground} radius={18}>
          <View className="h-[46px] w-[46px] items-center justify-center">
            <AuraIcon name={icon} size={24} color={iconColor} />
          </View>
        </ToyShadow>
        <View className="flex-1">
          <Text className="font-nunito-900 text-[16px]" style={{ color: '#2D2A2E' }}>
            {title}
          </Text>
          <Text className="font-nunito-700 mt-[2px] text-[12.5px] leading-[17px]" style={{ color: '#8B888D' }}>
            {body}
          </Text>
        </View>
      </View>
    </ToyShadow>
  );
}

/* ---------------------------------------------------------------- reroll: can't afford */

/* 14A's answer to "not enough coins": the button stays live and opens this, because "a disabled control
   teaches nothing" — a greyed-out reroll never explains that it has a price, or what the price is.

   Order is deliberate. Voting on is first because it's free and it's the behaviour the product wants;
   the shop is second and never pink, since being short of coins is a choice point, not an error. */
/* `questionsLeft` was a prop here and nothing ever rendered it. It's gone rather than left dangling —
   it is precisely the number the Vote screen now withholds on purpose (see ProgressRow's note in
   aura.tsx), so a channel for it sitting open is an invitation to put it back by accident. */
export function RerollShortSheet({
  visible,
  cost,
  balance,
  payout,
  onKeep,
  onBuy
}: {
  visible: boolean;
  cost: number;
  balance: number;
  payout: number;
  onKeep: () => void;
  onBuy?: () => void;
}) {
  const short = Math.max(0, cost - balance);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onKeep}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(13,12,13,0.68)' }} onPress={onKeep}>
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#2C2A2D', borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
          className="px-[22px] pb-[34px] pt-6"
        >
          <View className="mx-auto mb-5 h-[5px] w-[44px] rounded-pill" style={{ backgroundColor: '#4E4C50' }} />

          <View className="flex-row items-center gap-[13px]">
            <ToyShadow depth={3} shadowColor={SPARK_SHADOW} backgroundColor={SPARK_FILL} radius={20}>
              <View className="h-[52px] w-[52px] items-center justify-center">
                <AuraIcon name="bolt" size={28} color={SPARK_INK} />
              </View>
            </ToyShadow>
            <View className="flex-1">
              <Text className="font-fredoka-700 text-[24px] leading-[27px] text-white">
                You're {short} short
              </Text>
              <Text className="font-nunito-700 mt-[3px] text-[13.5px] text-ink-muted">
                A new four costs {cost}. You have {balance}.
              </Text>
            </View>
          </View>

          <View className="mt-5 gap-[10px]">
            <ToyShadow depth={5} shadowColor="#3FBF95" backgroundColor="#6BF2C2" radius={22} onPress={onKeep}>
              <View className="flex-row items-center justify-between px-[18px] py-4">
                <View className="flex-1">
                  <Text className="font-nunito-900 text-[16px]" style={{ color: '#0A3B2C' }}>
                    Finish this round
                  </Text>
  
                </View>
                <AuraIcon name="arrowRight" size={20} color="#0A3B2C" />
              </View>
            </ToyShadow>

            {/* Flat surface, no toy shadow and no pink: the shop is the second choice here, not the
                recommended one. */}
            <Pressable
              onPress={onBuy}
              className="flex-row items-center justify-between rounded-22 bg-surface px-[18px] py-4"
            >
              <View className="flex-1">
                <Text className="font-nunito-900 text-[16px] text-white">Buy coins</Text>
                <Text className="font-nunito-800 mt-[2px] text-[12.5px] text-ink-muted">
                  {/* The design prints "From 50 · $0.99". There is no coin IAP or price catalogue in
                      the app yet (see DESIGN-REQUESTS §7), so this says what's true rather than quoting
                      a price nothing can charge. */}
                  Not on sale yet — rounds are the only way to earn
                </Text>
              </View>
              <AuraIcon name="arrowRight" size={20} color="#C1C0C0" />
            </Pressable>
          </View>

          <Pressable onPress={onKeep} hitSlop={10} className="mt-4 items-center">
            <Text className="font-nunito-800 text-[13.5px] text-ink-faint">Keep these four</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------------------------------------------------------- the candidate sheet */

/* Tapping a candidate lifts this over the blurred grid, and the vote is a button inside it.

   That is a deliberate reversal of the design. §5.1 made the grid tap the ballot and put the profile
   behind a long-press *because* "a tap here is an irreversible vote, so the profile can't share it" —
   which solved the collision by making the profile hard to reach, and left the ballot with nothing in
   front of it. An anonymous vote for the wrong person, cast by a fat finger, could not be taken back.
   Now the tap opens the card and the vote costs a second, deliberate press. The long-press is gone
   entirely rather than kept as a synonym: two gestures that do the same thing is how the "✋ HOLD"
   chip came to exist, and a hint teaching a gesture nobody needs is worse than no hint.

   Deviation from the design, stated plainly: the mock's footer reads "Let go to close", which belonged
   to the hold. This card is dismissed by tapping outside it, and the footer says so. */
export function CandidateSheet({
  profile,
  loading,
  friendState,
  friendBusy,
  onFriendAction,
  onVote,
  onOpenProfile,
  onClose
}: {
  profile: PublicProfile | null | undefined;
  loading: boolean;
  friendState: FriendState;
  friendBusy: boolean;
  onFriendAction: () => void;
  /** Casts the ballot and closes. The only path to a vote now. */
  onVote: () => void;
  onOpenProfile: () => void;
  onClose: () => void;
}) {
  const [socialsOpen, setSocialsOpen] = useState(false);
  const socialCount = profile ? SOCIALS.filter(s => profile.socials[s.key]).length : 0;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      {/* 0.82, not 0.62: at the lighter value the four candidate cards stayed legible behind the sheet
          and competed with it — you could still read the names you were choosing between while the
          card asking you to choose was on top. Dim enough that the grid reads as "later, not now". */}
      <Pressable className="flex-1 justify-center px-[18px]" style={{ backgroundColor: 'rgba(13,12,13,0.82)' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <ToyShadow depth={10} shadowColor="#C9B79F" backgroundColor="#FFF6E8" radius={30}>
            {/* Scrolls, because the card is no longer a fixed size: three superlative chips and three
                expanded socials on a small phone add up past the screen, and a card that can grow needs
                somewhere for the growth to go. The cap is 78% rather than the screen so there's room
                for the Close button beneath it plus backdrop above — a sheet running edge to edge
                stops reading as dismissable. `bounces={false}` so a short card doesn't rubber-band. */}
            <ScrollView
              className="px-[22px] py-6"
              style={{ maxHeight: Dimensions.get('window').height * 0.78 }}
              bounces={false}
              showsVerticalScrollIndicator={false}>
              {loading ? (
                <View className="gap-4">
                  <SkeletonBlock height={62} radius={100} width={62} />
                  <SkeletonBlock height={20} radius={100} width="60%" />
                  <SkeletonBlock height={38} radius={100} />
                </View>
              ) : !profile ? (
                /* Same message as /u's: the server declines for a different school or a deleted
                   account, and saying which would leak whether that person exists. */
                <Text className="font-nunito-700 text-center text-[14px] leading-[20px]" style={{ color: '#8B888D' }}>
                  That profile isn't available. You can only see people at your own school.
                </Text>
              ) : (
                <>
                  <View className="flex-row items-center gap-[14px]">
                    {/* Their own colour, not mint. This was hardcoded, so every candidate you opened
                        wore the same avatar — see avatarAccent. */}
                    <ToyShadow
                      depth={4}
                      shadowColor={avatarAccent(profile.id).shadow}
                      backgroundColor={avatarAccent(profile.id).bg}
                      radius={9999}
                    >
                      <View className="h-[62px] w-[62px] items-center justify-center">
                        <Text className="font-fredoka-700 text-[24px]" style={{ color: avatarAccent(profile.id).ink }}>
                          {initialsOf(profile.name)}
                        </Text>
                      </View>
                    </ToyShadow>
                    <View className="flex-1">
                      <Text className="font-fredoka-700 text-[24px] leading-[27px]" style={{ color: '#2D2A2E' }} numberOfLines={1}>
                        {profile.name}
                      </Text>

                      {/* Handle · grade, with the crown count riding the same line.

                          The crown had a row to itself, which gave a two-character badge the same
                          vertical weight as the name and the vote button and made the card read as
                          three separate facts instead of one person. It belongs with the other
                          identifying details.

                          A count, not a list: naming the titles here would put a stranger's whole
                          reputation on the ballot — choosing "smartest in the room" while reading that
                          this person already won it is a nudge toward whoever needs it least. The
                          titles are one tap away on the full profile, where nobody is mid-ballot.

                          No school name in the line either: every candidate is at the viewer's own
                          school by construction, so it was a constant eating the room the handle and
                          grade have to share. */}
                      <View className="mt-[3px] flex-row items-center gap-[8px]">
                        <Text
                          className="font-nunito-700 text-[13px]"
                          style={{ color: '#8B888D', flexShrink: 1 }}
                          numberOfLines={1}
                        >
                          {[profile.username ? `@${profile.username}` : null, gradeLabel(profile.grade)]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        {profile.superlatives.length > 0 && (
                          /* flexShrink on the text above, none here: a long handle truncates before
                             the crown does, since the crown is two characters that can't usefully
                             shrink and the handle is the part with slack in it. */
                          <View
                            className="flex-row items-center gap-[5px] rounded-pill px-[9px] py-[3px]"
                            style={{ backgroundColor: '#FFD84D' }}
                          >
                            <AuraIcon name="crown" size={13} color="#3A2A00" />
                            <Text className="font-nunito-900 text-[12.5px]" style={{ color: '#3A2A00' }}>
                              {profile.superlatives.length}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Collapsed by default, and absent entirely when they've linked nothing — an
                      expander that opens onto "no socials" is a promise the card can't keep.

                      Behind it is the same SocialsList the Me tab uses, in its read-only mode, so a
                      handle opens the same URL from here as from a full profile and there's one place
                      where "what a linked platform looks like" is decided. */}
                  {socialCount > 0 && (
                    <View className="mt-4">
                      <Pressable
                        onPress={() => setSocialsOpen(o => !o)}
                        className="flex-row items-center gap-2 rounded-pill px-[15px] py-[11px]"
                        style={{ backgroundColor: '#EDE3D2' }}
                      >
                        <AuraIcon name="link" size={16} color="#6E6B70" />
                        <Text className="font-nunito-900 flex-1 text-[14px]" style={{ color: '#6E6B70' }}>
                          {socialCount === 1 ? '1 social' : `${socialCount} socials`}
                        </Text>
                        {/* The icon set has one chevron, pointing right. Rotating it beats hand-writing
                            an up/down path: the drawn icons come from the design doc, not from here. */}
                        <View style={{ transform: [{ rotate: socialsOpen ? '-90deg' : '90deg' }] }}>
                          <AuraIcon name="chevronRight" size={16} color="#6E6B70" />
                        </View>
                      </Pressable>
                      {socialsOpen && <SocialsList socials={profile.socials} />}
                    </View>
                  )}

                  {/* The ballot, in the app's action pink.

                      It was mint on the reasoning that mint is the Vote tab's colour. That had it
                      backwards: pink is what the app uses for the thing a screen exists to do — it's
                      the flip button, it's every primary — and casting the vote is unambiguously that
                      here. Mint had it looking like the quiet option on a sheet whose only purpose is
                      this one press.

                      The old worry was that Close beneath it is also pink, making the irreversible and
                      reversible actions read as equal weight. Fixed by moving Close to grey rather
                      than by demoting the vote: a dismiss control is not an action and shouldn't have
                      wanted a colour in the first place. */}
                  <View className="mt-4">
                    <ToyShadow
                      depth={5}
                      shadowColor="#C43A7C"
                      backgroundColor="#FF5CA8"
                      radius={9999}
                      onPress={onVote}
                    >
                      <View className="items-center py-[15px]">
                        <Text className="font-fredoka-700 text-[18px] text-white">
                          Vote for {firstNameOf(profile.name)}
                        </Text>
                      </View>
                    </ToyShadow>
                  </View>

                  <View className="mt-[10px] flex-row gap-[9px]">
                    {/* Same five states as the People row, drawn full width. `friendState` comes from
                        the server for this exact pair, so the sheet and the list can never disagree
                        about whether you've already asked someone. */}
                    <View className="flex-1">
                      <SheetFriendButton state={friendState} busy={friendBusy} onPress={onFriendAction} />
                    </View>
                    {/* Raised and legible, not a flat chip.

                        This was a plain Pressable — no slab under it, `#EDE3D2` fill, `#6E6B70` text —
                        and that combination is precisely what a *disabled* control looks like in this
                        app: sunk into the card, greyed type, nothing to press. It was tappable the
                        whole time and just didn't say so.

                        Two fixes, and both were needed. The ToyShadow gives it the same physical lift
                        as every other button here, which is what makes it read as pressable at all;
                        the darker cream ink (CREAM_GRADE, the card's own text colour) is what stops it
                        reading as greyed-out. Depth 4 to match the mint beside it, so the row sits
                        level.

                        Still deliberately the quietest button on the sheet — cream rather than a
                        colour. It's the one control here that only navigates. */}
                    <ToyShadow
                      depth={4}
                      shadowColor="#C9B79E"
                      backgroundColor="#EDE3D2"
                      radius={9999}
                      onPress={onOpenProfile}
                    >
                      <View className="items-center px-[18px] py-[13px]">
                        <Text className="font-nunito-900 text-[15px]" style={{ color: CREAM_GRADE }}>
                          Full profile
                        </Text>
                      </View>
                    </ToyShadow>
                  </View>

                </>
              )}
            </ScrollView>
          </ToyShadow>
        </Pressable>

        {/* Close, as a control rather than a caption.

            The card used to end with "Tap outside to close. Nothing is cast until you vote." — a line
            explaining a gesture, sitting where a button should be. Tapping the backdrop still closes
            the sheet (that Pressable is unchanged); it just isn't the only way out any more, which is
            what the sentence was really apologising for.

            Outside the card and its stop-propagation Pressable, so it floats on the dimmed backdrop.

            Grey, not pink. It was the app's action pink on the reasoning that it stood out against a
            mint ballot — but the ballot is pink now, and more to the point a dismiss control isn't an
            action. It undoes nothing, casts nothing and costs nothing, so it doesn't need to compete
            with the one button on the sheet that does something. Grey lets it stay obviously tappable
            and obviously secondary at the same time, which is all it was ever for. */}
        {/* A plain View for layout, with `onPress` on the ToyShadow itself — not a Pressable wrapping
            it. ToyShadow's depress is driven by its *own* internal Pressable's `pressed` state, so a
            ToyShadow without `onPress` renders permanently un-pressed no matter what wraps it. Wrapped
            in a Pressable this button worked but never looked like it did, which on a dismiss control
            reads as a dead tap even though the sheet is already closing. */}
        <View className="mt-[18px] self-center">
          {/* Grey, but lifted well clear of the backdrop.

              The first pass used the app's surface grey (#403E41), which is the right colour on the
              *tab* background and the wrong one here — this button floats on the sheet's dimmed
              scrim, and at 82% black the surface tone sits only a few steps off it. The result read
              as dark rather than as secondary.

              Secondary means "quieter than the coloured buttons", not "barely visible". Lifted to
              #56535A with brighter type, which still can't be mistaken for an action next to a pink
              ballot but is unmistakably a button. Slab darkened to match, so it keeps the raised
              two-tone the coloured buttons have. */}
          <ToyShadow depth={4} shadowColor="#3B383E" backgroundColor="#56535A" radius={9999} onPress={onClose}>
            <View className="flex-row items-center gap-[9px] px-[26px] py-[14px]">
              <AuraIcon name="close" size={19} color="#EDEAF0" />
              <Text className="font-nunito-900 text-[17.5px]" style={{ color: '#EDEAF0' }}>
                Close
              </Text>
            </View>
          </ToyShadow>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ---------------------------------------------------------------- friend button */

/* One button per `friendState`, in one place so the People screen, the candidate sheet and any future
   profile button can't drift:

     none      Add        pink, toy shadow — the only state that starts anything
     sent      Requested  flat, tappable to withdraw. Not disabled: a request you can't take back is a
                          trap, and this is the only screen that can undo it
     received  Accept     mint, because saying yes to a person who asked you is the highest-value tap
                          on the screen. Deny lives beside it on the row, not in here
     friends   Friends ✓  flat cream, tap to unfriend
     self      nothing

   Following had no middle: tap and the edge existed. Two of these five states only exist because a
   friendship needs both people, so the button has to say which half is missing. */
export function FriendButton({
  state,
  busy,
  onPress
}: {
  state: FriendState;
  busy: boolean;
  onPress: () => void;
}) {
  if (state === 'self') return null;

  if (state === 'friends' || state === 'sent') {
    const requested = state === 'sent';
    return (
      <Pressable
        onPress={onPress}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={requested ? 'Cancel friend request' : 'Remove friend'}
        className="rounded-pill px-[15px] py-[9px]"
        style={{ backgroundColor: requested ? '#4A474B' : '#EDE3D2' }}
      >
        <View className="flex-row items-center gap-[5px]">
          <Text
            className="font-nunito-900 text-[13.5px]"
            style={{ color: busy ? '#A8A29A' : requested ? '#C1C0C0' : '#6E6B70' }}
          >
            {requested ? 'Requested' : 'Friends'}
          </Text>
          {!requested && <AuraIcon name="check" size={14} color={busy ? '#A8A29A' : '#6E6B70'} />}
        </View>
      </Pressable>
    );
  }

  const accept = state === 'received';
  return (
    <ToyShadow
      depth={3}
      shadowColor={accept ? '#3FBF95' : '#C43A7C'}
      backgroundColor={accept ? '#6BF2C2' : '#FF5CA8'}
      radius={9999}
      onPress={onPress}
      disabled={busy}
      style={busy ? { opacity: 0.6 } : undefined}
    >
      <View className="px-5 py-[9px]">
        <Text className="font-nunito-900 text-[13.5px]" style={{ color: accept ? '#0A3B2C' : '#FFFFFF' }}>
          {accept ? 'Accept' : 'Add'}
        </Text>
      </View>
    </ToyShadow>
  );
}

/* The same five states at sheet scale — full width, taller, no row to share with. Kept beside
   FriendButton rather than parameterised by size: they differ in every dimension that matters and one
   component with a `large` flag would be two components wearing a trench coat. */
export function SheetFriendButton({
  state,
  busy,
  onPress
}: {
  state: FriendState;
  busy: boolean;
  onPress: () => void;
}) {
  if (state === 'self') return null;

  if (state === 'friends' || state === 'sent') {
    const requested = state === 'sent';
    return (
      <Pressable
        onPress={onPress}
        disabled={busy}
        className="items-center rounded-pill py-[13px]"
        style={{ backgroundColor: requested ? '#4A474B' : '#EDE3D2', opacity: busy ? 0.6 : 1 }}
      >
        <View className="flex-row items-center gap-[6px]">
          <Text className="font-nunito-900 text-[15px]" style={{ color: requested ? '#C1C0C0' : '#6E6B70' }}>
            {requested ? 'Requested' : 'Friends'}
          </Text>
          {!requested && <AuraIcon name="check" size={15} color="#6E6B70" />}
        </View>
      </Pressable>
    );
  }

  /* Both live states are mint now — "Add friend" was pink.

     One colour per idea on this sheet: pink is the ballot, the thing the sheet exists for and the only
     press that can't be taken back. Friending is reversible and incidental to voting, so a second pink
     pill directly under the ballot was claiming equal weight for the smaller of the two.

     Accept and Add friend sharing mint is right rather than a collision — they're the same action from
     the two ends of a request, and they can never appear together. */
  const accept = state === 'received';
  return (
    <ToyShadow
      depth={4}
      shadowColor="#3FBF95"
      backgroundColor="#6BF2C2"
      radius={9999}
      onPress={onPress}
      disabled={busy}
      style={busy ? { opacity: 0.6 } : undefined}
    >
      <View className="items-center py-[13px]">
        <Text className="font-nunito-900 text-[15px]" style={{ color: '#0A3B2C' }}>
          {accept ? 'Accept' : 'Add friend'}
        </Text>
      </View>
    </ToyShadow>
  );
}

/** The other half of an incoming request. Quiet on purpose — denying tells the sender nothing. */
export function DenyButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Deny friend request"
      className="items-center justify-center rounded-pill"
      style={{ width: 36, height: 36, backgroundColor: '#EDE3D2', opacity: busy ? 0.6 : 1 }}
    >
      <AuraIcon name="close" size={15} color="#6E6B70" />
    </Pressable>
  );
}
