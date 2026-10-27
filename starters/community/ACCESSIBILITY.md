# Accessibility

<!-- For a project with a user interface: a website, an app. Replace the contact, and keep only promises the project keeps. -->

Everyone should be able to use this project, including people who use a screen reader, a keyboard only, or a phone. We aim to meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) at level AA. Each part of the interface should:

- be built from semantic HTML first, with ARIA only where HTML has no equivalent;
- work with a keyboard alone, with focus that stays visible;
- label every form field and announce its errors;
- mirror its layout correctly from right to left in Arabic, using logical properties (`margin-inline-start`, not `margin-left`) rather than left and right;
- have loading, error and empty states that assistive technology can read.

## Reporting a barrier

Open an issue with the [bug form](../../issues/new/choose). Say what you tried to do, the page, its language, and the assistive technology and browser you used. Known barriers carry the [`accessibility`](../../labels/accessibility) label. If you can't use GitHub, email <!-- contact address -->.

## Checking your own change

Before you open a pull request that changes the interface:

- use it with the keyboard alone;
- use it with a screen reader (VoiceOver, TalkBack or NVDA), in Arabic and in French or English;
- look at it at phone width (360 px) and on a desktop, in both directions.

Say what you checked in the pull request, with screenshots in Arabic and in French or English.
