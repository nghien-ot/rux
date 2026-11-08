# Domain Docs

This repository uses a single-context layout.

## Before exploring

- Read `GLOSSARY.md` at the repository root.
- Read ADRs in `docs/adr/` relevant to the area being explored.

If these files do not exist, proceed silently. Do not flag their absence
or suggest creating them upfront. The domain-modeling skill creates them
lazily when terms or decisions are resolved.

## File structure

- `GLOSSARY.md`: shared domain vocabulary.
- `docs/adr/`: architecture decision records.

## Use the glossary's vocabulary

Use defined domain terms in issue titles, proposals, hypotheses, and tests.
Avoid synonyms the glossary explicitly rejects.

If a needed concept is missing, reconsider whether it belongs to this
domain or note the gap for domain-modeling.

## Flag ADR conflicts

Explicitly identify proposals that contradict an existing ADR.
Name the ADR and explain why its decision should be reconsidered.
