/** Offer a file to save (the browser's download). */
export function download(data: BlobPart, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  // Revoked later: some browsers start the download only after click() returns.
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** A file name from a song's name: the characters files can't have become dashes. */
export const fileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Song";
