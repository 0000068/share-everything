---
inclusion: always
---

# Git Release Rules

- Main release commits use the exact version-only message `vMAJOR.MINOR`, for example `v2.3`.
- The package version uses matching semver with patch zero, for example `v2.3` maps to `2.3.0`.
- Keep release commits linear and chronological on `main`; the newest version should sit directly above the previous version.
- When packaging a release, avoid leaving intermediate `fix:`, `docs:`, or `chore:` commits above the version commit unless the user explicitly asks for split commits.
