"use client";

import { Camera } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { idleFormState, type FormState } from "@/lib/form-state";
import { announceProfileUpdated } from "@/lib/profile-events";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { FormMessage } from "@/ui/form-message";
import { UserAvatar } from "@/ui/user-avatar";
import { AVATAR_PIXELS } from "../avatar";
import type { AvatarSource } from "../profile.service";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

type Props = {
  displayName: string;
  avatarUrl: string | null;
  source: AvatarSource;
  upload: Action;
  remove: Action;
};

/**
 * Crops the photo to a centered square and shrinks it to AVATAR_PIXELS as a JPEG, in the browser.
 * A phone photo is several MB; this is well under 100 KB, so it uploads fast and every avatar is
 * the same shape. createImageBitmap applies the photo's EXIF rotation, so selfies stay upright.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PIXELS,
    AVATAR_PIXELS,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      0.88,
    ),
  );
}

/** The member's photo with a one-tap way to change it: pick, preview, save. */
export function AvatarEditor({ displayName, avatarUrl, source, upload, remove }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // On success: tell the header, and drop the local preview (the saved photo now shows instead).
  const withAnnounce =
    (action: Action): Action =>
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.status === "success") {
        announceProfileUpdated();
        setPreview(null);
      }
      return result;
    };
  const [uploadState, uploadAction] = useActionState(withAnnounce(upload), idleFormState);
  const [removeState, removeAction] = useActionState(withAnnounce(remove), idleFormState);
  const [lastAction, setLastAction] = useState<"upload" | "remove" | null>(null);
  const message = lastAction === "remove" ? removeState : uploadState;

  // Free the preview's object URL when it is replaced or the editor goes away.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  async function onPick(file: File | undefined) {
    setReadError(null);
    if (!file) return;
    try {
      const blob = await toSquareJpeg(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setReadError("We couldn't read that photo. Try a JPG or PNG.");
    } finally {
      // Picking the same file again should still fire a change.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function save() {
    if (!preview) return;
    const form = new FormData();
    form.set("avatar", new File([preview.blob], "avatar.jpg", { type: "image/jpeg" }));
    setLastAction("upload");
    startTransition(() => uploadAction(form));
  }

  function removePhoto() {
    setLastAction("remove");
    startTransition(() => removeAction(new FormData()));
  }

  const shown = preview?.url ?? avatarUrl;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <label
          htmlFor={inputId}
          className="group relative shrink-0 cursor-pointer rounded-full outline-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/60"
        >
          <UserAvatar
            displayName={displayName}
            avatarUrl={shown}
            className="size-20 ring-2 ring-line *:data-[slot=avatar-fallback]:text-2xl *:data-[slot=avatar-fallback]:font-semibold"
          />
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border-2 border-canvas bg-brand text-on-brand shadow-glow-brand transition-transform group-hover:scale-110"
          >
            <Camera className="size-4" />
          </span>
          <span className="sr-only">Choose a new profile photo</span>
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />

        <div className="flex flex-col items-start gap-2">
          {preview ? (
            <>
              <p className="text-sm text-text-muted">Here&apos;s how it will look.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-10 px-4 font-semibold"
                  disabled={pending}
                  onClick={save}
                >
                  {pending ? "Saving..." : "Save photo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-4"
                  disabled={pending}
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-10 px-4"
                disabled={pending}
                onClick={() => inputRef.current?.click()}
              >
                {avatarUrl ? "Change photo" : "Add a photo"}
              </Button>
              {source === "upload" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-4"
                  disabled={pending}
                  onClick={removePhoto}
                >
                  {pending && lastAction === "remove" ? "Removing..." : "Remove photo"}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {readError ? <Alert variant="error">{readError}</Alert> : <FormMessage state={message} />}
    </div>
  );
}
