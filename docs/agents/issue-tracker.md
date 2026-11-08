# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `nghien-ot/rux`.
Use the `gh` CLI from this repository.

## Conventions

- Before the first issue creation in a session, verify the target with
  `gh repo view --json nameWithOwner`. It must be `nghien-ot/rux`.
- Create: `gh issue create --title "..." --body-file <file>`.
  Write multiline bodies to a temporary file with actual newlines.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add appropriate label and state filters.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the explanation as a comment, then run `gh issue close <number>`.
  Post comments separately even when the issue is already closed.
- Publish to the issue tracker: create a GitHub issue.
- Fetch a relevant ticket: read its GitHub issue.

Use native GitHub sub-issues and issue dependencies when available.
For API operations, use numeric database IDs rather than issue numbers.
If unavailable, put `Part of #<parent>` and `Blocked by: #<number>` at the
top of child issue bodies, and list children in the parent's task list.
An issue is unblocked only when every blocker is closed.

File issues only in this project's repository.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child: a sub-issue of the map, labelled `wayfinder:<type>`, where type is
  `research`, `prototype`, `grilling`, or `task`.
- Frontier: the first open child in map order with no open blockers
  and no assignee.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the answer, close the child, and append a summary
  and link to the map's Decisions-so-far.
