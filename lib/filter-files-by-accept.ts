/** Returns true when `file` matches an HTML `accept` attribute value. */
export function fileMatchesAccept(file: File, accept: string): boolean {
  if (!accept || accept === "*/*") return true;

  const tokens = accept.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const fileName = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  for (const token of tokens) {
    if (token.startsWith(".")) {
      if (fileName.endsWith(token)) return true;
      continue;
    }
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1);
      if (mime.startsWith(prefix)) return true;
      continue;
    }
    if (token === mime) return true;
    if ((token === "image/heic" || token === "image/heif") && (fileName.endsWith(".heic") || fileName.endsWith(".heif"))) {
      return true;
    }
  }

  return false;
}

export function filterFilesByAccept(
  files: File[],
  accept?: string,
): { accepted: File[]; rejected: File[] } {
  if (!accept) return { accepted: files, rejected: [] };

  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    if (fileMatchesAccept(file, accept)) {
      accepted.push(file);
    } else {
      rejected.push(file);
    }
  }
  return { accepted, rejected };
}
