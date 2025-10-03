import React from 'react';
import { Route } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { PageLoader } from '@/components/ui/page-loader';

interface PrivateRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({ path, component: Component }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Handle authentication state changes outside of render
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      // Store the attempted URL only if we haven't already stored one
      if (!localStorage.getItem('redirectAfterLogin')) {
        localStorage.setItem('redirectAfterLogin', currentPath);
        // Show toast only when first attempting to access a protected route
        toast({
          variant: 'destructive',
          title: 'Authentication Required',
          description: 'Please log in or sign up to access this page.',
        });
      }
      // Perform the redirect
      setLocation('/?auth=login');
    }
  }, [isAuthenticated, isLoading, setLocation, toast]);

  return (
    <Route
      path={path}
      component={(props) => {
        if (isLoading) {
          return <PageLoader variant="default" />;
        }

        return isAuthenticated ? <Component {...props} /> : null;
      }}
    />
  );
};
