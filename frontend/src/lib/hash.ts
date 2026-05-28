// Hash display helpers.

export function truncateHash(value: string): string {
  if (value.length <= 22) return value;
  return `${value.slice(0, 16)}…${value.slice(-4)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
