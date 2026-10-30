import { action, query, api, type Spec } from "@wasp.sh/spec";
import {
  getDashboard,
  createTeam,
  createRoom,
  createInvitation,
  joinInvitation,
  createDemo,
  getRoomState,
  mutateRoom,
  setParticipantRole,
  revokeInvitation,
  updateProfile,
} from "./operations" with { type: "ref" };
import { roomStream } from "./stream" with { type: "ref" };
const entities = [
  "User",
  "Team",
  "TeamMember",
  "Room",
  "Participant",
  "Round",
  "Vote",
  "Invitation",
] as const;
export const pokerSpec: Spec = [
  query(getDashboard, { entities: [...entities] }),
  action(createTeam, { entities: [...entities] }),
  action(createRoom, { entities: [...entities] }),
  action(createInvitation, { entities: [...entities] }),
  action(joinInvitation, { entities: [...entities] }),
  action(createDemo, { entities: [...entities] }),
  action(getRoomState, { entities: [...entities] }),
  action(mutateRoom, { entities: [...entities] }),
  action(setParticipantRole, { entities: [...entities] }),
  action(revokeInvitation, { entities: [...entities] }),
  action(updateProfile, { entities: [...entities] }),
  api("GET", "/poker-stream/:roomId", roomStream, { auth: false }),
];
