import { app, page, route } from "@wasp.sh/spec";
import { App } from "./src/client/App" with { type: "ref" };
import { clientEnvValidationSchema } from "./src/env" with { type: "ref" };
import {
  LandingPage,
  DashboardPage,
  RoomPage,
  InvitePage,
  DemoPage,
} from "./src/poker/pages" with { type: "ref" };
import { authConfig, authSpec } from "./src/auth/auth.wasp";
import { middleware, setup } from "./src/server" with { type: "ref" };
import { pokerSpec } from "./src/poker/poker.wasp";

export default app({
  name: "ScrumPoker",
  wasp: { version: "^0.26.1" },
  title: "Scrum Poker — оценка задач командой",
  head: [
    "<meta name='description' content='Планируйте спринты вместе: команды, приватные комнаты и история оценок.' />",
    "<meta name='theme-color' content='#0b1020' />",
  ],
  auth: authConfig,
  client: {
    rootComponent: App,
    envValidationSchema: clientEnvValidationSchema,
  },
  server: { middlewareConfigFn: middleware, setupFn: setup },
  emailSender: {
    provider: "SMTP",
    defaultFrom: { name: "Scrum Poker", email: "noreply@scrumpokeronline.ru" },
  },
  spec: [
    route("LandingRoute", "/", page(LandingPage)),
    route(
      "DashboardRoute",
      "/app",
      page(DashboardPage, { authRequired: true }),
    ),
    route("RoomRoute", "/room/:roomId", page(RoomPage)),
    route("InviteRoute", "/invite/:token", page(InvitePage)),
    route("DemoRoute", "/demo", page(DemoPage)),
    authSpec,
    pokerSpec,
  ],
});
