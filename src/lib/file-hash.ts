// Browser-side helpers for staff uploads: the server recomputes size, signature and SHA-256 from the bytes it receives.
export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const formatBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`;
export const safeFileName = (name: string) => name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180);
