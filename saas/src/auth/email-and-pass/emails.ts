import {
  type GetPasswordResetEmailContentFn,
  type GetVerificationEmailContentFn,
} from "wasp/server/auth";

export const getVerificationEmailContent: GetVerificationEmailContentFn = ({
  verificationLink,
}) => ({
  subject: "Подтвердите email в Scrum Poker",
  text: `Для подтверждения email перейдите по ссылке: ${verificationLink}`,
  html: `
        <p>Для подтверждения email перейдите по ссылке</p>
        <a href="${verificationLink}">Подтвердить email</a>
    `,
});

export const getPasswordResetEmailContent: GetPasswordResetEmailContentFn = ({
  passwordResetLink,
}) => ({
  subject: "Сброс пароля Scrum Poker",
  text: `Для смены пароля перейдите по ссылке: ${passwordResetLink}`,
  html: `
        <p>Для смены пароля перейдите по ссылке</p>
        <a href="${passwordResetLink}">Сменить пароль</a>
    `,
});
