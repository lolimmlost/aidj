# Security Policy

## Supported versions
AIDJ is a self-hosted app developed on `main`. Security fixes land on `main`; please run a recent build.

## Reporting a vulnerability
Please **do not open a public issue** for security problems.

Report privately via **GitHub → Security → [Report a vulnerability](https://github.com/lolimmlost/aidj/security/advisories/new)**.
Include what's affected, how to reproduce it, and the impact you expect. You'll get an acknowledgement as soon
as possible; fixes are coordinated in the private advisory and credited if you'd like.

## Scope notes
- AIDJ connects to services you run (Navidrome, Lidarr, MeTube, LLM providers). Misconfiguration of those services
  is out of scope, but anything in AIDJ that leaks their credentials or bypasses authentication is in scope.
- Dependency advisories are tracked by CI (`npm audit` gate with a documented allowlist) and Dependabot.
