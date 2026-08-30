# Security policy

## Reporting a vulnerability

Please report privately, through
[GitHub Security Advisories](https://github.com/karellopez/Demiurge/security/advisories/new).
Do not open a public issue for a security problem.

You should get an acknowledgement within a few days. If the report is valid, you
will be credited in the advisory and in the release notes unless you would rather
not be.

## What is in scope

Demiurge is a static site. It has no server, no login, no database, no analytics
and no telemetry, which removes most of the usual attack surface. What remains is
worth reporting:

- **Cross-site scripting** through a seed phrase, a URL parameter, a
  player-chosen discovery name, or an imported save file. Everything in that list
  is attacker-controllable text that ends up on screen.
- **Prototype pollution or unsafe deserialisation** in the save/load path.
  Worlds are exportable as JSON and meant to be shared, so a malicious save file
  is a realistic vector.
- **Supply-chain problems** — a compromised or typosquatted dependency, an
  unpinned action in a workflow, a build step that could execute untrusted code.
- **Shader or WebGL issues** that could hang or crash the browser process rather
  than merely rendering incorrectly.
- **Asset fetching** — a path traversal or checksum bypass in
  `scripts/fetch-assets.ts` that could write outside the assets directory.

## What is not in scope

- A rendering artefact, a wrong colour, or a physics inaccuracy. Those are bugs;
  please file them as issues.
- Poor performance on a machine below the Potato tier.
- Anything that requires the reporter to already control the machine running the
  browser.
- Denial of service against the player's own tab by their own input.

## Practices

- Dependencies are updated weekly by Dependabot, grouped by toolchain.
- `npm audit --omit=dev` runs as a quality gate; zero high or critical
  vulnerabilities is a build requirement.
- CodeQL runs on every push, every pull request, and weekly.
- Production dependencies are checked against a licence allowlist.
- Downloaded assets are checksum-verified where upstream is stable enough to pin,
  and a failed verification writes nothing.
