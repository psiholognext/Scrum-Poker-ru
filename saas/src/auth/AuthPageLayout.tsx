import type { ReactNode } from "react";
export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-wrap">
      <section className="panel auth-panel">
        <p className="eyebrow">SCRUM POKER</p>
        <h1>Ваше место за столом</h1>
        <p className="muted">
          Один аккаунт для команд, комнат и истории оценок.
        </p>
        {children}
      </section>
    </main>
  );
}
