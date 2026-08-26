import { Modal, Pressable, Text, View } from 'react-native';
import { ToyShadow } from './ToyShadow';
import { AuraIcon, type AuraIconName } from './AuraIcon';

/* Bottom-sheet confirm. The 6A design labels this "the sheet pattern, reused for every confirm",
   so it's built generic from the start rather than inlined into sign-out — delete-account,
   unfriend and block should all use it.

   The destructive action is pink: per the token table pink covers "primary CTA, unread, alerts",
   and this is the one place an account surface is allowed a pink CTA instead of mint, because it
   is the alert. The dismiss below it stays quiet `surface`. */
export function ConfirmSheet({
  visible,
  icon,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'destructive',
  onConfirm,
  onCancel
}: {
  visible: boolean;
  /** Large centred icon above the title — 8A's report-sent sheet leads with the shield. */
  icon?: AuraIconName;
  title: string;
  body: React.ReactNode;
  /** Extra content between the body and the buttons (8A's "what happens next" rows). */
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /* 'destructive' keeps the pink CTA (sign out, delete, block). 'positive' switches it to mint for
     the confirmation variant, where the primary action is just "I'm done reading" — pink there
     would read as a second warning. */
  tone?: 'destructive' | 'positive';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const positive = tone === 'positive';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Backdrop dismisses; the sheet itself claims the touch (RN has no event bubbling to stop). */}
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(13,12,13,0.68)' }} onPress={onCancel}>
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#2B282B', borderTopLeftRadius: 30, borderTopRightRadius: 30 }}
          className="px-[21px] pb-[34px] pt-[26px]"
        >
          <View className="mx-auto mb-5 h-[5px] w-[44px] rounded-pill" style={{ backgroundColor: '#4A474B' }} />
          {icon ? (
            <View className="items-center">
              <AuraIcon name={icon} size={40} color="#9A989B" />
            </View>
          ) : null}
          <Text
            className="font-fredoka-700 text-center text-[26px] text-white"
            style={icon ? { marginTop: 10 } : undefined}
          >
            {title}
          </Text>
          <Text className="font-nunito-700 mt-2 text-center text-[14px] leading-[20px] text-ink-muted">{body}</Text>
          {children}

          <View className="mt-[22px] gap-[10px]">
            <ToyShadow
              depth={5}
              shadowColor={positive ? '#3FBF95' : '#C43A7C'}
              backgroundColor={positive ? '#6BF2C2' : '#FF5CA8'}
              radius={9999}
              onPress={onConfirm}
            >
              <View className="items-center py-4">
                <Text className="font-fredoka-700 text-[18px]" style={{ color: positive ? '#0A3B2C' : '#FFFFFF' }}>
                  {confirmLabel}
                </Text>
              </View>
            </ToyShadow>
            <Pressable onPress={onCancel} className="items-center rounded-pill bg-surface py-[14px]">
              <Text className="font-nunito-900 text-[15px] text-ink-secondary">{cancelLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
