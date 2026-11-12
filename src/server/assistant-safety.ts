export function unsafeInstructions(text: string) {
  return /(?:show|reveal|print|expose)[\s\S]{0,30}(?:secret|password|token)|ignore[\s\S]{0,40}(?:instruction|previous)|игнориру[\s\S]{0,40}(?:инструкц|правил)|нұсқау[\s\S]{0,40}(?:елеме|ұмыт)|құпия[\s\S]{0,30}(?:көрсет|аш|бер)|system\s*prompt|системн\p{L}*\s+(?:промпт|инструкц)|api[_ -]?key|(?:покажи|раскрой|выведи)[\s\S]{0,30}(?:секрет|парол|токен)|<\/?(?:system|script)>/iu.test(text);
}
