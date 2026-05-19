import { TFile } from 'obsidian';
import { BaseFullProvider } from './BaseFullProvider';

function makeProvider(frontmatter: Record<string, unknown>): BaseFullProvider {
  return new BaseFullProvider(
    {
      type: 'basefull',
      name: 'Test Base',
      color: '#3788d8',
      basePath: 'test.base',
      createDirectory: 'inbox',
      dateProperty: 'date'
    },
    {
      app: {
        metadataCache: {
          getFileCache: (_file: TFile) => ({ frontmatter })
        }
      }
    } as unknown as ConstructorParameters<typeof BaseFullProvider>[1],
    {} as ConstructorParameters<typeof BaseFullProvider>[2]
  );
}

function makeFile(name: string): TFile {
  const file = new TFile();
  file.name = name;
  return file;
}

describe('BaseFullProvider', () => {
  it('ignores non-calendar Base properties when building dated events', () => {
    const provider = makeProvider({
      type: 'recipe',
      date: '2026-05-18',
      status: ['3-todo'],
      url: null,
      aliases: ['Recipe Alias']
    });

    const result = (
      provider as unknown as {
        getEventFromFile(file: TFile): [{ title: string; type: string; date: string; allDay: boolean }, unknown] | null;
      }
    ).getEventFromFile(makeFile('recipe.md'));

    expect(result?.[0]).toMatchObject({
      title: 'recipe',
      type: 'single',
      date: '2026-05-18',
      allDay: true
    });
  });
});
