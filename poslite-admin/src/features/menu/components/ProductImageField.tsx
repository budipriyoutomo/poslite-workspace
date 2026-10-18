"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

import { type UploadedImage, useUploadImage } from "../application/use-menu";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";
const ERRORS: Record<string, string> = {
  IMAGE_TOO_LARGE: "Ukuran gambar maksimal 2 MB",
  UNSUPPORTED_IMAGE: "Gambar harus JPG, PNG, atau WebP",
};

/** Upload + preview (ADR-021). The form keeps only `key`; `url` is just for showing it.
 * `subject` names what the image is of (product photo, brand logo) for labels. */
export function ProductImageField({
  value,
  onChange,
  title = "Gambar (opsional)",
  subject = "gambar produk",
}: {
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  title?: string;
  subject?: string;
}) {
  const upload = useUploadImage();
  const [error, setError] = useState<string | null>(null);

  const choose = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setError(ERRORS.UNSUPPORTED_IMAGE!);
    if (file.size > MAX_BYTES) return setError(ERRORS.IMAGE_TOO_LARGE!);
    upload.mutate(file, {
      onSuccess: onChange,
      onError: (err) => setError(err instanceof ApiError ? (ERRORS[err.code] ?? err.message) : "Gagal mengunggah gambar"),
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{title}</span>
      <div className="flex items-center gap-3">
        <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
          {value ? (
            <Image src={value.url} alt={`Pratinjau ${subject}`} fill unoptimized sizes="96px" className="object-cover" />
          ) : (
            <ImageOff className="size-8 text-muted-foreground/40" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
            {upload.isPending ? "Mengunggah…" : value ? "Ganti gambar" : "Pilih gambar"}
            <input
              type="file"
              accept={ACCEPT}
              aria-label={subject.charAt(0).toUpperCase() + subject.slice(1)}
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ""))}
            />
          </label>
          {value && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              Hapus gambar
            </Button>
          )}
          <p className="text-xs text-muted-foreground">JPG, PNG, atau WebP · maks 2 MB</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
