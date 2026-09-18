import { useEffect, type PropsWithChildren } from "react";

import { PushNotificationsBootstrap } from "@/components/push-notifications-bootstrap";
import { authService } from "@/lib/services/auth";
import { useSessionStore } from "@/lib/stores/session";

export function AuthBootstrap({ children }: PropsWithChildren) {
  const setAuthReady = useSessionStore((state) => state.setAuthReady);
  const setSession = useSessionStore((state) => state.setSession);

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
