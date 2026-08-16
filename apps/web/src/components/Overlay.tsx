import type { CSSProperties, ReactNode } from 'react';

/* Shared modal/overlay wrapper — backdrop click closes, panel click doesn't. Extracted once
   Profile needed four of these (Edit Profile, Manage Account, Blocked List, user-actions sheet)
   on top of Inbox's Flame Detail, rather than five hand-rolled copies of the same wrapper. */
export function Overlay({ onClose, style, children }: { onClose: () => void; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-6" style={style} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
