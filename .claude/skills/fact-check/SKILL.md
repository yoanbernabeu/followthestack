---
name: fact-check
description: Re-verify Follow the Stack facts (data/facts/*.yml) and ownership relations against their sources, then correct, downgrade or delete them. Use when the maintainer asks to check, audit, re-verify or fact-check facts, a subject, a batch of new facts, or before a release.
---

# Fact-check

Errors here expose the maintainer to defamation claims. Be strict and conservative: a weaker, correct fact beats a strong, wrong one.

## Scope

The files given as arguments, or all facts changed since the last release (`git diff --name-only <last-tag> -- data/facts`), or all of `data/facts` if asked. For large sets, split into batches of about 30 and run them in parallel with subagents, each with this checklist.

## Checklist for each fact

1. **Open every source** (WebFetch; if blocked, curl, archive.org or a syndicated copy). Dead link: replace it with a working one you opened, or remove it.
2. **Date and precision**: does the source give that exact day? Otherwise use `datePrecision: month` or `year`.
3. **Claims and figures**: every element of `summary` must be in a source. Remove or soften anything that goes further ("rehired" vs "announced his return", "more than" vs "nearly").
4. **Attribution**: who said or did it (a CEO vs the company; a journalist's phrase vs the subject's words).
5. **Quote**: `quote.text` must be verbatim in the original language. Translations or paraphrases go in `summary`, never in `quote`.
6. **Grievance fit**: each grievance must match its definition in AGENTS.md (note the rules on `authoritarian-alignment`, `far-right-funding`, `war-crimes-support`). Remove grievances that don't fit; delete the fact if none fits.
7. **Status and response**: disputed facts are `contested`; the subject's denial or explanation goes in `response`, quoted from a source.
8. **Source quality**: a single weak source needs a reliable second source, or the fact is marked contested or deleted.

For relations (`data/entities`): check that `led-by`, `founded-by`, `board-member` are current (add `until` for people who left), and that parent and owner links are correct, especially recent acquisitions. These links decide which facts reach which products.

## Output

Edit files in place (valid YAML, quoted dates), run `npm run check`, and give the maintainer a log: one line per file, ✅ confirmed / ✏️ corrected (what) / 🗑️ deleted (why) / ⚠️ needs a decision (why). Do not commit or push without approval.
