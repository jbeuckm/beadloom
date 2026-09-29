// A user's profile picture (rendered from one of their designs), or their
// initial when they haven't picked one.

import type { Profile } from '../lib/cloud/backend';
import { designThumbnail } from '../lib/library';

export default function Avatar({ user, size = 28 }: { user: Profile; size?: number }) {
  return user.avatar ? (
    <img className="avatar" src={user.avatar} alt="" width={size} height={size} />
  ) : (
    <span className="avatar initial" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
      {user.username.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A saved design as a profile picture: a small PNG the database accepts (≤ 60 000 chars). */
export function avatarFromDesign(json: string): string | null {
  for (const box of [128, 96, 64, 40]) {
    const png = designThumbnail(json, box);
    if (!png) return null;
    if (png.length <= 60000) return png;
  }
  return null;
}
