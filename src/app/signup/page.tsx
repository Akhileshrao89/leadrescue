"use client";

import * as React from "react";
import Link from "next/link";
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
import { signUpAction, type AuthActionResult } from "@/features/auth/actions";
import { Building2 } from "lucide-react";

export default function SignupPage() {
  const [state, formAction, isPending] = React.useActionState<
    AuthActionResult | null,
    FormData
  >(signUpAction, null);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <PublicHeader />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full max-w-md shadow-md">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
              <Building2 className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">Create Agency Workspace</CardTitle>
            <CardDescription>
              Start rescuing stalled client deals today
            </CardDescription>
          </CardHeader>

          <CardContent>
            {state?.message && (
              <Alert className="mb-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                <AlertTitle>Account Created</AlertTitle>
                <AlertDescription>
                  {state.message}{" "}
                  <Link href="/login" className="underline font-semibold ml-1">
                    Proceed to Sign In &rarr;
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {state?.error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Registration Failed</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <form action={formAction} className="space-y-4">
              <div>
                <Label htmlFor="agencyName" required>
                  Agency / Business Name
                </Label>
                <Input
                  id="agencyName"
                  name="agencyName"
                  placeholder="Apex Web & SEO"
                  error={state?.fieldErrors?.agencyName}
                  required
                />
              </div>

              <div>
                <Label htmlFor="fullName" required>
                  Your Name
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  placeholder="Alex Rivera"
                  error={state?.fieldErrors?.fullName}
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">
                  Work Email (Optional if Phone provided)
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="alex@apexagency.com"
                  error={state?.fieldErrors?.email}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone Number (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  error={state?.fieldErrors?.phone}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="password" required className="mb-0">
                    Password
                  </Label>
                  <span className="text-xs text-zinc-400">
                    Min 8 characters
                  </span>
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

              <Button type="submit" className="w-full" isLoading={isPending}>
                Create Workspace & Launch
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-zinc-100 dark:border-zinc-800 pt-4 text-xs text-zinc-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="ml-1 text-blue-600 hover:underline font-medium"
            >
              Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
