import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'wouter';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { LoadingButton } from '@/components/ui/loading-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const formSchema = z.object({
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

type FormData = z.infer<typeof formSchema>;

interface LoginFormProps {
  onForgotPassword?: () => void;
  onSuccess?: () => void;
}

export function LoginForm({ onForgotPassword, onSuccess }: LoginFormProps = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [requiresVerification, setRequiresVerification] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: FormData) {
    if (attemptCount >= 3) {
      toast({
        variant: 'destructive',
        title: 'Account Locked',
        description: 'Too many failed attempts. Please try again after 15 minutes.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important for handling cookies
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 403 && error?.requiresVerification) {
          setRequiresVerification(true);
        }
        throw new Error(error.message || 'Failed to login');
      }

      // Clear attempt count on successful login
      setAttemptCount(0);

      // Hint the app that a fresh login just happened (used by useAuth retry heuristics)
      try {
        localStorage.setItem('lastActiveTime', Date.now().toString());
        // Record the login timestamp for auto-logout enforcement
        localStorage.setItem('rcp_loginAt', Date.now().toString());
        localStorage.removeItem('authErrorHandledAt');
        localStorage.removeItem('authLastRedirectAt');
      } catch (e) {}

      // Proactively refresh the user query and wait for session to be readable
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      // Get any saved redirect URL
      const redirectUrl = localStorage.getItem('redirectAfterLogin');
      localStorage.removeItem('redirectAfterLogin'); // Clear it after reading

      // Poll the user endpoint briefly to avoid race conditions where the session
      // cookie isn't yet available to subsequent requests.
      const waitForSession = async (timeoutMs = 2500, intervalMs = 150) => {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const res = await fetch('/api/auth/user', {
              credentials: 'include',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (res.ok) {
              return true;
            }
          } catch (_) {
            // ignore and retry until timeout
          }
          if (Date.now() - start > timeoutMs) return false;
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      };

      const sessionReady = await waitForSession();

      toast({
        title: 'Welcome back!',
        description: sessionReady
          ? "You've been successfully logged in."
          : 'Logged in. Initializing your session...',
      });

      // Close dialog if callback provided
      onSuccess?.();

      // Redirect to the saved URL or default to dashboard
      setLocation(redirectUrl || '/dashboard');
    } catch (error: any) {
      setAttemptCount((prev) => prev + 1);

      let errorMessage = error.message;
      if (attemptCount >= 1) {
        const remainingAttempts = 3 - (attemptCount + 1);
        errorMessage += ` (${remainingAttempts} attempts remaining)`;
      }

      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: errorMessage,
      });

      // If this was the third failed attempt, set a timeout
      if (attemptCount + 1 >= 3) {
        setTimeout(() => {
          setAttemptCount(0);
          toast({
            title: 'Account Unlocked',
            description: 'You can now try logging in again.',
          });
        }, 15 * 60 * 1000); // 15 minutes
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {requiresVerification && (
          <div className="rounded border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm">
            Please verify your email address before logging in. If you didn’t receive the email, use
            the “Resend verification email” link below. Also check your spam/junk folder.
          </div>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="Enter your email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <LoadingButton
          type="submit"
          className="w-full"
          loading={isLoading}
          loadingText="Logging in..."
          disabled={attemptCount >= 3}
        >
          {attemptCount >= 3 ? 'Too many attempts' : 'Login'}
        </LoadingButton>

        {/* Forgot Password Link */}
        {onForgotPassword && (
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={onForgotPassword}
            >
              Forgot your password?
            </button>
          </div>
        )}

        <div className="mt-2 text-center text-sm">
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={async () => {
              const email = form.getValues('email').trim();
              if (!email || !/.+@.+\..+/.test(email)) {
                toast({
                  variant: 'destructive',
                  title: 'Invalid email',
                  description: 'Enter your email above first.',
                });
                return;
              }
              try {
                const res = await fetch('/api/auth/resend-verification', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                  },
                  body: JSON.stringify({ email }),
                });
                if (!res.ok) {
                  if (res.status === 429) {
                    const retryAfter = res.headers.get('Retry-After');
                    const seconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
                    toast({
                      variant: 'destructive',
                      title: 'Too many requests',
                      description: `Please try again in ${
                        Number.isFinite(seconds) ? seconds + ' seconds' : 'a few seconds'
                      }.`,
                    });
                    return;
                  }
                  const data = await res
                    .json()
                    .catch(() => ({ message: 'Failed to resend verification email' }));
                  throw new Error(data.message || 'Failed to resend verification email');
                }
                toast({
                  title: 'Verification email sent',
                  description: 'Please check your inbox (and spam/junk folder).',
                });
              } catch (e: any) {
                toast({
                  variant: 'destructive',
                  title: 'Error',
                  description: e.message || 'Failed to resend verification email',
                });
              }
            }}
          >
            Resend verification email
          </button>
        </div>
        {attemptCount >= 3 && (
          <p className="text-sm text-red-600 text-center">
            Account temporarily locked. Please try again later.
          </p>
        )}
      </form>
    </Form>
  );
}
