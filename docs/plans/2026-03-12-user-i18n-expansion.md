# User I18n Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add complete French, German, Spanish, and Japanese support to the user-facing FlashInbox experience.

**Architecture:** Extend the existing locale registry and translation-file pattern without refactoring the i18n system. Reuse the current `UserTranslations` schema, add four full locale files, then update locale detection, menu rendering, and metadata generation to consume the expanded registry consistently.

**Tech Stack:** Next.js App Router, TypeScript, bun test, existing custom i18n layer in `src/lib/i18n`

---

### Task 1: Lock locale registration with tests

**Files:**
- Test: `tests/unit/i18n.test.ts`

**Step 1: Write the failing test**
- Assert `locales` contains `fr-FR`, `de-DE`, `es-ES`, `ja-JP`
- Assert `localeNames` exposes autonyms for those locales
- Assert `detectLocale()` maps matching browser languages
- Assert `getTranslations()` exposes translated language labels for the new locales

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/i18n.test.ts`
Expected: FAIL because the locale registry still only supports `en-US`, `zh-CN`, `zh-TW`

### Task 2: Extend the locale registry

**Files:**
- Modify: `src/lib/i18n/index.ts`
- Modify: `src/lib/i18n/schema.ts`

**Step 1: Add new locale identifiers**
- Expand `Locale`
- Expand `locales`
- Expand `localeNames`
- Register four new translation modules

**Step 2: Extend detection**
- Map `fr* -> fr-FR`
- Map `de* -> de-DE`
- Map `es* -> es-ES`
- Map `ja* -> ja-JP`

**Step 3: Extend schema**
- Add `frFR`, `deDE`, `esES`, `jaJP` under `language`

### Task 3: Add complete translation files

**Files:**
- Create: `src/lib/i18n/translations/fr-FR.ts`
- Create: `src/lib/i18n/translations/de-DE.ts`
- Create: `src/lib/i18n/translations/es-ES.ts`
- Create: `src/lib/i18n/translations/ja-JP.ts`

**Step 1: Copy the existing translation object shape**
- Keep key parity with `en-US`

**Step 2: Provide full localized strings**
- Translate all user-facing strings
- Preserve product names and required footer brand rules

### Task 4: Update locale-driven UI rendering

**Files:**
- Modify: `src/app/(user)/HomeClient.tsx`
- Modify: `src/app/(user)/inbox/page.tsx`

**Step 1: Replace hardcoded 3-locale menu rendering**
- Render labels from a shared locale-to-label mapping helper or switch

**Step 2: Keep existing sound/layout behavior intact**
- Only touch language label rendering for this task

### Task 5: Update metadata and SEO locale handling

**Files:**
- Modify: `src/lib/seo/seo-copy.ts`
- Modify: `src/lib/seo/request-locale.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(user)/page.tsx`

**Step 1: Extend request locale mapping**
- Accept French, German, Spanish, and Japanese language tags

**Step 2: Extend SEO copy and OG locale mapping**
- Provide translated home/claim/recover metadata

**Step 3: Expand alternates**
- Emit all supported languages in metadata alternates and OG alternate locales

### Task 6: Update agent guidance

**Files:**
- Modify: `AGENTS.md`

**Step 1: Document expanded supported locales**
- Add the new supported user-site locales to the project guidance

### Task 7: Verify

**Files:**
- Test: `tests/unit/i18n.test.ts`

**Step 1: Run focused tests**

Run: `bun test tests/unit/i18n.test.ts`
Expected: PASS

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS
