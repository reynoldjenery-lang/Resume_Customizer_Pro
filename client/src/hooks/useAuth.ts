import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { clearAllClientAuthData } from '@/lib/clearAuthData';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        console.log('🔍 useAuth: Fetching user data...');
        const response = await fetch("http://localhost:5000/api/auth/user", {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest"
          }
        });

        console.log('🔍 useAuth: Response status:', response.status);

        if (!response.ok) {
          if (response.status === 302) {
            console.log('🔍 useAuth: 302 Redirect - Session not established');
            throw new Error("401: Unauthorized");
          }
          if (response.status === 401) {
            console.log('🔍 useAuth: 401 Unauthorized');
            throw new Error("401: Unauthorized");
          }
          if (response.status === 403) {
            console.log('🔍 useAuth: 403 Forbidden');
            throw new Error("403: Forbidden");
          }
          if (response.status === 404) {
            console.log('🔍 useAuth: 404 Not Found');
            throw new Error("404: Not Found");
          }
          throw new Error(`${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('🔍 useAuth: User data received:', data?.email);
        return data as User;
      } catch (error: any) {
        console.log('🔍 useAuth: Error fetching user:', error.message);
        throw new Error(error.message || "Failed to fetch user data");
      }
    },
    retry: (failureCount, error: any) => {
      // Check if this is a recent login - allow retries for fresh logins
      const lastLoginAttempt = localStorage.getItem('lastActiveTime');
      const now = Date.now();
      const isRecentLogin = lastLoginAttempt && (now - parseInt(lastLoginAttempt)) < 10000; // 10 seconds
      
      // For recent logins, retry auth errors once to handle timing issues
      if (isRecentLogin && failureCount < 1 && (error?.message?.includes('401') || error?.message?.includes('403'))) {
        console.log('Retrying auth request after recent login');
        return true;
      }
      
      // Don't retry on auth-related errors to prevent loops (except for recent logins)
      if (error?.message?.includes('401') || error?.message?.includes('403') || error?.message?.includes('404')) {
        return false;
      }
      // Only retry network errors up to 2 times
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => {
      // For recent logins, use a shorter delay
      const lastLoginAttempt = localStorage.getItem('lastActiveTime');
      const now = Date.now();
      const isRecentLogin = lastLoginAttempt && (now - parseInt(lastLoginAttempt)) < 10000;
      
      return isRecentLogin ? 500 : Math.min(1000 * 2 ** attemptIndex, 30000);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - much longer stale time
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false, // Disable aggressive refetching
    refetchOnReconnect: false, // Disable auto-refetch on reconnect
    refetchInterval: false, // Disable periodic refetching
    refetchOnMount: 'always', // Allow refetch on mount for auth state
  });

  // Handle errors using useEffect to watch for error state
  React.useEffect(() => {
    if (error) {
      const path = window.location.pathname;
      const onAuthPages = ['/login', '/register', '/verify-email', '/'].includes(path);
      
      // Handle session expiration
      if (error?.message?.includes('401')) {
        // Check if this is a fresh login attempt - don't redirect immediately after login
        const lastLoginAttempt = localStorage.getItem('lastActiveTime');
        const now = Date.now();
        const isRecentLogin = lastLoginAttempt && (now - parseInt(lastLoginAttempt)) < 10000; // 10 seconds
        
        // Don't handle 401 errors immediately after a recent login
        if (isRecentLogin) {
          console.log('🔍 useAuth: Ignoring 401 error - recent login detected. Last login:', new Date(parseInt(lastLoginAttempt)));
          return;
        }
        
        console.log('🔍 useAuth: Handling 401 error. Last login:', lastLoginAttempt ? new Date(parseInt(lastLoginAttempt)) : 'none');

        // Avoid spamming toasts on auth pages and landing page
        if (!onAuthPages) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Please log in again to continue.",
          });
        }

        // Throttle handling to avoid loops where clearing the entire query cache
        // causes immediate refetches which re-trigger this handler repeatedly.
        // Only perform the session-clear & query cancellation once per 60s.
        const lastHandled = parseInt(localStorage.getItem('authErrorHandledAt') || '0', 10) || 0;
        if (now - lastHandled > 60 * 1000) {
          localStorage.setItem('authErrorHandledAt', String(now));

          // Cancel any in-flight user query and set it to null so components
          // that read it don't immediately re-fetch and re-trigger the error.
          try {
            queryClient.cancelQueries({ queryKey: ["/api/auth/user"] });
            queryClient.setQueryData(["/api/auth/user"], null);
          } catch (e) {
            // ignore; defensive
            console.error('Error while cancelling/clearing auth query:', e);
          }

          // Clear local/session storage but avoid wiping the entire query cache.
          localStorage.removeItem("lastActiveTime");
          sessionStorage.clear();
        }

        // Redirect to login once; skip if already on an auth page
        // Also skip if this is a recent login to prevent redirect loops
        if (!onAuthPages && !isRecentLogin) {
          const lastRedirectAt = parseInt(localStorage.getItem('authLastRedirectAt') || '0', 10) || 0;
          if (now - lastRedirectAt > 2000) {
            localStorage.setItem('authLastRedirectAt', String(now));
            window.location.href = "/login";
          }
        }
      } else if (error?.message?.includes('403')) {
        if (!onAuthPages) {
          toast({
            variant: "destructive",
            title: "Access Denied",
            description: "You don't have permission to access this resource.",
          });
        }
      } else if (error instanceof TypeError && error.message === "Failed to fetch") {
        if (!onAuthPages) {
          toast({
            variant: "destructive",
            title: "Connection Error",
            description: "Please check your internet connection.",
          });
        }
      } else {
        // Only show generic errors on authenticated pages, not on landing/auth pages
        if (!onAuthPages) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "An unexpected error occurred. Please try again.",
          });
        }
      }
    }
  }, [error, toast, queryClient]);

  // Define clearLocalSession outside of logout to make it reusable
  const clearLocalSession = async () => {
    try {
      queryClient.clear();
      await clearAllClientAuthData({ preservePreferences: true });
    } catch (e) {
      console.error('Error clearing local session:', e);
      // Fallback to previous behavior
      queryClient.clear();
      localStorage.removeItem('lastActiveTime');
      sessionStorage.clear();
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
      });
    }
  };

  const logout = async () => {
    try {
      // Get CSRF token from cookie
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='))
        ?.split('=')[1];

      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Logout failed");
      }

      // Clear all session data and force auth state update
      await clearLocalSession();
      
      // Explicitly invalidate auth query to trigger re-render
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Show success message
      toast({
        title: "Goodbye!",
        description: "You have been successfully logged out.",
      });
    } catch (error) {
      console.error("Logout error:", error);
      
      // Handle network errors differently
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Your session will be cleared locally. Please check your internet connection.",
          duration: 5000,
        });
        // Force clear session on network error and redirect
        clearLocalSession();
        setTimeout(() => {
          window.location.replace("/");
        }, 1000);
        return;
      }

      // For other errors, still try to clear the session but show an error
      toast({
        variant: "destructive",
        title: "Logout Error",
        description: "There was a problem logging out. Your session will be cleared locally.",
        duration: 5000,
      });
      clearLocalSession();
      setTimeout(() => {
        window.location.replace("/");
      }, 1000);
    }
  };

  const refreshUser = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      console.error("Error refreshing user data:", error);
      toast({
        variant: "destructive",
        title: "Refresh Error",
        description: "Failed to refresh user data. Please try again.",
      });
    }
  };

  // Add an interval to check session activity - only when authenticated
  React.useEffect(() => {
    // Only run session timeout logic when user is authenticated
    if (!user) {
      return;
    }

    const SESSION_TIMEOUT = 60 * 60 * 1000; // 60 minutes (match server session)
    const ACTIVITY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (less frequent)

    const checkSessionActivity = () => {
      const lastActiveTime = localStorage.getItem("lastActiveTime");
      if (lastActiveTime) {
        const inactiveTime = Date.now() - parseInt(lastActiveTime);
        if (inactiveTime > SESSION_TIMEOUT) {
          logout();
        }
      }
    };

    // Update last active time on user interaction
    const updateLastActiveTime = () => {
      localStorage.setItem("lastActiveTime", Date.now().toString());
    };

    // Set up activity listeners
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(event => {
      window.addEventListener(event, updateLastActiveTime);
    });

    // Initial setup - reset activity time for fresh authentication
    updateLastActiveTime();

    // Set up interval check
    const interval = setInterval(checkSessionActivity, ACTIVITY_CHECK_INTERVAL);

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateLastActiveTime);
      });
      clearInterval(interval);
    };
  }, [user]); // Depend on user so it resets when authentication state changes

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    logout,
    refreshUser,
  };
}
