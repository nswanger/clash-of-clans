# App surfaces and the CWL phase

Status: accepted

The app collapses from six routes to three: **CWL**, **Members**, and **Admin**. `#/overview`, `#/season` and `#/dashboard` are deleted rather than conformed to the design system, and `#/access` widens into Admin. This settles the question [#25](https://github.com/nswanger/clash-of-clans/issues/25) deferred out of the Clan Muster migration — that map decided how a surface moves onto the system and explicitly refused to decide which surfaces deserve to exist.

The organising rule is one route per question a leader actually asks. `#/overview` failed it by duplication: it rendered four metrics under labels identical to the members roster's summary strip, computed from the same source, plus a callout linking to the roster. Two pages showing the same numbers, one of which existed only to link to the other. `#/season` failed it by having no content — an inline stub saying verified group standings are unavailable, which remains true because only `opponent_tag` is collected and there is no league-group standings data anywhere in the schema. `#/dashboard` failed it as a grab bag: its clan roster and daily summary overlap the other two routes, and its unique content is machine recommendations, the approve/override control, and collection health. The recommendation and lineup-history content is judged not worth a surface at all, because it describes only the current CWL cycle and reviewing it in detail buys nothing. Collection health is real and moves to Admin, which is where the operational answer to "is this data trustworthy" belongs alongside who can see it.

## The CWL route is conditional on the season's phase

The missing surface is post-CWL review: who receives bonus medals, who moves up or down in role, and who needs a follow-up conversation. It is season-scoped and member-ranked, so it fits neither existing surface — the lineup workspace is day-scoped and editing, the roster is year-round and per-member.

It does not get its own route. The review surface and the lineup workspace are **exactly complementary in time**: the workspace is inert between cycles, and review is impossible during one, because bonus decisions need final stars. They can never both want to be on screen, which is the case where one route with two phases is correct rather than clever. The alternative — a permanent fourth tab — would be empty two weeks in three, which is the same failure `#/overview` and `#/season` are being deleted for.

This also fixes a live defect. `loadCurrentCwlLineupWorkspace` selects the current day by querying for a war in `preparation` or `inWar` and falling back to day 1, so between cycles the default route of the app presents a stale, editable lineup for a war that has already finished.

**The phase is an explicit control that defaults to the current phase, not a hidden conditional.** It is the segmented strip one level above the day strip, reusing the same component. Three reasons the phase is visible rather than inferred silently: a route that changes meaning on hidden state cannot be linked or reasoned about; a leader mid-season needs to reach the previous season's bonus decisions; and wars end at a fixed time while collection is periodic, so there is a window in which CWL is genuinely over and the app still believes it is live. Under a hidden conditional that window strands the leader on a stale lineup with no way out. Under a control it is one tap. The phase travels as a query parameter, which `routeForPath` already tolerates.

**The marker** is the war states already loaded, with a date guard. The season is active when any day is `preparation` or `inWar`; in review when none is and at least one is `warEnded`; and in review regardless of state when `season_id` names an earlier month than today. The date guard is not redundant — a missed collection run at the end of a season leaves the final day never marked ended, and without it the app would sit in the lineup phase indefinitely.

## Regular-war data stays in Members

Regular-war evidence gets no surface of its own. It is an input to the CWL and role decisions rather than a subject: [ADR 0001](0001-cwl-evidence-and-bonus-priority.md) already establishes it as a separate gauge that informs review, selection, follow-up and promotion, and that signup owns opportunity so absence is not a penalty. A page with no decision of its own is what `#/overview` was.

Two of the three regular-war views are already covered by the roster. `regular_war_clan_history` is redundant: it reports a bare count of observed wars, while `regular_war_member_activity_window` returns `wars_observed` scoped to the same period the roster is asking about, which is the version that can honestly be read as "joined 3 of the 5 wars in this window."

The one genuine gap is `regular_war_member_history`, the war-by-war record behind that ratio. It is drill-down evidence about a single member, so if it earns a place it is a section inside the member detail panel, not a route — and it should wait until a real need appears rather than be built because the view exists.

## A resting phase, deferred

After review has been available for some time, the CWL route should rest rather than continue presenting a finished season as though action were outstanding. The marker is days since the final war's `end_time`. It becomes the default phase position while lineup and review stay reachable, so it costs no new mechanism.

This is an **empty state, not a loading state**. The loading pattern has no copy and uses skeletons, which assert that data is arriving; nothing is arriving here for weeks, so borrowing it would be a lie about the wait. It is also not the happy-path banner [#19](https://github.com/nswanger/clash-of-clans/issues/19) prohibits: that rule bans announcing that everything is fine, whereas a resting state is the honest rendering of nothing being here, in the same spirit as loading rendering nothing at all below 250ms. It must read as absence rather than reassurance.

The component inventory currently lists an empty-state illustration under what is deliberately not a component, on the grounds that inventing one would guess ahead of a surface that needs it. This is that surface, so the resting phase is the first real justification for an empty state in the system. It is deferred to its own wave because it depends on nothing else and wants a design decision about what absence looks like, rather than a port from an existing prototype.
