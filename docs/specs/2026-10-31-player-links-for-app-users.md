# App users carry linked player tags, and Admin flags a leader who left the clan

Spec for [#134](https://github.com/nswanger/clash-of-clans/issues/134), 2026-10-31. Nick settled the four open questions of the
first draft the same day: storing the link is approved, people pick their own
account at sign-up, an unlinked person is a guest, and links survive revoked
access. Each decision below says what it rules out.

## Problem

An app user is a Discord identity (ADR 0005) and nothing more. `profiles` holds
`id` and a `display_name` copied from Discord metadata. `user_roles` is the
whole of access. Player tags live only in clan data (`cwl_members`,
`member_daily_snapshots`, `member_roster_overview`), and no table connects the
two. That has two consequences:

1. **No remapping.** An admin cannot record or correct which in-game account a
   person is, because there is nothing to record it in.
2. **Departures are invisible to access.** A leader who leaves the clan keeps
   access until an admin happens to notice and picks Revoke access. The roster
   already knows the departure (`member_roster_overview.is_current_member`,
   `departure_observed_on`), but Admin cannot join it to a person.

## Intended behaviour

- After signing in, a person with no link and no recorded guest choice is asked
  which clan member they are. They pick themselves from the current roster, or
  choose **Not in the clan** and continue as a guest. They cannot reach the
  app's routes until they answer.
- An admin can link a player tag to anyone in People, add an alt, unlink a tag,
  or remap a person by unlinking the wrong tag and linking the right one.
- A person's row in People shows their linked player names. It carries a
  `guest` mark when nothing is linked, and a `left clan` mark when every linked
  account is gone from the latest roster observation.
- Every claim, link and unlink is an audit event and appears in the access log.
  The log tells a self-claim apart from an admin's link.
- Nothing revokes access automatically. The mark is the prompt, and Revoke
  access stays the admin's act.

## Decisions

### A link table, not a column on `profiles`

`profile_player_links (user_id, player_tag, linked_at, linked_by)`, primary key
`(user_id, player_tag)`, with `unique (player_tag)` so one in-game account
belongs to at most one app user. `user_id` references `profiles(id) on delete
cascade`. `linked_by` equals `user_id` for a self-claim.

A `profiles.player_tag` column was rejected because leaders commonly run alt
accounts, and an alt in the clan should keep a person's row unflagged after
their main leaves.

The link carries no `clan_tag`. A player tag is global in Clash, and the
departure check reads whichever clan's latest roster the tag last appeared in,
so a feeder clan needs no schema change.

### People claim their own account; claims are trusted, not verified

`claim_player(player_tag text)` links a tag to the caller. It requires access
(`is_leader()`), a caller with no links, and a tag that is a current member and
not held by anyone who has access. A person who is already linked cannot claim
a second account. Alts and corrections go through an admin.

Nothing proves the caller owns the tag. Someone can claim to be a member they
are not, and that is accepted. The link records who is who; it gates nothing,
and the data behind it is not private. The audit event type
(`player_claimed`, distinct from `player_linked`) keeps a self-claim
distinguishable, so a wrong claim can be traced and remapped. Ownership proof
through `POST /v1/players/{playerTag}/verifytoken` stays out of scope (below).

The claim happens after redemption, not inside `redeem_invitation`. A person
cannot read the roster until redemption grants them access, and the existing
OAuth callback redemption (`redeemCallbackInvitation`) stays untouched.

### A guest is a person with access and no linked player

Guests are allowed. Who is one: the operator, or a helper with no account in
the clan, or anyone who picks Not in the clan. It also covers the case where
the roster has no observation yet, so the picker is empty and a newcomer would
otherwise be stuck.

`guest` is a mark, not a role. Guests keep exactly the access their role gives.
A guest role was rejected for now: it would mean changing `is_leader()` and
every policy that reads it, and the goal is to keep track of who is who, not
to restrict what a guest can do. If guests should later see less, that is a
role change made then, on its own terms.

The guest choice is stored as `profiles.player_link_declined_at timestamptz`,
set by `decline_player_link()`. Without it a guest would be asked again at every
sign-in. Any link clears it. `redeem_invitation` also clears it, so a guest who
returns on a new invitation is asked once more.

The prompt's rule is the stored state ("no link and no guest choice"), not
"just redeemed an invitation". So existing leaders whom an admin has not linked
are asked at their next sign-in. That is intended: Nick links the leaders he
knows before release, and anyone he missed identifies themselves.

### Admins link, unlink and remap through admin-only RPCs

`link_player(target_user_id uuid, player_tag text)` and
`unlink_player(target_user_id uuid, player_tag text)`, both `security definer`,
both raising `42501` unless `has_app_role('admin')`, following
`202607200013_access_management_hardening.sql`. No table grants to
`authenticated`. RLS allows admins to select every row, and a user to select
their own rows, which the session needs in order to decide whether to prompt.

An admin's link to a tag that someone with access holds raises an error.
Moving a tag between two people who both have access is two explicit acts, and
it leaves two audit events.

An admin may link their own account. The no-self-lockout rule exists for revoke
and demote, and linking cannot lock anyone out.

### Links survive revoked access, and a held tag never blocks a new person

`revoke_user_access` deletes `user_roles` only. The profile and its links stay,
so the link table is the current state and the audit log is the history.

Rejoining with the same Discord account is fine. Supabase keeps the same
`auth.users` row for the same Discord identity, so a re-invited person comes
back with their profile and links. They are not prompted, because they are
already linked. If they return on a different game account, their old link
shows `left clan` and an admin remaps it.

A lingering link must not block someone else. Revoked people are not in People
(the snapshot lists only people with roles), so an admin could not even see
the link to remove it. So when a claim or an admin link names a tag held only
by a person without access, the tag moves. The move is one transaction that
writes `player_unlinked` for the old holder, then the new event. The constraint
stays `unique (player_tag)`, and the move is the RPCs' logic.

### Linking picks from the roster, not from a typed tag

The claim screen and the admin panel both list current members
(`member_roster_overview where is_current_member`), searchable by name and
showing town hall. Members linked to someone with access are left out. Typing a
tag was rejected: tags are easy to mistype, and a wrong tag silently produces a
false `left clan` mark, which is evidence the app made up.

Consequence: only someone in the clan right now can be linked. An account that
has already left cannot be linked, and an existing link to it stays.

### The snapshot carries the links; the departure rule is ADR 0004's

`get_access_management_snapshot` adds `players` to each person:
`[{ tag, name, isCurrentMember, departureObservedOn }]`, read from
`member_roster_overview`. A person is `guest` when `players` is empty. They are
`left clan` when `players` is non-empty and none of them is a current member.
The access-log filter gains `player_claimed`, `player_linked` and
`player_unlinked`, with the person as the target name.

This inherits ADR 0004 unchanged. A departure is absence from a day that has an
observation, and a missing observation is a coverage gap. A stale roster
therefore keeps the last known state and never invents a departure. That
satisfies "absence of evidence is never a penalty".

The mark relies on the roster alone. CWL signup (`cwl_members`) is not the clan
roster and is not consulted.

The session (`resolveAppSession` in `apps/web/src/auth/session.ts`) gains a
`needsPlayerChoice` flag: no row of one's own in the link table and
`player_link_declined_at` null.

## Surfaces

No new component. Each piece below names the existing one it uses.

- **Claim screen.** This is a new `signed_in` state rendered in the auth shell,
  where `access_denied` already renders. It holds a `cm-search` over the roster
  as `cm-rows`, and a `cm-ghost` labelled Not in the clan below the list. Picking
  a row claims it and continues to the app. With an empty roster the list is a
  `cm-empty` and the ghost is the only way on.
- **People row meta.** It shows the linked player names joined with `cm-sep`,
  after the role pill. `left clan` is a `cm-pill is-caution` and `guest` is a
  `cm-pill` with no variant. Both sit in the slot People already uses for
  `role` and `operator`. A linked current member gets no extra mark: per
  ADR 0014, the row marks the exception.
- **Row menu** (`admin-rowmenu`, #125). It offers `Link player`, then one
  `Unlink <name>` per link, ahead of the role change. Revoke access stays last
  in danger ink. The current account's row still has no menu, so an admin links
  their own account through the claim screen or by asking another admin.
- **Link panel.** `Link player` opens a `cm-panel` with the same search and
  rows as the claim screen.

If the roster list needs `cwl-candidates`' ten-row cap, that is the second use
that promotes it to the system layer. It is recorded as an inventory finding in
`design/components.md`.

## Constraints

- Schema before artifact: the migration is pushed before the Pages build that
  reads `players` or `needsPlayerChoice`.
- The repo is public, so fixtures and pgTAP use fake tags such as `#TEST0001`.
  No real tag appears in a test, a spec, or a commit.
- `apps/web/src/test/e2e-client.ts` gains link rows, the declined column, and
  the `players` field in its snapshot stub. `isCurrentMember` is modelled
  explicitly, not dated from the clock.

## Acceptance and test seams

| Seam | Behaviour |
|---|---|
| pgTAP, claim | Claiming a current, unheld tag links it with `linked_by = user_id` and writes `player_claimed`. A caller who is already linked is refused, and so is a caller without access. A tag that is not current, or is held by someone with access, is refused. A tag held only by a revoked person moves, writing `player_unlinked` then `player_claimed`. |
| pgTAP, decline | `decline_player_link` sets the column, and a later link clears it. `redeem_invitation` clears it. |
| pgTAP, admin RPCs | A non-admin gets `42501`. A tag held by someone with access cannot be linked to another person. Unlinking a tag that is not linked raises an error. Each successful call writes exactly one audit event, plus the `player_unlinked` of a move. |
| pgTAP, snapshot | One linked current member gives neither mark. Every linked tag departed gives `left clan`. A departed main with a current alt gives no mark. No links gives `guest`. A tag absent only from a day with no observation is still current. |
| `session.test.ts` | `needsPlayerChoice` is true with no link and no decline, and false with either. |
| `admin-page.test.tsx` | The row shows linked names. The `guest` and `left clan` marks render from the snapshot, found by `getByText`. The menu offers Link and Unlink items. Picking from the panel calls the link handler. |
| Playwright | A new account redeems, sees the claim screen, picks a member, and lands on CWL. A second run picks Not in the clan and lands on CWL as a guest. An admin links an alt, sees it on the row, unlinks it, and sees all three events in the access log. |
| By hand | 375px and 1280px in both themes, for the claim screen and People. The row meta wraps without pushing the menu control off the row. |

## Out of scope

- **Automatic revocation**, or any notification on departure. A human makes
  every access decision, and a leader may leave briefly (a CWL hop, a feeder
  clan).
- **Ownership proof** through `verifytoken`. The endpoint is in the inventory,
  but the browser cannot call the Clash API (developer tokens are
  IP-allowlisted to the collector host), so proof would need a new server-side
  path. Nick has accepted self-claims as unverified.
- **An invitation that carries a tag.** Invitations stay as they are, and the
  person picks after redemption.
- **A guest role with reduced access.** See the guest decision above.
- **Editable display names / aliases** (ADR 0005's unimplemented promise).
  This is a separate, small change. Once links exist it could default to the
  linked player's in-game name.
- **Linking members who never sign in.** Members never sign in (ADR 0005).
