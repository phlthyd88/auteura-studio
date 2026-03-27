# Contributing to Auteura

We welcome contributions to Auteura! Whether it's fixing bugs, adding features, or improving documentation, your help is appreciated.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/auteura-studio.git
   cd auteura-studio
   ```
3. **Create a branch** for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** and ensure tests pass:
   ```bash
   npm run test:ci
   ```
5. **Commit and push** your changes:
   ```bash
   git commit -m "Brief description of your changes"
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** against the `main` branch of the original repository.

## Development Workflow

- Use **npm run dev** for local development.
- Ensure all new code has **TypeScript types** and follows existing patterns.
- Add **Vitest unit tests** for new service or controller logic.
- Add **Playwright E2E tests** for new critical user flows.
- Run **npm run lint** and **npm run typecheck** before submitting.
- Track reliability and release work through the repo ticket system in [docs/tracking/README.md](docs/tracking/README.md).
- Add or update the corresponding ticket in [docs/tracking/release-stability-board.md](docs/tracking/release-stability-board.md) before starting high-risk remediation work.

## Refactor PR Requirements

- Controller and shell extractions must preserve the public contracts documented in [docs/architecture/controller-facades.md](docs/architecture/controller-facades.md) unless an approved ticket explicitly changes them.
- Refactor PRs must list the protected flows they touch using [docs/tracking/refactor-guardrails.md](docs/tracking/refactor-guardrails.md).
- If a refactor changes controller behavior, add or update characterization coverage before relying on E2E alone.
- Keep runtime state single-sourced; do not introduce loosely coupled booleans or duplicated status fields that can drift.

## Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/phlthyd88/auteura-studio/issues). Provide as much detail as possible, including steps to reproduce for bugs.

---

*Thank you for helping make Auteura better!*
