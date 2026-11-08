export function normalizedText(text: string) { return text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim(); }
export function editDistance(a: readonly string[], b: readonly string[]) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = current;
  }
  return previous[b.length];
}
export function recognitionMetrics(expected: string, actual: string) {
  const reference = normalizedText(expected); const recognized = normalizedText(actual);
  const words = (s: string) => s.match(/[\p{L}\p{N}]+/gu) ?? [];
  const characterErrors = editDistance([...reference], [...recognized]);
  const wordErrors = editDistance(words(reference), words(recognized));
  return { characterErrors, referenceCharacters: [...reference].length, cer: characterErrors / Math.max(1, [...reference].length),
    wordErrors, referenceWords: words(reference).length, wer: wordErrors / Math.max(1, words(reference).length) };
}
