---
status: accepted
date: 2026-08-29
deciders: [Nick]
type: design
supersedes:
---
# A list shows at most ten rows; everything past that is reached by narrowing

## Context
The pre-season roll call ([#96](https://github.com/nswanger/clash-of-clans/issues/96)) is the first surface in the app whose list is bounded by the size of the clan rather than by the size of a war. At fifty members it rendered fifty rows, which is a roster dump that grows with the clan, and filtering it moved every control beneath it while the query was still being typed. Two fixes were tried and both were wrong on their own: an inner scroller put a second scrollbar inside a page that already had one, and a box sized from whatever the current filter matched still resized on every keystroke.

The alternatives considered were pagination, an inner scroll region, and per-surface judgement about how long is too long. The lineup workspace had already answered a version of this question for its bench without generalising it — [#20](https://github.com/nswanger/clash-of-clans/issues/20) replaced a four-control filter row with a single search on the grounds that "ranking does the work sorting used to" — and the members roster will meet the same question at fifty members.

## Decision
**A list renders at most `--cm-list-max-rows` rows — ten. Everything past it is reached by narrowing the list, never by rendering the rest.**

Narrowing today means `cm-search`. It may mean a pager on a later surface where the rows have an order worth walking through rather than a target to find; that is a component decision for whichever surface needs one, and it does not reopen this rule. The number is round on purpose: the principle is what is fixed, and ten is a screen's worth of 44px rows on a phone.

Three properties follow, and they are the reason for a shared number rather than a per-surface guess:

- **A box sized from it never resizes.** Ten rows tall is ten rows tall whether the query matches one name or thirty, so nothing beneath a filter moves while the filter is being typed into.
- **It never needs an inner scrollbar.** The rows always fit, so the page owns the only scrollbar on screen.
- **It does not grow with the data.** A clan of eighty reads exactly like a clan of thirty.

**A list showing less than everything must say so**, in the form the bench already uses: `N of M shown`. A truncated list that looks complete is worse than a long one.

The rule has two halves that must not disagree: `--cm-list-max-rows` in `design/tokens.css` for sizing, and `LIST_MAX_ROWS` in the React system layer for slicing.

## Consequences
- The roll call's default view is the members who answered, capped at ten, with the rest of the clan behind the search. A month where more than ten answer is read by narrowing, which Nick accepted explicitly when this was settled.
- Surfaces whose lists are bounded by war size — the lineup at 15 or 30 — are unaffected in practice but are not exempt; a 30-player CWL lineup is the first place this rule will be felt, and that is a real decision to make when it is.
- `cm-empty` is what fills the box when a filter matches nothing, and it has to distinguish an empty list from an empty result, because the two look identical.
- Pagination remains uninvented. It is named here as the expected second form of narrowing so that a surface reaching for one is applying this rule rather than working around it.
