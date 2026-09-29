import { initialsOf } from "@/domain/membership/membership";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";

/** A member's photo, falling back to initials when there is none or it fails to load. */
function UserAvatar({
  displayName,
  avatarUrl,
  size,
  className,
}: {
  displayName: string;
  avatarUrl: string | null;
  size?: "default" | "sm" | "lg";
  /** Overrides the size preset, for places that need a bigger photo (size the fallback text there too). */
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback aria-hidden="true">{initialsOf(displayName)}</AvatarFallback>
    </Avatar>
  );
}

export { UserAvatar };
