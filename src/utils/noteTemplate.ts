import { TFile } from 'obsidian';
import type { ObsidianInterface } from '../ObsidianAdapter';
import {
  newFrontmatter,
  modifyFrontmatterString,
  replaceFrontmatter
} from '../providers/fullnote/frontmatter';

export async function buildNoteFromTemplate(
  app: ObsidianInterface,
  templatePath: string | undefined,
  frontmatter: Record<string, unknown>
): Promise<string> {
  const trimmedPath = templatePath?.trim();
  if (!trimmedPath) {
    return replaceFrontmatter('', newFrontmatter(frontmatter));
  }

  const templateFile = app.getAbstractFileByPath(trimmedPath);
  if (!(templateFile instanceof TFile)) {
    console.warn(`Full Calendar: Template file "${trimmedPath}" was not found.`);
    return replaceFrontmatter('', newFrontmatter(frontmatter));
  }

  const template = await app.read(templateFile);
  return modifyFrontmatterString(template, frontmatter);
}
