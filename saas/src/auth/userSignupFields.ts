import { defineUserSignupFields } from "wasp/auth/providers/types";
import { z } from "zod";
const email = (data: unknown) =>
  z
    .object({ email: z.string().email() })
    .parse(data)
    .email.trim()
    .toLowerCase();
export const getEmailUserFields = defineUserSignupFields({
  email,
  username: email,
  name: (d) => email(d).split("@")[0],
  isAdmin: () => false,
});
export const getGitHubUserFields = defineUserSignupFields({});
const googleProfile = z.object({
  profile: z.object({ name: z.string().trim().max(150).optional() }),
});
export const getGoogleUserFields = defineUserSignupFields({
  name: (data) =>
    googleProfile.safeParse(data).data?.profile.name || "Участник",
  isAdmin: () => false,
});
export const getDiscordUserFields = defineUserSignupFields({});
export function getGitHubAuthConfig() {
  return { scopes: ["user:email"] };
}
export function getGoogleAuthConfig() {
  return { scopes: ["profile"] };
}
export function getDiscordAuthConfig() {
  return { scopes: ["identify", "email"] };
}
