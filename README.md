# @knighted/develop

Compiler-as-a-Service (at the edge of your browser) with `@knighted/jsx` and `@knighted/css`.

> ⚠️ Early project status: this package is pre-`1.0.0` and still actively evolving.

## What it is

`@knighted/develop` is a lightweight dev app that lets you:

- write component code in the browser
- switch render mode between DOM and React
- switch style mode between native CSS, CSS Modules, Less, and Sass
- preview results immediately

## Local development

```bash
npm install
npm run dev
```

Then open the URL printed by the dev server (it should open `src/index.html`).

## End-to-end tests

Install Playwright browsers once before your first local run:

```bash
npx playwright install
```

If your environment needs system dependencies too (for example Linux CI-like containers), use:

```bash
npx playwright install --with-deps
```

Run local Playwright tests (Chromium):

```bash
npm run test:e2e
```

Run locally with headed browser:

```bash
npm run test:e2e:headed
```

CI runs Playwright on Chromium and WebKit.

## Notes

- This is currently a development playground, not a stable product.
- Expect breaking changes while APIs and UX are still being shaped.
- Documentation will expand closer to `1.0.0`.

## License

MIT
