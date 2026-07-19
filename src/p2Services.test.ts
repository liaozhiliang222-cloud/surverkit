import { describe, expect, it } from 'vitest';
import { can } from './p2Services';

describe('workspace permissions', () => {
  it('访客只读，研究员可编辑和导出', () => {
    expect(can('访客', 'write')).toBe(false);
    expect(can('访客', 'read')).toBe(true);
    expect(can('研究员', 'write')).toBe(true);
    expect(can('研究员', 'export')).toBe(true);
  });
  it('仅管理员与所有者可管理成员', () => {
    expect(can('管理员', 'manageMembers')).toBe(true);
    expect(can('所有者', 'manageMembers')).toBe(true);
    expect(can('研究员', 'manageMembers')).toBe(false);
  });
});
