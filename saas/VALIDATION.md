# Preview verification

Verified for the first Open SaaS preview on 2026-10-30:

- Wasp 0.26.1 generation, strict user-code type checking, server bundling and production Vite builds passed.
- 20 unit/integration checks passed against a dedicated PostgreSQL database. Coverage includes hidden votes, actor impersonation, facilitator/observer permissions, foreign-team access, stale rounds, concurrent writes, invitation exhaustion/revocation, demo guests, stream-ticket tampering/expiry, profile-update broadcasts and CSV formula escaping. Additional checks cover task naming, half-point/zero/unknown-vote statistics, own-vote amendments, repeated voting with retained history, and facilitator observation.
- Private HTTP smoke checks passed for signup, rejection of unverified login, email confirmation, login, protection of the administrator flag, team/room creation, guest invitations, private SSE snapshots, reveal permissions and guest revocation.
- Password-reset mail was captured by the private SMTP catcher; resetting the password and logging in with the new password succeeded, while the old password was rejected.
- Headless Chromium checks passed for the desktop landing page, two independent guest participants, invitations, hidden cards, facilitator reveal, average/median calculation, task creation and renaming, own-vote correction synchronized between participants, revoting the same task, CSV download, next tasks, a mobile room layout, verified-account login, dashboard, profile updates, authenticated room creation and logout.
- Production dependency audit reported zero known vulnerabilities at verification time.
- The direct backend port was tested from another server and was blocked; HTTPS proxy access worked.

External email delivery has not been verified because no production mail provider is configured. The preview explicitly identifies its test-mail environment. The root-domain release remains pending production email setup. Preview credentials and mail verification/reset tokens are not part of this repository.

The initial SQL migration is retained byte-for-byte as generated and applied, including its trailing blank line, to preserve its migration checksum.

## Poker behavior restoration

New rooms use the original deck: 0, 1/2, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 and ?. Existing beta decks are expanded while retaining coffee for compatibility with saved votes. Numeric results exclude ? and coffee; half points count as 0.5. Statistics are absent from server snapshots until reveal. Revealed results include average, median, most common estimate and vote distribution.

The first task can be named when creating a room or demo. Facilitators can rename the current task, create a separately named next task, or start another round for the same task. Repeated voting retains the previously revealed round in history. Participants may explicitly change their own disclosed estimate in the current round. Observing removes the current vote without removing facilitator permissions. Stale round IDs and unauthorized title/result changes are rejected.

The additive database migration was applied to the beta database. Desktop and mobile Chromium screenshots were inspected after the update. The original production application remains separate from the beta deployment.

## Live interactions and responsive voting

Paper planes can be sent to another participant; hearts and applause can be sent directly, and the reaction bar adds laugh, fire and celebration reactions. Events are authenticated, scoped to one room and transient (a six-second bounded server buffer). A sender cannot forge the actor ID or target another room. A six-per-ten-second reaction limit is separate from ordinary voting. Participants may hide animations, with the preference retained locally; reduced-motion settings use fading instead of flight.

The existing SSE transport now wakes immediately after committed room mutations or reactions, retaining periodic authorization checks as a fallback. Each event delivery verifies current room access. Voting returns a private confirmed snapshot in the mutation response, avoiding a follow-up state request. Card selection updates optimistically; rapid changes are serialized and coalesced to the latest choice, and failed writes restore confirmed state.

All 20 unit/integration checks passed after the change. Chromium with two independent guest sessions verified plane and emoji delivery, muted animations, hidden votes, calculation/history behavior and mobile layout. With writes artificially delayed by 800 ms, cards remained selectable and immediately showed the newest selection, two rapid choices saved the final value, and no extra state request followed the vote. A simulated failed write rolled back the optimistic selection. Desktop and mobile screenshots were inspected.

Transient events use the current single-process server. A future deployment with multiple application workers will need a shared event broker to distribute reactions and immediate wakeups across workers.
