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

## Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/phlthyd88/auteura-studio/issues). Provide as much detail as possible, including steps to reproduce for bugs.

---

*Thank you for helping make Auteura better!*
