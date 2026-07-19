import type { CorrectionLevel, CorrectionSuggestion, Segment, SpeakerRole, Term } from './types';

const fillers = ['嗯嗯', '呃', '额', '嗯', '那个', '然后呢', '就是说', '怎么说呢'];
const typoRules: Array<[RegExp, string, string]> = [
  [/因该/g, '应该', '常见同音错字'], [/在说/g, '再说', '常见同音错字'], [/帐号/g, '账号', '规范用字'],
  [/登陆/g, '登录', '规范用字'], [/做为/g, '作为', '规范用字'], [/必竟/g, '毕竟', '常见错别字']
];

export function suggestCorrections(text: string, level: CorrectionLevel, terms: Term[] = []): CorrectionSuggestion[] {
  const suggestions: CorrectionSuggestion[] = [];
  const add = (category: CorrectionSuggestion['category'], original: string, replacement: string, reason: string, risk: CorrectionSuggestion['risk']) => {
    if (!original || original === replacement || suggestions.some((item) => item.original === original && item.replacement === replacement)) return;
    suggestions.push({ id: crypto.randomUUID(), category, original, replacement, reason, risk, status: '待处理' });
  };
  typoRules.forEach(([pattern, replacement, reason]) => {
    const match = text.match(pattern)?.[0];
    if (match) add('错别字', match, replacement, reason, '低');
  });
  terms.forEach((term) => term.aliases.forEach((alias) => {
    if (alias && text.includes(alias)) add('术语', alias, term.term, `统一为项目术语“${term.term}”`, '低');
  }));
  const spaces = text.match(/[ \t]{2,}/)?.[0];
  if (spaces) add('格式', spaces, ' ', '合并多余空格', '低');
  if (text && !/[。！？!?…]$/.test(text.trim())) add('标点', text.trim(), `${text.trim()}。`, '补充句末标点', '低');
  if (level !== '保守') {
    fillers.forEach((filler) => {
      if (text.includes(filler)) add('语气词', filler, '', '清理不影响语义的口语填充词', '中');
    });
    const repeated = text.match(/([^，。！？\s]{1,8})[，,]?\s*\1/);
    if (repeated) add('重复', repeated[0], repeated[1], '合并连续重复表达', '中');
  }
  return suggestions;
}

export function applySuggestion(text: string, suggestion: CorrectionSuggestion): string {
  if (suggestion.category === '标点' && suggestion.original === text.trim()) return suggestion.replacement;
  return text.replace(suggestion.original, suggestion.replacement).replace(/\s+([，。！？])/g, '$1').replace(/，{2,}/g, '，');
}

export function applySuggestions(text: string, suggestions: CorrectionSuggestion[], lowRiskOnly = false): string {
  const result = suggestions.filter((item) => item.status !== '已拒绝' && (!lowRiskOnly || item.risk === '低')).reduce(applySuggestion, text);
  const normalize = (value: string) => value
    .replace(/^[，,；;：:\s]+/, '')
    .replace(/[，,]+[。！？!?]/g, '。')
    .replace(/([。！？!?])\1+/g, '$1')
    .replace(/\s+([，。！？])/g, '$1')
    .trim();
  const normalized = normalize(result);
  // 接受删除建议后必须忠实执行；若只剩标点则视为空片段，不能暗中恢复原文。
  if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(normalized)) return '';
  return normalized;
}

export function parseTranscript(raw: string): Array<{ role: SpeakerRole; speakerId: string; start: number; end: number; text: string }> {
  const cleaned = raw.replace(/^WEBVTT[^\n]*\n/i, '').replace(/^\d+\s*$/gm, '').replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3}\s*-->.*$/gm, '');
  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let cursor = 0;
  return lines.flatMap((line) => line.split(/(?<=[。！？!?])\s+/)).map((line) => {
    const match = line.match(/^(研究员|访员|主持人|受访者|嘉宾|专家|客户|SPEAKER[_ ]?\d+)\s*[:：]\s*(.*)$/i);
    const label = match?.[1] || '';
    const text = (match?.[2] || line).trim();
    const role: SpeakerRole = /研究员|访员/.test(label) ? '研究员' : /主持人/.test(label) ? '主持人' : /专家|嘉宾/.test(label) ? '专家' : /客户/.test(label) ? '客户' : '受访者';
    const duration = Math.max(3, Math.min(20, text.length / 2));
    const start = cursor;
    cursor += duration + 0.5;
    return { role, speakerId: label.match(/SPEAKER/i) ? label.replace(' ', '_').toUpperCase() : role === '研究员' ? 'SPEAKER_00' : 'SPEAKER_01', start, end: start + duration, text };
  }).filter((item) => item.text);
}

export function segmentCurrentText(segment: Segment) {
  return segment.correctedText ?? segment.text;
}
