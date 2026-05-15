# TODO

Pending work for this fork. Other Claude Code sessions can pick any unchecked item — each is written self-contained with the file paths needed to start cold.

Format: `- [ ]` = pending, `- [x]` = done. Group order is roughly priority; within a group, top → bottom.

---

## Attribution / branding cleanup (high priority — these are user-facing)

- [ ] **Update the changelog / "What's New" announcement.** Currently displays the upstream FCR's changelog history, which is wrong for this fork. The user wants this replaced so the in-app changelog reflects *this* fork's history (or is emptied / replaced with a single "Forked from FCR vX.Y.Z" entry).
  - Files: `src/ui/settings/changelogs/changelogData.ts`, `src/ui/settings/changelogs/Changelog.tsx`, `src/ui/settings/changelogs/renderWhatsNew.ts`
  - Decision needed: replace with empty changelog, replace with a fork-notice entry, or remove the "What's New" UI entirely.

- [ ] **Fix "Report a bug" / "Discussions" links** in the settings UI. They currently point at the upstream's GitHub issue tracker — anyone clicking them would file a bug at YouFoundJK's repo instead of this fork.
  - File: `src/ui/settings/sections/calendars/renderFooter.ts` (lines 21 and 28)
  - Replace with this fork's URL (`https://github.com/EmilyPinhasi/cortex-full-calendar/issues/new`) or remove the links entirely.

- [ ] **Upstream GitHub URLs in NLP / i18n payload loaders.** These fetch language packs and NLP data from the upstream's GitHub. They still work (we're forked from there) but they tie us to upstream's hosting.
  - Files: `src/features/nlp/loader.ts:49`, `src/features/i18n/i18n.ts:70`
  - Decide: leave as-is (works), bundle the payloads locally, or update URLs to point at this fork once we host them.

- [ ] **`PLUGIN_SLUG = 'full-calendar-plugin'`** in `src/types/index.ts:20`. Used as the hover-link source id. Internal-only, low impact, but inconsistent with the fork name.

---

## Feature strip (medium priority — covered in original plan)

Original strip plan was deferred so we could get a working build out. Now that releases work, strip can happen incrementally — each item as its own commit/release. After each strip, run `npm run compile && npm run build` to catch breakage.

**Providers to remove** (registered in `src/providers/ProviderRegistry.ts:68`):
- [ ] `ics` — remove `this.register('ical', ...)`, delete `src/providers/ics/`, prune `ical`, `ical.js`, `@fullcalendar/icalendar` from `package.json`.
- [ ] `caldav` — delete `src/providers/caldav/`, prune `tsdav` dep.
- [ ] `outlook` — delete BOTH `src/providers/outlook/` AND `src/provider/outlook/` (yes, the codebase has both spellings).
- [ ] `tasks` — most invasive: also requires removing `TasksBacklogManager` static import + field + constructor call + `refreshBacklogViews()` + `syncBacklogManagerLifecycle()` from `src/providers/ProviderRegistry.ts`, plus call site in `src/main.ts:134`.
- [ ] `tasknotes` — delete `src/providers/tasknotes/`.

**Features to remove** (under `src/features/`):
- [ ] `activitywatch` — delete folder, remove `#setupActivityWatchAutoSync`/`#clearActivityWatchAutoSync`/`#runActivityWatchAutoSyncTick` methods + the `full-calendar-sync-activitywatch` command from `src/main.ts`. Also remove `activityWatch` block from `src/types/settings.ts` defaults.
- [ ] `milestones` — delete folder, remove `PluginState.setShowMilestones(...)` wiring in `src/main.ts:115`.
- [ ] `workspaces` — delete folder; check `src/main.ts` for any active-workspace references.
- [ ] `timezone` — delete folder, remove `manageTimezone(this)` call in `src/main.ts:136`.

**Chrono Analyser:**
- [ ] Delete `src/chrono_analyser/` and the lazy `import('./chrono_analyser/AnalysisView')` block in `src/main.ts:213`, plus the mobile-disabled command at `src/main.ts:286`. Prune `plotly.js` and `@types/plotly.js` from `package.json`.

**Keep** (do NOT strip): providers `fullnote`, `dailynote`, `google`, `bases`; features `recur_events`, `notifications`, `category`, `nlp`, `statusbar`, `navigation`, `i18n` (i18n stays — full strip would touch every UI string).

---

## Build / release hygiene (low priority — nice to have)

- [ ] **Stop committing `main.js` + `styles.css` to the branch.** Releases are now the source of truth, so the committed copies are redundant and noisy in diffs. To clean up: `git rm --cached main.js styles.css`, add both back to `.gitignore`, commit. (Only do this *after* confirming releases work end-to-end and BRAT installs successfully — they're currently a fallback.)

- [ ] **Restrict release workflow trigger** so README-only or `.md`-only pushes don't create new releases. In `.github/workflows/release.yml`, add a `paths:` filter to the `push` trigger covering `src/**`, `manifest.json`, `package.json`, `esbuild.config.mjs`, `styles.css`. Saves noisy release versions on docs edits.

- [ ] **Add a Release Notes generator.** Currently the workflow uses `--notes "Automated release from ${{ github.sha }}"` which is uninformative. Could be improved to auto-generate notes from the commit messages since the previous release.

---

## How to use this file

- When picking up work, mark the item `- [ ]` → `- [x]` in the same PR/commit that completes it.
- For new pending work surfaced during a session, append it to the relevant section.
- Keep entries self-contained — include file paths and decision points so a future cold-start Claude session can act without re-asking the human.
