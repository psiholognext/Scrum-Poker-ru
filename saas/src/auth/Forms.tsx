import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  login,
  signup,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "wasp/client/auth";
import { AuthPageLayout } from "./AuthPageLayout";
import { useRedirectIfLoggedIn } from "./hooks/useRedirectIfLoggedIn";

function message(e: unknown) {
  const s = e instanceof Error ? e.message : "";
  if (/verif/i.test(s))
    return "Подтвердите email: ссылка отправлена при регистрации.";
  if (/rate|too many|429/i.test(s))
    return "Слишком много попыток. Попробуйте позже.";
  if (/expired|invalid.*token/i.test(s))
    return "Ссылка истекла или уже использована. Запросите новую.";
  return "Не удалось выполнить действие. Проверьте введённые данные и попробуйте ещё раз.";
}
function Form({ mode }: { mode: "login" | "signup" | "request" | "reset" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const title = {
    login: "Войти в аккаунт",
    signup: "Создать аккаунт",
    request: "Восстановить пароль",
    reset: "Новый пароль",
  }[mode];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login({ email: email.trim().toLowerCase(), password });
        const p = sessionStorage.getItem("pendingInvite");
        sessionStorage.removeItem("pendingInvite");
        navigate(p || "/app");
      }
      if (mode === "signup") {
        await signup({
          email: email.trim().toLowerCase(),
          password,
          username: email.trim().toLowerCase(),
          name: email.split("@")[0],
          isAdmin: false,
        });
        setDone(true);
      }
      if (mode === "request") {
        await requestPasswordReset({ email: email.trim().toLowerCase() });
        setDone(true);
      }
      if (mode === "reset") {
        await resetPassword({ token: params.get("token") || "", password });
        setDone(true);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPageLayout>
      <h2>{title}</h2>
      {done ? (
        <div className="success" role="status">
          {mode === "signup"
            ? "Проверьте почту. Подтвердите email по ссылке из письма, затем войдите в аккаунт."
            : mode === "request"
              ? "Если такой аккаунт существует, письмо со ссылкой для смены пароля отправлено."
              : "Пароль изменён. Теперь можно войти."}
        </div>
      ) : (
        <form onSubmit={submit}>
          {mode !== "reset" && (
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "request" && (
            <label>
              {mode === "reset" ? "Новый пароль" : "Пароль"}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === "signup" && (
            <p className="muted">
              Не менее 8 символов. Используйте уникальный пароль.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? "Подождите…" : title}
          </button>
        </form>
      )}
      <p className="auth-links">
        {mode === "login" ? (
          <>
            <Link to="/signup">Регистрация</Link> ·{" "}
            <Link to="/request-password-reset">Забыли пароль?</Link>
          </>
        ) : (
          <Link to="/login">Вернуться ко входу</Link>
        )}
      </p>
    </AuthPageLayout>
  );
}
export function RussianLogin() {
  useRedirectIfLoggedIn();
  return <Form mode="login" />;
}
export function RussianSignup() {
  useRedirectIfLoggedIn();
  return <Form mode="signup" />;
}
export function RussianRequestReset() {
  return <Form mode="request" />;
}
export function RussianReset() {
  return <Form mode="reset" />;
}
export function RussianVerify() {
  const [params] = useSearchParams();
  const started = useRef(false);
  const [status, setStatus] = useState("Подтверждаем email…");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verifyEmail({ token: params.get("token") || "" })
      .then((result) => {
        if (!result.success) throw new Error("invalid token");
        setStatus("Email подтверждён. Войдите в аккаунт, чтобы продолжить.");
        setOk(true);
      })
      .catch((e) => setStatus(message(e)));
  }, [params]);
  return (
    <AuthPageLayout>
      <h2>Подтверждение email</h2>
      <p className={ok ? "success" : "muted"} role="status">
        {status}
      </p>
      <Link className="button" to="/login">
        Войти
      </Link>
    </AuthPageLayout>
  );
}
