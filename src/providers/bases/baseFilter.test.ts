import { CachedMetadata, TFile, TFolder } from 'obsidian';
import { combineBaseFilters, evaluateBaseFilterString } from './baseFilter';

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

function makeContext(frontmatter: Record<string, unknown> = {}) {
  return {
    getFileCache: (_file: TFile): CachedMetadata => ({ frontmatter })
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

  it('does not pass files for unsupported filter strings', () => {
    expect(evaluateBaseFilterString('unsupported.filter()', makeFile('20-core/item.md'), makeContext())).toBe(
      false
    );
  });
});
