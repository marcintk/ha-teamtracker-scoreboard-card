# Security Policy

## Supported Versions

Only the latest published release is supported. Security fixes are released as a new version, not
backported.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, use GitHub's private reporting:

1. Go to the [Security tab][security-tab] of this repository.
2. Click **Report a vulnerability**.
3. Include steps to reproduce, affected version(s), and potential impact.

You should receive an acknowledgement within a few days. If the report is accepted, a fix will be
released and credited in the release notes; if declined, you'll get an explanation why.

## Scope

This project is a Home Assistant Lovelace card (frontend JavaScript bundled to `dist/card.js`). It
renders data from `sensor.*` entities provided by the
[ha-teamtracker](https://github.com/vasqued2/ha-teamtracker) integration and does not itself make
network requests, handle credentials, or execute server-side code. Relevant reports include
(non-exhaustively) XSS/HTML-injection via sensor attribute rendering, supply-chain issues in the
build/release pipeline, and dependency vulnerabilities.

[security-tab]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/security
