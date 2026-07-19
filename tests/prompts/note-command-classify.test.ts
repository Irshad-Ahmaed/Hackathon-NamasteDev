import { describe, test, expect } from 'vitest';
import { classifyCommand } from '../../lib/notes/generation-service';

describe('note command grounding classification', () => {
  test('transform commands do not require retrieval', () => {
    expect(classifyCommand('highlight all formulas in blue')).toBe('transform');
    expect(classifyCommand('reorder the sections')).toBe('transform');
    expect(classifyCommand('shorten the overview')).toBe('transform');
    expect(classifyCommand('remove the common mistakes section')).toBe('transform');
    expect(classifyCommand('make headings bold')).toBe('transform');
  });

  test('knowledge commands require chapter-scoped retrieval', () => {
    expect(classifyCommand('add one NCERT-backed worked example')).toBe('knowledge');
    expect(classifyCommand('define congruent triangles')).toBe('knowledge');
    expect(classifyCommand('derive the area formula')).toBe('knowledge');
    expect(classifyCommand('add an exam question')).toBe('knowledge');
    expect(classifyCommand('explain the theorem in more detail')).toBe('knowledge');
  });
});
