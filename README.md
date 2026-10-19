# Follow the Stack

**Know who you're funding.** Declare the tools, platforms and libraries your team uses, and see which companies, investors and public figures are behind them, with their documented statements and actions on racism, antisemitism, LGBTphobia, anti-immigration, support for the far right, surveillance and more.

- Facts only: every entry carries the exact quote and its sources.
- A grievance qualifies a documented fact, never a person.
- Organisations and public figures only. No private individuals.
- Static site, no backend, no tracker. Your stack never leaves your browser.

## Contributing

Open an [issue](../../issues/new/choose): report a fact, add a product, or request a correction. Sources are mandatory. Every contribution is reviewed by a human before it is published. See [AGENTS.md](AGENTS.md) for the editorial rules.

## Development

```bash
npm install
npm run dev     # http://localhost:4321
npm run check   # types + data schema
npm run build   # static site in dist/
```

Pushing to `main` runs the checks, builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

Maintainers using Claude Code have two project skills: `/process-issue` and `/fact-check` (see `CLAUDE.md`).

## A note on GitHub

GitHub is owned by Microsoft, which appears in this database. We host here because this is where developers are. We know.

## License

Code: MIT. Data (`data/`): CC BY-SA 4.0.
