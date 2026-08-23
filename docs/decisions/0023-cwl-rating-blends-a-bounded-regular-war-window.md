---
status: accepted
date: 2026-08-23
deciders: [Nick]
type: design
supersedes: 0001-cwl-evidence-and-bonus-priority
---
# The CWL rating blends this CWL's attack completion with a bounded regular-war window

## Context

0001 kept regular-war history as a separate gauge, deliberately outside the
rating: it was to inform review, promotion and larger-roster selection through
evidence filters rather than be "silently folded into CWL lineup
recommendations". That was right for a fifteen-man war, where the lineup is
roughly the set of people who answer an availability check.

It is wrong for a thirty-man war. The lineup is then larger than the set of
members who respond, so the leader has to place people they have no availability
signal for, and regular-war participation is the best evidence of activity that
exists for them. 0001's separation left the rating with nothing to say about
exactly those members.

Two defects made the same point from the other direction ([#89](https://github.com/nswanger/clash-of-clans/issues/89)):

- The regular-war figures the rating view carried were **all-time and unbounded**,
  so every season showed the figures as of whenever the query ran, and the
  signal decayed as the clan aged.
- A member who appeared in **no** war had no row at all, because the source view
  inner-joined war participation. A non-participant was indistinguishable from a
  member the collector knew nothing about — and a member who sits out every war
  the clan fights is precisely who a CWL lineup decision needs to see.

A third, found while fixing those: `cwl_member_reliability` is NULL until a war
day ends, so **before this change no member had a rating at all while the leader
was building the season's first lineup**, and the recommender's rating tie-break
was inert exactly when it was needed.

## Decision

The rating is `0.6 × this CWL's attack completion + 0.4 × a regular-war score`.
When CWL attacks have not been assigned yet, the regular-war score **is** the
rating; when the window observed no wars, CWL completion is; when neither
exists, there is no rating. Which of the three produced a number travels with it
as a basis, and both surfaces that show a rating show the two terms and state
the weights once.

The regular-war score is `0.7 × opportunity + 0.3 × quality`, where opportunity
is attacks made against **every attack the window's wars offered** — sat-out
wars included — and quality is stars against the maximum for the attacks
actually made. Attendance dominates because consistency across wars is what is
being measured; quality separates members who attended equally.

The window runs from the previous CWL's last war end to this season's earliest
preparation start, falling back to thirty days and to the season's month start
respectively, with each bound reporting which branch produced it. CWL and
regular wars cannot overlap, so "any war since the last CWL" is structurally
free of double-counting.

**Counting sat-out wars against a member is fair because regular-war entry is
self-selected.** The game auto-places signed-up members, so appearing in a war
is at the member's own request and the war's `team_size` is not a gate they do
not control. CWL has no equivalent signup, which is the asymmetry this whole
application exists to compensate for — and it is why CWL reliability keeps a
denominator of *assigned* attacks while the regular-war score does not.

A member is measured only against wars whose preparation began at least two days
after collection first observed them, which is the clan-change war lockout — but
only when that first observation is later than the clan's own first roster pull.
Otherwise it is collection's start date, not a join date, and the buffer would
delete the war history of every member who predates collection.

`war_preference` is not read. Members do not reliably maintain it.

## Consequences

Absence of evidence is still never a penalty: an empty window falls back rather
than scoring zero. A **real** zero is different and is now visible, which is the
point. The first season this can serve is the one after regular-war collection
began; earlier seasons correctly report a coverage gap.

Persisted recommendation inputs move to `schemaVersion` 4, and the rating
tie-break splits into two reason codes so a recommendation ranked on regular-war
history alone reads back as such.

## What 0001 decided that still holds

- The rating is a 0–100 scale and remains **advisory**: a human makes every
  lineup, promotion, demotion and benching decision, and availability decides
  who needs replacing before any rating ranks a substitute.
- Bonus priority is separate from rotation. All members stay visible, members at
  or above eight CWL stars rank first by total CWL stars, and stars per war plus
  wars participated give supporting context. The rotation recommendation may
  still use eight stars as a reason to rotate someone out.
- Regular-war member history is collected from **current-war observations
  only**. The official war log is not a member-level backfill source, so a
  missing observation is limited evidence rather than an inference.
