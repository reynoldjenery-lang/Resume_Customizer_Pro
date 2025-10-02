import { Switch, Route } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { lazy, Suspense, memo } from 'react';
import { PageLoader } from '@/components/ui/page-loader';

// Preload critical routes for better performance
const preloadComponent = (componentImport: () => Promise<any>) => {
  const componentImportRef = { current: componentImport };
  return lazy(() => componentImportRef.current());
};
// Lazy load components with better error boundaries
const NotFound = lazy(() => import('@/pages/not-found'));
const Landing = preloadComponent(() => import('@/pages/landing'));
const Dashboard = preloadComponent(() => import('@/pages/dashboard'));
const MultiResumeEditorPage = preloadComponent(() => import('@/pages/multi-resume-editor-page'));
const MarketingPage = lazy(() => import('@/pages/marketing'));
const VerifyEmail = lazy(() => import('@/pages/verify-email'));
const ResetPassword = lazy(() => import('@/pages/reset-password'));
const Privacy = lazy(() => import('@/pages/privacy'));

// Preload critical components on app mount
if (typeof window !== 'undefined') {
  // Preload dashboard for authenticated users
  const preloadDashboard = () => import('@/pages/dashboard');
  const preloadLanding = () => import('@/pages/landing');
  
  // Small delay to avoid blocking initial render
  setTimeout(() => {
    preloadDashboard();
    preloadLanding();
  }, 1000);
}

const Router = memo(() => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader variant="branded" text="Checking authentication..." />;
  }

  return (
    <Suspense
      fallback={<PageLoader variant="branded" text="Loading application..." />}
    >
      <Switch>
        {isAuthenticated ? (
          // Authenticated routes
          <>
            <Route path="/" component={Dashboard} />
            <Route path="/editor" component={MultiResumeEditorPage} />
            <Route path="/marketing" component={MarketingPage} />
            <Route path="/privacy" component={Privacy} />
          </>
        ) : (
          // Non-authenticated routes
          <>
            <Route path="/" component={Landing} />
            <Route path="/login" component={Landing} />
            <Route path="/register" component={Landing} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/privacy" component={Privacy} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
});
Router.displayName = 'Router';

import CookieConsent from '@/components/cookie-consent';
import { ErrorBoundary } from '@/components/error-boundary';

const App = memo(() => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <SonnerToaster 
            position="top-right" 
            richColors 
            closeButton
            duration={4000}
            toastOptions={{
              className: 'toast-custom',
              style: {
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))'
              }
            }}
          />
          <Router />
          <CookieConsent />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
});
App.displayName = 'App';

export default App;
