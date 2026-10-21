"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { signInAction, type AuthActionResult } from "@/features/auth/actions";
import { Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnUrl = searchParams.get("returnUrl") || "/dashboard";

  const [state, formAction, isPending] = React.useActionState<
    AuthActionResult | null,
    FormData
  >(signInAction, null);

  function handleDemoBypass() {
    router.push("/demo");
  }

  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
          <Lock className="h-5 w-5" />
        </div>
        <CardTitle className="text-2xl">Sign In to LeadRescue</CardTitle>
        <CardDescription>
          Access your agency workspace and daily follow-up queue
        </CardDescription>
      </CardHeader>

      <CardContent>
        {state?.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Authentication Failed</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="returnUrl" value={rawReturnUrl} />
          <div>
            <Label htmlFor="email" required>
              Work Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@agency.com"
              error={state?.fieldErrors?.email}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="password" required className="mb-0">
                Password
              </Label>
              <span className="text-xs text-zinc-400">Min 8 characters</span>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              error={state?.fieldErrors?.password}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4 text-center text-sm">
        <div className="text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-blue-600 font-medium hover:underline"
          >
            Create Agency Workspace
          </Link>
        </div>

        <div className="relative w-full my-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-zinc-950 px-2 text-zinc-400">
              or
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleDemoBypass}
        >
          Explore Live Demo Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <React.Suspense
          fallback={
            <div className="text-sm text-zinc-400">Loading sign-in...</div>
          }
        >
          <LoginForm />
        </React.Suspense>
      </div>
    </div>
  );
}
