import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { crmApi } from "@/api/localApiClient";

const AuthContext = createContext();

export function sanitizeRedirectPath(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return "/";
  }

  return rawValue;
}

function mapAuthError(error) {
  const code = error?.payload?.code || "";

  if (code === "not_invited") {
    return {
      type: "user_not_registered",
      message: error.message || "This Google account has not been invited.",
    };
  }

  if (error?.status === 401 || code === "auth_required" || code === "invalid_session") {
    return {
      type: "auth_required",
      message: error.message || "Sign in is required.",
    };
  }

  if (code === "access_revoked") {
    return {
      type: "access_revoked",
      message: error.message || "Your access has been revoked. Please contact an admin.",
    };
  }

  if (code === "admin_required") {
    return {
      type: "admin_required",
      message: error.message || "Admin access is required.",
    };
  }

  if (code === "email_not_verified") {
    return {
      type: "email_not_verified",
      message: error.message || "Use a Google account with a verified email address.",
    };
  }

  if (code === "invalid_google_token") {
    return {
      type: "invalid_google_token",
      message: error.message || "Google sign-in could not be verified. Please try again.",
    };
  }

  if (code === "google_not_configured" || code === "session_secret_missing" || code === "https_required") {
    return {
      type: "configuration_error",
      message: error.message || "Sign-in is not available right now.",
    };
  }

  if (code === "test_auth_disabled") {
    return {
      type: "configuration_error",
      message: error.message || "Test sign-in is disabled.",
    };
  }

  if (error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("failed to fetch")) {
    return {
      type: "service_unavailable",
      message: "We couldn't verify your session right now. Check the server connection and try again.",
    };
  }

  return {
    type: "unknown",
    message: error?.message || "Authentication failed.",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authConfig, setAuthConfig] = useState(null);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [authConfigError, setAuthConfigError] = useState(null);

  const loadAuthConfig = async () => {
    try {
      const config = await crmApi.auth.getConfig();
      setAuthConfig(config);
      setAuthConfigError(null);
      setAuthConfigLoaded(true);
      return config;
    } catch (error) {
      setAuthConfig(null);
      setAuthConfigError(mapAuthError(error));
      setAuthConfigLoaded(true);
      return null;
    }
  };

  const checkAppState = async () => {
    setIsLoadingAuth(true);

    try {
      await loadAuthConfig();
      const currentUser = await crmApi.auth.me();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: "auth_required", message: "Sign in is required." });
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(mapAuthError(error));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    void checkAppState();
  }, []);

  const loginWithGoogle = async (credential) => {
    setIsLoadingAuth(true);

    try {
      const currentUser = await crmApi.auth.loginWithGoogle(credential);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      const nextError = mapAuthError(error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(nextError);
      throw nextError;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const loginAsTestUser = async (email = "admin@example.test", role = "admin") => {
    setIsLoadingAuth(true);

    try {
      const currentUser = await crmApi.auth.loginAsTestUser(email, role);
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setAuthError(null);
      return currentUser;
    } catch (error) {
      const nextError = mapAuthError(error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(nextError);
      throw nextError;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: "auth_required", message: "Sign in is required." });
    await crmApi.auth.logout("/login");
  };

  const navigateToLogin = (redirectPath = window.location.pathname || "/") => {
    const safeRedirectPath = sanitizeRedirectPath(redirectPath);
    const params = new URLSearchParams();
    if (safeRedirectPath && safeRedirectPath !== "/login") {
      params.set("next", safeRedirectPath);
    }
    window.location.assign(`/login${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      authConfig,
      authConfigLoaded,
      authConfigError,
      logout,
      navigateToLogin,
      checkAppState,
      loginWithGoogle,
      loginAsTestUser,
      isAdmin: String(user?.role || "").toLowerCase() === "admin",
    }),
    [authConfigError, authConfigLoaded, authError, authConfig, isAuthenticated, isLoadingAuth, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
