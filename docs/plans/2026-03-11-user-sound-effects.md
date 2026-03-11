# User Sound Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user-facing sound effects with a shared toggle, persistent preference, and inbox new-mail playback.

**Architecture:** Introduce a client-side sound provider under the existing user app provider tree. The provider owns preference persistence, reduced-motion-aware defaults, and typed playback helpers for `click`, `notice`, and alternating `message` sounds. User pages bind explicit high-priority actions to `notice`, generic actions to `click`, and inbox polling/refresh logic triggers message sounds only when newly fetched messages appear.

**Tech Stack:** Next.js App Router, React client context, MDUI user UI, Bun unit tests.

---

### Task 1: Sound preference helpers

**Files:**
- Create: `src/lib/sound/user-sound.ts`
- Test: `tests/unit/user-sound.test.ts`

**Step 1: Write the failing test**

Test reduced-motion defaulting, persisted value parsing, and alternating message sound selection.

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/user-sound.test.ts`

**Step 3: Write minimal implementation**

Export helper functions for default enabled state, storage parsing, and next message sound path selection.

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/user-sound.test.ts`

### Task 2: Shared user sound provider

**Files:**
- Create: `src/lib/sound/user-sound-provider.tsx`
- Modify: `src/components/layout/MduiProvider.tsx`
- Modify: `src/lib/i18n/schema.ts`
- Modify: `src/lib/i18n/translations/en-US.ts`
- Modify: `src/lib/i18n/translations/zh-CN.ts`
- Modify: `src/lib/i18n/translations/zh-TW.ts`

**Steps:**
- Add context with `enabled`, `toggle`, `playClick`, `playNotice`, `playMessage`
- Persist preference in `localStorage`
- Default to off when `prefers-reduced-motion: reduce`
- Wrap user pages with the provider
- Add user-visible copy for sound labels/status

### Task 3: Button and menu bindings

**Files:**
- Modify: `src/app/(user)/HomeClient.tsx`
- Modify: `src/app/(user)/claim/ClaimClient.tsx`
- Modify: `src/app/(user)/recover/RecoverClient.tsx`
- Modify: `src/app/(user)/inbox/page.tsx`

**Steps:**
- Bind required homepage actions to `notice`
- Bind claim/recover primary actions to `notice`
- Bind other clickable controls and menus to `click`
- Add sound toggle button beside the homepage theme control
- Add inbox settings sound toggle styled like `Load external`

### Task 4: Inbox message playback

**Files:**
- Modify: `src/app/(user)/inbox/page.tsx`

**Steps:**
- Track previously seen message ids
- Play alternating message sounds when a newly fetched message appears
- Avoid firing on initial hydrate and non-new list refreshes

### Task 5: Verification

**Files:**
- Test: `tests/unit/user-sound.test.ts`

**Steps:**
- Run `bun test tests/unit/user-sound.test.ts`
- Run `bun run typecheck`

