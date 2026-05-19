import { TFile } from 'obsidian';
import { BaseFullProvider } from './BaseFullProvider';

function makeProvider(
  frontmatter: Record<string, unknown>,
  dateProperty = 'date'
): BaseFullProvider {
  return new BaseFullProvider(
    {
      type: 'basefull',
      name: 'Test Base',
      color: '#3788d8',
      basePath: 'test.base',
      createDirectory: 'inbox',
      dateProperty
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

  it('uses the configured date property without falling back to legacy date fields', () => {
    const provider = makeProvider(
      {
        title: 'Current Date',
        date: '2026-05-18',
        scheduled: '2026-05-20'
      },
      'scheduled'
    );

    const result = (
      provider as unknown as {
        getEventFromFile(file: TFile): [{ date: string }, unknown] | null;
      }
    ).getEventFromFile(makeFile('current.md'));

    expect(result?.[0]).toMatchObject({
      date: '2026-05-20'
    });
  });

  it('treats files without the configured date property as undated', () => {
    const provider = makeProvider(
      {
        title: 'Old Date',
        date: '2026-05-18'
      },
      'scheduled'
    );

    const result = (
      provider as unknown as {
        getEventFromFile(file: TFile): [{ date: string }, unknown] | null;
      }
    ).getEventFromFile(makeFile('old.md'));

    expect(result).toBeNull();
  });

  it('uses Obsidian CLI base query paths when available', async () => {
    const returnedFile = makeFile('one.md');
    const execFile = jest.fn(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => callback(null, 'one.md\r\nmissing.md\r\n', '')
    );
    const originalRequire = (window as unknown as { require?: unknown }).require;
    (window as unknown as { require?: unknown }).require = jest.fn(() => ({ execFile }));

    const provider = new BaseFullProvider(
      {
        type: 'basefull',
        name: 'Test Base',
        color: '#3788d8',
        basePath: 'menus.base',
        baseViewIndex: 1,
        createDirectory: 'inbox',
        dateProperty: 'date'
      },
      {
        app: {
          vault: {
            adapter: {
              getBasePath: () => 'C:/vault'
            }
          }
        }
      } as unknown as ConstructorParameters<typeof BaseFullProvider>[1],
      {
        getFileByPath: (path: string) => (path === 'one.md' ? returnedFile : null)
      } as unknown as ConstructorParameters<typeof BaseFullProvider>[2]
    );

    const result = await (
      provider as unknown as {
        getCliFilteredFiles(baseData: {
          views: { name: string }[];
        }): Promise<TFile[] | null>;
      }
    ).getCliFilteredFiles({ views: [{ name: 'weekly menu' }, { name: 'סובב בית' }] });

    expect(result).toEqual([returnedFile]);
    expect(execFile).toHaveBeenCalledWith(
      'obsidian',
      ['base:query', 'path=menus.base', 'view=סובב בית', 'format=paths'],
      { cwd: 'C:/vault', windowsHide: true, timeout: 10000 },
      expect.any(Function)
    );

    (window as unknown as { require?: unknown }).require = originalRequire;
  });
});
