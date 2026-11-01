## What and why

<!-- What changes, and why does it add value? Link the issue or the rights audit. -->

Closes #

## Checks

<!-- Paste the commands you ran and their result. A red check blocks the merge. -->

- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `bun run build` (when `apps/web` or a published package changed)
- [ ] Python ingestion tests (`pytest services/ingestion`) when that service changed

## Repository rules

- [ ] The branch was created from `develop` and the PR targets `develop`.
- [ ] Commits follow Conventional Commits with a scope (`feat(api): …`).
- [ ] No secret, token, connection string or `.env*` file is included.
- [ ] Every user-visible string is added in **both** locales in `apps/web/src/lib/i18n.tsx`.
- [ ] The change is inside the requested scope; adjacent problems are reported, not fixed here.

## Corpus rights

<!-- Only for a change that ingests, seeds or documents corpus content. -->

- [ ] Each added or updated document has an explicit `rights` value in its manifest.
- [ ] No `quotation-only` or `to-confirm` payload is ingested or stored in full text.
- [ ] A restricted document already in Atlas is listed by `bun run kb:purge` (dry run) and handled separately.

## Accessibility checklist

Review [ACCESSIBILITY.md](/ACCESSIBILITY.md). Tick the items that apply and write **N/A** for the rest (for example documentation-only changes).

### Content changes

- [ ] Headings follow a logical hierarchy and do not skip levels.
- [ ] Link text is unique and descriptive.
- [ ] Images have meaningful alternative text or are marked decorative.
- [ ] Complex images and diagrams have a nearby text alternative.
- [ ] Semantic lists and tables are used, with column and row headers.
- [ ] Meaning is not conveyed by colour, position or styling alone.
- [ ] Embedded video has captions and a transcript.

### UI and code changes

- [ ] Keyboard navigation works end to end, with a visible focus indicator and no traps.
- [ ] Forms have associated labels and programmatically linked error messages.
- [ ] State changes are announced where needed (ARIA live regions, `expanded`, `selected`).
- [ ] Reduced motion is respected when animation is added (`prefers-reduced-motion`).
- [ ] Screen reader behaviour was checked at least once (VoiceOver, NVDA, JAWS or TalkBack).
- [ ] Native HTML elements are preferred; ARIA is used only when needed.
- [ ] Touch targets are at least 24×24 CSS pixels with adequate spacing.
- [ ] An automated tool (axe DevTools or GitHub Accessibility Scanner) was run on new or changed UI.

## Notes

<!-- Known limitations, follow-ups, or accessibility items intentionally left for another PR. -->
