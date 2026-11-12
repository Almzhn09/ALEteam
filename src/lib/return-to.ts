/** Only local, unambiguous browser destinations may be used after authentication. */
export function safeReturnTo(value: string | null) {
  // Browsers remove tabs/newlines before URL parsing and treat backslashes as slashes.
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/u.test(value)) return '/';
  try {
    const url = new URL(value, 'https://archive.invalid');
    if (url.origin !== 'https://archive.invalid' || url.pathname.startsWith('//')) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
