import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Clock3 } from "lucide-react";
import { sanitizeRedirectPath, useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import timberLoginBackground from "@/assets/millbrook-lockscreen.jpg";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const TEST_AUTH_ENABLED = import.meta.env.VITE_ENABLE_TEST_AUTH === "true";
const CONFIGURED_TIMECLOCK_URL = (import.meta.env.VITE_TIMECLOCK_URL || "").trim();
const IS_DEV = Boolean(import.meta.env.DEV);

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google sign-in.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in."));
    document.head.appendChild(script);
  });
}

export default function Login() {
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authConfig, authConfigError, authConfigLoaded, authError, isLoadingAuth, isAuthenticated, loginWithGoogle, loginAsTestUser } = useAuth();
  const [googleReady, setGoogleReady] = useState(false);
  const [pageError, setPageError] = useState("");

  const nextPath = useMemo(() => sanitizeRedirectPath(searchParams.get("next") || "/"), [searchParams]);
  const timeClockUrl = useMemo(() => {
    if (CONFIGURED_TIMECLOCK_URL) {
      return CONFIGURED_TIMECLOCK_URL;
    }

    if (!IS_DEV) {
      return "";
    }

    if (typeof window === "undefined") {
      return "http://127.0.0.1:5174/";
    }

    return `${window.location.protocol}//${window.location.hostname}:5174/`;
  }, []);

  useEffect(() => {
    if (TEST_AUTH_ENABLED) {
      return;
    }

    let cancelled = false;

    void loadGoogleScript()
      .then(() => {
        if (!cancelled) {
          setGoogleReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load Google sign-in.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const previousTitle = document.title;
    document.title = "Millbrook CRM Sign In";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, nextPath]);

  useEffect(() => {
    if (!googleReady || !authConfig?.googleClientId || !buttonRef.current || !window.google?.accounts?.id) {
      return;
    }

    buttonRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: authConfig.googleClientId,
      callback: async (response) => {
        if (!response?.credential) {
          setPageError("Google sign-in did not return a credential.");
          return;
        }

        try {
          setPageError("");
          await loginWithGoogle(response.credential);
          navigate(nextPath, { replace: true });
        } catch (error) {
          setPageError(error?.message || "Google sign-in failed.");
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 400,
    });
  }, [authConfig?.googleClientId, googleReady, loginWithGoogle, navigate, nextPath]);

  const authIssues = useMemo(() => new Set(Array.isArray(authConfig?.issues) ? authConfig.issues : []), [authConfig?.issues]);
  const authWarnings = useMemo(() => (Array.isArray(authConfig?.warnings) ? authConfig.warnings : []), [authConfig?.warnings]);
  const showMissingGoogleClientId = authConfigLoaded && authIssues.has("missing_google_client_id");
  const showMissingSessionSecret = authConfigLoaded && authIssues.has("missing_session_secret");
  const showMissingBootstrap = authConfigLoaded && authIssues.has("missing_bootstrap_admins");
  const showConfigFetchError = authConfigLoaded && !authConfig && authConfigError;
  const canRenderGoogleButton = Boolean(authConfig?.signInEnabled);
  const visibleAuthErrorMessage = authError?.type && authError.type !== "auth_required" ? authError.message : "";

  const messageClass = "mt-4 rounded-2xl border border-[#d6a45f]/35 bg-[#25140d]/85 px-4 py-3 text-sm leading-6 text-[#f1d5a7]";
  const errorClass = "mt-4 rounded-2xl border border-[#eaa18e]/45 bg-[#32120d]/90 px-4 py-3 text-sm leading-6 text-[#ffd6cc]";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#120704] text-[#f8efe4]">
      <img
        src={timberLoginBackground}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-105 object-cover object-[38%_center]"
        loading="eager"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_35%,_rgba(255,182,102,0.08),_transparent_34%),linear-gradient(90deg,_rgba(7,3,1,0.72)_0%,_rgba(12,5,2,0.26)_38%,_rgba(12,5,2,0.04)_72%,_rgba(7,3,1,0.42)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#070201] via-[#070201]/35 to-transparent" />

      <div className="relative z-10 grid min-h-dvh lg:grid-cols-[minmax(400px,500px)_minmax(0,1fr)]">
        <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:justify-start lg:pl-12 lg:pr-0 xl:pl-16">
          <section className="w-full max-w-[460px] overflow-hidden rounded-[2rem] border border-[#c89455]/35 bg-[#120905]/72 shadow-[0_34px_110px_rgba(0,0,0,0.48)] backdrop-blur-xl">
            <div className="p-7 sm:p-9">
              <h1 className="text-4xl font-semibold tracking-tight text-[#fff8ef] sm:text-5xl">Millbrook CRM</h1>
              <div className="mt-6 h-1 w-16 rounded-full bg-[#c89455]" />

              <div className="mt-9">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#d6a45f]">Sign in to continue</p>
                <p className="mt-3 text-sm leading-6 text-[#d9c4aa]/78">
                  Access is controlled through invited Google accounts.
                </p>

                {showMissingGoogleClientId && (
                  <div className={messageClass}>
                    Google sign-in is not configured yet. Set <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono">GOOGLE_CLIENT_ID</code> on the server and restart the API.
                  </div>
                )}

                {showMissingSessionSecret && (
                  <div className={messageClass}>
                    Sign-in is blocked because <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono">AUTH_SESSION_SECRET</code> is missing on the server. Add it to the server env and restart the API.
                  </div>
                )}

                {showMissingBootstrap && (
                  <div className={messageClass}>
                    No invited users exist yet. Add a bootstrap admin email on the server before the first sign-in.
                  </div>
                )}

                {showConfigFetchError && (
                  <div className={errorClass}>
                    {authConfigError.message || "We couldn't reach the server to load sign-in configuration. Check that the API is running and try again."}
                  </div>
                )}

                {authWarnings.length > 0 && <div className={messageClass}>{authWarnings[0]}</div>}

                {!TEST_AUTH_ENABLED && (
                  <div className="mt-5 min-h-[44px] w-full overflow-hidden rounded-2xl bg-white/95 p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.24)] [&>div]:max-w-full">
                    {canRenderGoogleButton ? <div ref={buttonRef} /> : null}
                    {canRenderGoogleButton && !googleReady ? (
                      <div className="flex min-h-[44px] items-center justify-center rounded-2xl text-sm font-medium text-[#33231a]">
                        Preparing Google sign-in...
                      </div>
                    ) : null}
                  </div>
                )}

                {TEST_AUTH_ENABLED && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 min-h-[44px] w-full border-[#c89455]/45 bg-[#fff8ef]/10 text-[#fff8ef] hover:bg-[#fff8ef]/18"
                    data-testid="test-login-button"
                    onClick={async () => {
                      try {
                        setPageError("");
                        const user = await loginAsTestUser("admin@example.test", "admin");
                        if (user) {
                          navigate(nextPath, { replace: true });
                        }
                      } catch (error) {
                        setPageError(error instanceof Error ? error.message : "Test sign-in failed.");
                      }
                    }}
                  >
                    Sign in as Test Admin
                  </Button>
                )}

                {(pageError || visibleAuthErrorMessage) && <div className={errorClass}>{pageError || visibleAuthErrorMessage}</div>}

                {isLoadingAuth && (
                  <div className="mt-4 flex items-center gap-3 text-sm text-[#d9c4aa]/82">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#d6a45f]/35 border-t-[#e8c07f]" />
                    Checking your session...
                  </div>
                )}
              </div>

              <div className="my-8 flex items-center gap-5">
                <div className="h-px flex-1 bg-[#d6a45f]/24" />
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d9c4aa]/78">or</span>
                <div className="h-px flex-1 bg-[#d6a45f]/24" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#d6a45f]">Time Clock Access</p>
                <p className="mt-3 text-sm leading-6 text-[#d9c4aa]/78">For clock in/out and labour tracking only.</p>
                <button
                  type="button"
                  className="mt-5 flex min-h-[64px] w-full items-center gap-4 rounded-2xl border border-[#c89455]/48 bg-[#fff8ef]/[0.035] px-5 text-left text-[#fff8ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-[#e1b36f]/70 hover:bg-[#fff8ef]/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1b36f] disabled:cursor-not-allowed disabled:opacity-55"
                  onClick={() => {
                    if (timeClockUrl) {
                      window.location.assign(timeClockUrl);
                    }
                  }}
                  disabled={!timeClockUrl}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d6a45f]/55 bg-[#d6a45f]/10 text-[#e1b36f]">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {timeClockUrl ? "Sign in to Time Clock Only" : "Time Clock address not configured"}
                    </span>
                    <span className="mt-1 block text-sm text-[#d9c4aa]/70">Workshop staff access</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#e1b36f]" />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-6 z-10 hidden text-center text-[#d6a45f] lg:block">
        <div className="mx-auto flex max-w-xl items-center justify-center gap-7 text-sm">
          <span className="h-px w-16 bg-[#d6a45f]/55" />
          <span>Millbrook Furniture Solutions Ltd</span>
          <span className="h-px w-16 bg-[#d6a45f]/55" />
        </div>
        <p className="mt-2 text-sm text-[#f4dfc0]/70">Quality cabinetry. Expert solutions.</p>
      </footer>
    </div>
  );
}
