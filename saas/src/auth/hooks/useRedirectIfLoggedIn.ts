import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "wasp/client/auth";

export function useRedirectIfLoggedIn(redirectTo = "/app") {
  const { data: user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const pending = sessionStorage.getItem("pendingInvite");
      if (pending) sessionStorage.removeItem("pendingInvite");
      navigate(pending || redirectTo);
    }
  }, [user, navigate, redirectTo]);
}
