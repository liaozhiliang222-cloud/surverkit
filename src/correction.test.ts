import { describe, expect, it } from 'vitest';
import { applySuggestions, parseTranscript, suggestCorrections } from './correction';

describe('parseTranscript', () => {
  it('识别常见说话人并移除 SRT 时间轴', () => {
    const result = parseTranscript('1\n00:00:01,000 --> 00:00:03,000\n研究员：请介绍一下。\n\n2\n00:00:04,000 --> 00:00:08,000\n受访者：嗯，我因该会购买');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('研究员');
    expect(result[1].role).toBe('受访者');
  });
});

describe('transcript correction', () => {
  it('保守模式只提出低风险修正', () => {
    const suggestions = suggestCorrections('我因该购买', '保守');
    expect(suggestions.some((item) => item.original === '因该' && item.replacement === '应该')).toBe(true);
    expect(suggestions.every((item) => item.risk === '低')).toBe(true);
  });

  it('标准模式可清理语气词并统一项目术语', () => {
    const suggestions = suggestCorrections('嗯，我用研究盒子', '标准', [{ id: '1', projectId: 'p', term: 'ResearchBox', aliases: ['研究盒子'], createdAt: '' }]);
    const corrected = applySuggestions('嗯，我用研究盒子', suggestions);
    expect(corrected).toContain('ResearchBox');
    expect(corrected).not.toContain('嗯');
  });

  it('接受纯语气词删除后不会暗中恢复原文', () => {
    const suggestions = suggestCorrections('嗯，', '标准');
    expect(applySuggestions('嗯，', suggestions)).toBe('');
  });
});
