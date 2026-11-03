import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { logout, useAuth } from "wasp/client/auth";
import { env } from "wasp/client";
import "./Main.css";
export function App() {
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!user || pathname !== "/app") return;
    const invite = sessionStorage.getItem("pendingInvite");
    if (!invite) return;
    sessionStorage.removeItem("pendingInvite");
    if (/^\/invite\/[a-f0-9]{64}$/.test(invite))
      navigate(invite, { replace: true });
  }, [user, pathname, navigate]);
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-icon">♠</span> Scrum<span>Poker</span>
          <small>для команд</small>
        </Link>
        <nav>
          <Link to="/demo">Попробовать</Link>
          {user ? (
            <>
              <Link to="/app">Мой кабинет</Link>
              <button
                className="button subtle"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Войти</Link>
              <Link className="button small" to="/signup">
                Создать аккаунт
              </Link>
            </>
          )}
        </nav>
      </header>
      <>
        {env.REACT_APP_STAGE === "staging" && (
          <div className="preview-banner">
            Предпросмотр новой версии. Письма пока поступают в закрытый тестовый
            ящик.
          </div>
        )}
        <Outlet />
      </>
      <footer>Scrum Poker · Планируйте вместе, оценивайте независимо.</footer>
    </>
  );
}
