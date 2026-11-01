# Accessibility statement

Accessibility is a core priority for this project. The policy sandbox is a
console used by public institutions, so everyone — including people with
disabilities and people using assistive technology — must be able to read,
navigate, and contribute to it.

This document explains the project's accessibility commitment, what contributors
are expected to check, and how to report a barrier. It follows the structure
recommended by the [Open Source Accessibility Toolkit](https://github.com/open-source-accessibility/accessibility-toolkit/blob/main/ACCESSIBILITY.md)
and the [Open Source Guide on accessibility statements](https://opensource.guide/accessibility-best-practices-for-your-project/#start-with-an-accessibility-statement).

## Priorities

- **Accessibility target:** we work toward [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22).
  This target guides our work but is **not** a claim of verified conformance: no
  external evaluation has been completed.
- **Keyboard support** — every interactive element is reachable and operable
  with a keyboard alone, with a visible focus indicator and a logical tab order.
- **Screen reader support** — pages use semantic HTML and a logical heading
  hierarchy so they can be navigated with VoiceOver, NVDA, JAWS, TalkBack and
  similar tools.
- **Readable content** — plain language where possible, descriptive link text,
  sufficient colour contrast, real lists and tables, and meaningful alternative
  text.
- **Bilingual content** — the console ships in English and French; the active
  language is declared in the document so assistive technology pronounces it
  correctly.
- **Reduced motion** — animations respect `prefers-reduced-motion`.
- **Themes** — light and dark themes both meet contrast requirements.

## Contributor expectations

If you contribute code, documentation or content, follow these guardrails so the
project does not regress:

### Testing

- For UI changes, run an automated accessibility tool such as
  [axe DevTools](https://www.deque.com/axe/devtools/) or the
  [GitHub Accessibility Scanner](https://github.com/github/accessibility-scanner).
- Do at least one keyboard-only pass on any change involving interactive UI:
  - tab order is logical and reaches every control;
  - the focus indicator is always visible and has enough contrast;
  - all actions work with Tab/Shift+Tab, Enter, Space and the expected arrow
    keys;
  - no keyboard trap (modals, menus, popovers and editors can be entered and
    left).
- Spot-check screen reader behaviour for new components or significant content
  changes: headings and landmarks, accessible names that match the action,
  exposed state (`expanded`, `selected`, toggles), announced validation errors
  and asynchronous status via ARIA live regions where needed.

### Documentation and content

- Use a logical heading hierarchy; do not skip levels.
- Use real list and table elements, with column and row headers.
- Use unique, descriptive link text (no "click here" / "read more").
- Provide meaningful alternative text for images; follow the
  [W3C alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
  and give complex diagrams a nearby text alternative.
- Provide captions and a transcript for videos.
- Never use colour as the only way to convey meaning.
- Check that content reflows at 200 % zoom and at narrow widths.

### Continuous integration

- A pull request may be blocked if it introduces accessibility violations
  detected by the project's checks.
- Resolve flagged issues, or explain in the PR why a violation cannot be
  addressed here and open a follow-up issue.

## Reporting an accessibility issue

Barriers are expertise, not complaints. If something does not work for you:

1. **Open an issue** with the [accessibility issue template](https://github.com/rouftom/sarkiai-policy-sandbox-meta/issues/new?template=accessibility.yml).
2. Include, when you are comfortable doing so:
   - what you were trying to do and what went wrong;
   - the page URL or screen name;
   - steps to reproduce;
   - your operating system, browser and assistive technology, with versions;
   - a screenshot or recording, if you want to share one;
   - a severity, using the scale below.

You never have to disclose a diagnosis or other personal information.

### Severity

- **Critical:** prevents you from completing a core task (for example, you
  cannot read a document or submit a form at all).
- **Serious:** significant difficulty, but a workaround exists.
- **Moderate:** annoyance or an inconsistent experience.
- **Minor:** minimal impact on usability.

Maintainers may adjust the severity during triage.

### How we respond

- We acknowledge the report respectfully and without requiring personal
  disclosure.
- We explain next steps, known limitations and dependencies.
- We provide a workaround where possible while a fix is in progress.
- We update the issue when the status or expected date changes, and may ask you
  to confirm that a fix resolves the barrier before closing it.

### Resolution expectations

After triage, each issue is assigned a severity, an owner and a target date.
Targets start when the issue is opened:

- **Critical:** 30 days.
- **Serious:** 60 days.
- **Moderate:** 90 days.
- **Minor:** 90 days.

If a target cannot be met, the issue explains the delay, any workaround and a
revised date.

## Ownership and maintenance

Accessibility is owned by the project maintainers. They triage reports, track
accessibility work and known barriers, escalate unresolved risks, and keep this
statement current.

## Supported environments

The console is a Next.js web application, tested on:

- **Desktop:** the latest two versions of Chrome, Edge, Firefox and Safari.
- **Mobile:** the latest two versions of Mobile Safari and Chrome on Android.
- **Assistive technology:** VoiceOver (macOS / iOS), NVDA (Windows), JAWS
  (Windows), TalkBack (Android).

Partial support:

- Some third-party embeds (maps, external media) are supported on a best-effort
  basis.
- Legacy PDFs in the corpus may lack an accessible text layer; the OCR path in
  the Gazette screen is the intended workaround.

## Known limitations

- Some older screens and documents may not yet meet every guideline (for
  example missing alternative text or non-descriptive link text); they are being
  updated as they are touched.
- Some complex charts expose a textual summary and a table view rather than a
  fully equivalent non-visual representation.
- Automated checks catch only part of the problem; keyboard and screen reader
  passes remain required.

If you find a barrier not listed here, please open an accessibility issue.

## Feedback

Accessibility is an ongoing practice, not a one-time fix. Suggestions about this
statement or the project's practices are welcome as an issue or a pull request.
