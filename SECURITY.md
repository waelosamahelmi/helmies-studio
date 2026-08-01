# Security Policy

## Reporting a vulnerability

Report security vulnerabilities **privately** by emailing **wael@helmies.fi**.

**Do not open a public GitHub issue for a security report.** Public issues are for bugs
and feature requests only — filing a vulnerability there discloses it to everyone
before it can be fixed. If you've already opened one by mistake, email us and we'll
help get it removed.

Please include as much of the following as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce (or a proof of concept)
- The affected URL, endpoint, or file/line if known
- Any relevant logs, request/response samples, or screenshots (redact secrets/tokens)

## What to expect

- **Acknowledgment target: within 48 hours** of your report.
- We'll follow up with our assessment and, where relevant, an expected timeline for a
  fix once we've confirmed the issue.
- We ask that you give us a reasonable window to fix a confirmed issue before any
  public disclosure.

## Supported versions

Helmies Studio is a single continuously-deployed application. The only supported
version is **whatever is currently running on `main` in production**
(https://studio.helmies.fi). There are no maintained older release branches.

## Scope

In scope: the application at studio.helmies.fi and this repository's source code
(API routes, auth, credit/billing logic, provider integrations, admin panel).

Out of scope: automated vulnerability scanners' low-signal output without a
demonstrated impact, social engineering against staff, and physical access attacks.

## Threat model

For the actor/threat inventory this application defends against — current
controls (named by file), residual risk, and which phase closes each
residual — see [`docs/security/threat-model.md`](docs/security/threat-model.md).
