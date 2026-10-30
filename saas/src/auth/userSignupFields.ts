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
export const getGoogleUserFields = defineUserSignupFields({});
export const getDiscordUserFields = defineUserSignupFields({});
export function getGitHubAuthConfig() {
  return { scopes: ["user:email"] };
}
export function getGoogleAuthConfig() {
  return { scopes: ["profile", "email"] };
}
export function getDiscordAuthConfig() {
  return { scopes: ["identify", "email"] };
}
