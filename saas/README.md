# Scrum Poker on Open SaaS

First product slice based on the official Open SaaS `wasp-v0.26-template` (`5bcfcd9`) and the original Scrum-Poker-ru project. The original Next.js app remains in the repository root; this Wasp app is isolated in `saas/`.

## Implemented

- Wasp email signup, email verification, login, logout and password reset with Russian forms.
- Teams and single-use, expiring invitations to teams; authenticated room creation.
- Room facilitators, voting participants and observers; room-scoped guest capabilities with expiration and revocation.
- Private votes on the server; other participants receive only voting status until reveal.
- Persistent rounds and revealed history, CSV export with formula neutralization.
- SSE updates through short-lived, signed stream tickets in Authorization headers; no identity or session tokens in query strings.
- PostgreSQL transactions with serialization-conflict retries for votes, reveal and next-round changes.
- Request limits, private backend port, demo expiry and periodic cleanup.

## Development

Requires Node >=24.22.1, Wasp 0.26.1 and PostgreSQL. Copy `.env.server.example` and `.env.client.example` to the corresponding files and fill local settings. Use a local SMTP catcher for development. Set a fresh random JWT secret per environment.

```sh
wasp install
wasp db migrate-dev
wasp start
```

For tests, create a separate `saas_test` database and apply the generated schema to it. The test harness refuses any other database path. Run `npm test`. The integration suite creates and removes its own fixtures.

## Build and deployment

```sh
wasp build
npm run build:server
npm run build:web
```

Wasp generates the deployable server in `.wasp/out/server`, frontend in `.wasp/out/web-app/build`, and Prisma schema in `.wasp/out/db`. Apply committed migrations before starting the server. The generated frontend uses `200.html` as its SPA fallback.

The `deploy/` directory contains the preview Caddy block, systemd units and the dedicated private-port firewall table. Secrets are stored outside the checkout in `/etc/scrum-poker-saas/staging.env` with mode 0600. PostgreSQL and the SMTP catcher publish only loopback ports. The SMTP catcher's UI must never be publicly exposed.

Preview: `https://beta.scrumpokeronline.ru`. Real outbound mail and the public root-domain cutover require a working production SMTP account and a verified sender. Remove `REACT_APP_STAGE=staging` only after mail delivery has been checked. Guest demo rooms are temporary; permanent rooms require authenticated team membership.

## Migration and rollout

At the initial inspection the existing Next.js instance had not created an SQLite database yet, so there were no existing accounts or rooms to migrate. Recheck before cutover. If users have since registered, take an SQLite backup and map accounts only after verified ownership; do not import opaque old sessions or assume password-hash compatibility.

The preview is an initial product slice, not the full marketing boilerplate. Payment plans, external issue trackers, and advanced decorative animations are not enabled. Auth uses Wasp's email provider; social login requires separate OAuth app credentials. Infrastructure WPP stays on its existing auth subdomain.

## Security maintenance

Nodemailer is overridden to a patched version; the SMTP signup/reset flow must be included in deployment verification. Check the actual runtime dependency audit before production. Never use `npm audit fix --force` across Wasp's pinned framework dependencies without rebuilding and testing auth.

### Poker tasks and results

Name the initial task when creating a room or demo. A facilitator can edit the current title, create a named next task, or repeat voting on the same task with a fresh round. Previous revealed rounds remain in history and CSV exports. Reveal displays the average, median, most common estimate and distribution; `1/2` counts as 0.5 and `?`/coffee do not enter numeric calculations. Participants can explicitly amend their own disclosed estimate in the current round or switch to observing. Facilitators retain room controls while observing.

### Team interactions and card responsiveness

Use the buttons below another participant to send a paper plane, heart or applause. The reaction bar shows your own emoji to the room. Animations may be hidden locally and respect reduced-motion preferences. Reactions are transient and limited to six per ten seconds per sender.

Card selection is immediate while the estimate saves. Rapid choices preserve the last selected card; a failed save displays an error and restores confirmed state. Confirmed votes return in the same response and reach connected participants through immediate SSE notifications. The in-memory event bus assumes one application process; use a shared broker when scaling to multiple workers.

### Google sign-in on beta

Create a Web application client in Google Auth Platform. Use External audience and add the Google accounts that will test it while the app is in Testing. Register the exact redirect URI `https://beta.scrumpokeronline.ru/api/auth/google/callback`. The app requests basic profile access and stores the display name. Existing password accounts remain separate.

Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the private server environment file. Set `REACT_APP_GOOGLE_AUTH=enabled` in `.env.client`, generate the Wasp app with `POKER_ENABLE_GOOGLE=1 wasp build`, build the server and web client, and restart the service. Build without that flag to run without Google credentials. The first successful Google sign-in creates the account and returns the user to the cabinet or their pending team invitation.
