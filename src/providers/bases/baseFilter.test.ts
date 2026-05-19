import { CachedMetadata, TFile, TFolder } from 'obsidian';
import { combineBaseFilters, evaluateBaseFilter, evaluateBaseFilterString } from './baseFilter';

function makeFolder(path: string): TFolder {
  const parts = path.split('/').filter(Boolean);
  let parent: TFolder | null = null;
  let folder = new TFolder();

  for (const part of parts) {
    folder = new TFolder();
    folder.name = part;
    folder.parent = parent;
    parent = folder;
  }

  return folder;
}

function makeFile(path: string): TFile {
  const lastSlash = path.lastIndexOf('/');
  const file = new TFile();
  file.name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  file.parent = lastSlash >= 0 ? makeFolder(path.slice(0, lastSlash)) : null;
  return file;
}

function makeContext(frontmatter: Record<string, unknown> = {}, extra: Partial<CachedMetadata> = {}) {
  return {
    getFileCache: (_file: TFile): CachedMetadata => ({ frontmatter, ...extra })
  };
}

describe('baseFilter', () => {
  it('matches file.inFolder against folder boundaries', () => {
    const rootCore = makeFile('20-core/item.md');
    const nestedCore = makeFile('20-core/deeper/item.md');
    const gearCore = makeFile('00-gear/20-core/item.md');
    const context = makeContext();

    expect(evaluateBaseFilterString('file.inFolder("20-core")', rootCore, context)).toBe(true);
    expect(evaluateBaseFilterString('file.inFolder("20-core")', nestedCore, context)).toBe(true);
    expect(evaluateBaseFilterString('file.inFolder("20-core")', gearCore, context)).toBe(false);
  });

  it('supports exact file.folder comparisons from Bases filters', () => {
    const rootCore = makeFile('20-core/item.md');
    const gearCore = makeFile('00-gear/20-core/item.md');
    const context = makeContext();

    expect(evaluateBaseFilterString('file.folder == "20-core"', rootCore, context)).toBe(true);
    expect(evaluateBaseFilterString('file.folder == "20-core"', gearCore, context)).toBe(false);
  });

  it('combines global filters with the first view filter', () => {
    expect(
      combineBaseFilters({
        filters: 'file.ext == "md"',
        views: [{ filters: 'file.folder == "20-core"' }]
      })
    ).toEqual({ and: ['file.ext == "md"', 'file.folder == "20-core"'] });
  });

  it('combines global filters with the selected view filter', () => {
    expect(
      combineBaseFilters(
        {
          filters: 'file.ext == "md"',
          views: [
            { name: 'Core', filters: 'file.folder == "20-core"' },
            { name: 'Gear', filters: 'file.folder == "00-gear"' }
          ]
        },
        1
      )
    ).toEqual({ and: ['file.ext == "md"', 'file.folder == "00-gear"'] });
  });

  it('supports common Bases property functions', () => {
    const file = makeFile('20-core/item.md');
    const context = makeContext({ status: 'active', tags: ['work', 'focus'], empty: '' });

    expect(evaluateBaseFilterString('file.hasProperty("status")', file, context)).toBe(true);
    expect(evaluateBaseFilterString('empty.isEmpty()', file, context)).toBe(true);
    expect(evaluateBaseFilterString('tags.contains("focus")', file, context)).toBe(true);
    expect(evaluateBaseFilterString('tags.containsAny("focus", "home")', file, context)).toBe(
      true
    );
    expect(evaluateBaseFilterString('tags.containsAll("work", "focus")', file, context)).toBe(
      true
    );
    expect(evaluateBaseFilterString('note["status"] == "active"', file, context)).toBe(true);
  });

  it('evaluates a real Base view filter with containsAny and negation', () => {
    const file = makeFile('20-core/recipes/item.md');
    const context = makeContext({
      type: ['recipe'],
      status: ['3-todo']
    });

    expect(
      evaluateBaseFilter(
        {
          and: [
            'type.containsAny("recipe")',
            {
              and: [
                '!status.isEmpty()',
                '!status.containsAny("4-toorganize", "4-toscrape")'
              ]
            }
          ]
        },
        file,
        context
      )
    ).toBe(true);
  });

  it('supports multi-tag and link filters', () => {
    const file = makeFile('20-core/item.md');
    const context = makeContext(
      {},
      {
        tags: [
          {
            tag: '#project',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 8, offset: 8 }
            }
          }
        ],
        links: [
          {
            link: 'Projects/Home',
            original: '[[Projects/Home]]',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 17, offset: 17 }
            }
          }
        ]
      }
    );

    expect(evaluateBaseFilterString('file.hasTag("area", "project")', file, context)).toBe(true);
    expect(evaluateBaseFilterString('file.tags.contains("project")', file, context)).toBe(true);
    expect(evaluateBaseFilterString('file.hasLink("Projects/Home")', file, context)).toBe(true);
    expect(evaluateBaseFilterString('file.links.contains("Projects/Home")', file, context)).toBe(
      true
    );
  });

  it('supports Bases link literals in containsAny filters', () => {
    const file = makeFile('20-core/home/item.md');

    expect(
      evaluateBaseFilterString(
        'subprojects.containsAny(link("&&סובב בית"))',
        file,
        makeContext({
          subprojects: ['[[&&סובב בית]]']
        })
      )
    ).toBe(true);

    expect(
      evaluateBaseFilterString(
        'subprojects.containsAny(link("Projects/Home"))',
        file,
        makeContext({
          subprojects: [{ link: 'Projects/Home' }]
        })
      )
    ).toBe(true);
  });

  it('does not pass files for unsupported filter strings', () => {
    expect(evaluateBaseFilterString('unsupported.filter()', makeFile('20-core/item.md'), makeContext())).toBe(
      false
    );
  });
});
