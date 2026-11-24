import { useEffect, type PropsWithChildren } from "react";

import { PushNotificationsBootstrap } from "@/components/push-notifications-bootstrap";
import { queryClient } from "@/lib/query/client";
import { authService } from "@/lib/services/auth";
import { useSessionStore } from "@/lib/stores/session";

export function AuthBootstrap({ children }: PropsWithChildren) {
  const setAuthReady = useSessionStore((state) => state.setAuthReady);
  const setSession = useSessionStore((state) => state.setSession);

  // Cached data belongs to one user: drop it whenever the signed-in user
  // changes (sign-out, or a different account signing in on this device).
  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        if (state.session?.userId !== previous.session?.userId) {
          queryClient.clear();
        }
      }),
    [],
  );

  useEffect(() => {
    let isMounted = true;

    void authService
      .getCurrentSession()
      .then((session) => {
        if (isMounted) {
          setSession(session);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setAuthReady(true);
        }
      });

    const unsubscribe = authService.subscribe((session) => {
      if (isMounted) {
        setSession(session);
        setAuthReady(true);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [setAuthReady, setSession]);

  return (
    <>
      <PushNotificationsBootstrap />
      {children}
    </>
  );
}
