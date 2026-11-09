import model from '../../training/models/query-model.json';

function linear(weights: number[][], bias: number[], input: number[]) {
  return weights.map((row, i) => row.reduce((sum, w, j) => sum + w * input[j], bias[i]));
}
export function questionFeatures(question: string) {
  const text = Array.from(` ${question.toLowerCase().trim().replace(/\s+/gu, ' ')} `);
  const v = Array<number>(1024).fill(0);
  for (let n = 2; n <= 5; n++) for (let i = 0; i <= text.length - n; i++) {
    let hash = 2166136261;
    for (const c of text.slice(i, i + n)) hash = Math.imul(hash ^ c.codePointAt(0)!, 16777619) >>> 0;
    v[hash % 1024]++;
  }
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map(x => x / norm);
}
// Optional artifact lets offline evaluation compare a candidate without replacing production weights.
export function generateLocalQuery(question: string, artifact = model) {
  const w = artifact.weights;
  if ('featureVersion' in artifact && artifact.featureVersion === 'english-scaffold-v1') {
    question = question.replace(/\b(?:i|you|me|my|would|like|information|about|could|please|tell|explain|for|help|find)\b/giu, ' ');
  }
  let hidden = linear(w['encoder.weight'], w['encoder.bias'], questionFeatures(question)).map(Math.tanh);
  let token = 0; let confidence = 1; const words: string[] = [];
  for (let step = 0; step < 10; step++) {
    const a = linear(w['rnn.weight_ih'], w['rnn.bias_ih'], w['embed.weight'][token]);
    const b = linear(w['rnn.weight_hh'], w['rnn.bias_hh'], hidden);
    hidden = a.map((v,i) => Math.tanh(v + b[i]));
    const logits = linear(w['out.weight'], w['out.bias'], hidden);
    token = logits.indexOf(Math.max(...logits));
    const denominator = logits.reduce((sum,x) => sum + Math.exp(x - logits[token]), 0);
    confidence = Math.min(confidence, 1 / denominator);
    if (token === 1) return { query: words.join(' '), confidence, complete: true };
    words.push(artifact.vocab[token]);
  }
  return { query: '', confidence: 0, complete: false };
}
