# Security Policy

## Supported Versions

We release security updates for the current production version of CP Build Command Center.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, please contact the maintainers directly:

- **Email:** Report to the repository owner or your organization's security contact
- **GitHub:** Send a private message to [@cp-build-dev](https://github.com/cp-build-dev)

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 48 hours and will keep you updated on our progress.

## Security Measures

This repository uses:

- **Dependabot** — Automated dependency vulnerability alerts and updates
- **Secret scanning** — Detects committed secrets
- **Push protection** — Blocks pushes containing known secret patterns
- **CodeQL** — Static analysis for security and quality issues

Please ensure you never commit secrets, API keys, or credentials. Use environment variables and `.env` files (which are gitignored).
