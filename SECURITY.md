# Security Policy

Lekhini is an Electron application that draws on top of other apps,
captures screenshots, and persists user preferences locally. We take
security issues in any of these surfaces seriously.

## Supported versions

We support the latest minor release on the `1.x` line with security
fixes. Older versions may be updated at the maintainers' discretion.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅                 |
| < 1.0   | ❌ (pre-release)   |

## Reporting a vulnerability

**Please do not report security issues via public GitHub issues,
discussions, or pull requests.** Public reports give attackers a head
start before a fix can ship.

Instead, use **GitHub's private vulnerability reporting**:

1. Go to <https://github.com/opensourcebharat/lekhini/security/advisories/new>
2. Fill in the report — include reproduction steps, affected versions,
   and (if known) the impact.
3. A maintainer will be notified privately and will respond.

If you cannot use GitHub private reporting for any reason, open an
empty issue titled `security: request private contact` and a
maintainer will reach out off-channel. Do not include vulnerability
details in that issue.

## What to include in a report

A good report makes triage fast and reduces the time-to-fix:

- Lekhini version (shown in **Settings → About**) and OS.
- A clear description of the issue and the security impact (what an
  attacker can do).
- Step-by-step reproduction, including any sample files or payloads.
- Whether the issue is already public anywhere.
- Your suggested fix, if you have one (optional).

## Response targets

These are targets, not guarantees — Lekhini is maintained by
volunteers under [Open Source Bharat](https://opensourcebharat.org).

| Severity | First response | Fix released |
| --- | --- | --- |
| Critical (RCE, privilege escalation, silent data exfiltration) | 3 business days | 14 days |
| High (sandbox escape, capture of unrelated app content without consent) | 5 business days | 30 days |
| Medium / Low | 10 business days | next regular release |

## Disclosure

Once a fix is available, we will:

1. Publish a patched release (`x.y.z+1`) and note the fix in
   [CHANGELOG.md](./CHANGELOG.md) under a `### Security` heading.
2. Publish a GitHub security advisory crediting the reporter (unless
   the reporter prefers to remain anonymous).
3. Request a CVE where appropriate.

We follow **coordinated disclosure**: please give us a reasonable
window to ship a fix before publishing details. 90 days from initial
report is a sensible default; we will agree on an explicit date with
you during triage.

## Scope

In scope:

- The Lekhini Electron app (main + renderer) shipped from this
  repository.
- Build scripts and release artifacts published under
  [opensourcebharat/lekhini](https://github.com/opensourcebharat/lekhini).

Out of scope:

- Bugs in upstream dependencies (Electron, Chromium, Node) that
  Lekhini does not exacerbate — please report those upstream.
- Issues that require a pre-compromised machine (e.g. an attacker
  who already has filesystem write access to a user's home directory).
- Social-engineering attacks against maintainers.

## Acknowledgements

Researchers who report valid issues will be credited in the advisory
and the changelog unless they request otherwise. Thank you for
helping keep Lekhini users safe.
