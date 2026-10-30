# Preview verification

Verified for the first Open SaaS preview on 2026-10-30:

- Wasp 0.26.1 generation, strict user-code type checking, server bundling and production Vite builds passed.
- 13 unit/integration checks passed against a dedicated PostgreSQL database. Coverage includes hidden votes, actor impersonation, facilitator/observer permissions, foreign-team access, stale rounds, concurrent writes, invitation exhaustion/revocation, demo guests, stream-ticket tampering/expiry, profile-update broadcasts and CSV formula escaping.
- Private HTTP smoke checks passed for signup, rejection of unverified login, email confirmation, login, protection of the administrator flag, team/room creation, guest invitations, private SSE snapshots, reveal permissions and guest revocation.
- Password-reset mail was captured by the private SMTP catcher; resetting the password and logging in with the new password succeeded, while the old password was rejected.
- Headless Chromium checks passed for the desktop landing page, two independent guest participants, invitations, hidden cards, facilitator reveal, CSV download, next rounds, a mobile room layout, verified-account login, dashboard, profile updates, authenticated room creation and logout.
- Production dependency audit reported zero known vulnerabilities at verification time.
- The direct backend port was tested from another server and was blocked; HTTPS proxy access worked.

External email delivery has not been verified because no production mail provider is configured. The preview explicitly identifies its test-mail environment. The root-domain release remains pending production email setup. Preview credentials and mail verification/reset tokens are not part of this repository.

The initial SQL migration is retained byte-for-byte as generated and applied, including its trailing blank line, to preserve its migration checksum.
