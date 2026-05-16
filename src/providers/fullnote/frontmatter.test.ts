import { modifyFrontmatterString, newFrontmatter } from './frontmatter';

describe('full note frontmatter task serialization', () => {
  it('writes single tasks with the task type alias', () => {
    expect(
      newFrontmatter({
        title: 'Task event',
        type: 'single',
        allDay: true,
        date: '2026-05-16',
        completed: false
      })
    ).toContain('type: task');
  });

  it('adds the task type alias when completion is added later', () => {
    const page = ['---', 'title: Existing event', 'date: 2026-05-16', '---', ''].join('\n');

    expect(modifyFrontmatterString(page, { completed: false })).toContain('type: task');
  });

  it('removes the task type alias when completion is removed', () => {
    const page = [
      '---',
      'title: Existing task',
      'type: task',
      'date: 2026-05-16',
      'completed: false',
      '---',
      ''
    ].join('\n');

    const updated = modifyFrontmatterString(page, { completed: null });

    expect(updated).not.toContain('type: task');
    expect(updated).not.toContain('completed: false');
  });
});
