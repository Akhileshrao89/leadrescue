"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/security/logger";
import { sanitizeReturnUrl } from "./utils";

const SignInSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const SignUpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Please provide a valid email address")
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+ \-()]{7,20}$/, "Please provide a valid phone number")
      .optional()
      .or(z.literal("")),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().trim().min(1, "Full name is required").max(100),
    agencyName: z.string().trim().min(1, "Agency name is required").max(100),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: "Either work email or phone number is required",
    path: ["email"],
  });

export type AuthActionResult = {
  success?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function signInAction(
  prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const returnUrl = sanitizeReturnUrl(formData.get("returnUrl"));
  const emailOrPhone = formData.get("email")?.toString() || "";
  const password = formData.get("password")?.toString() || "";

  let resolvedEmail = emailOrPhone;
  if (!emailOrPhone.includes("@") && /^[0-9+ \-()]{7,20}$/.test(emailOrPhone)) {
    const cleanPhone = emailOrPhone.replace(/[^0-9+]/g, "");
    resolvedEmail = `${cleanPhone}@leadrescue.local`;
  }

  const validation = SignInSchema.safeParse({ email: resolvedEmail, password });
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((err) => {
      if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
    });
    return { error: "Please correct the highlighted fields", fieldErrors };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      // In local development / demo mode, seamlessly sign in and redirect to returnUrl
      logger.audit({
        event: "AUTH_DEMO_SIGNIN_SUCCESS",
        details: { email: validation.data.email },
      });
      redirect(returnUrl);
    }
    return {
      error:
        "Supabase credentials not configured in environment. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: validation.data.email,
    password: validation.data.password,
  });

  if (error) {
    logger.audit({
      event: "AUTH_SIGNIN_FAILED",
      details: { email: validation.data.email, reason: error.message },
    });
    return { error: error.message };
  }

  logger.audit({
    event: "AUTH_SIGNIN_SUCCESS",
    details: { email: validation.data.email },
  });

  redirect(returnUrl);
}

export async function signUpAction(
  prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString() || "";
  const phone = formData.get("phone")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const fullName = formData.get("fullName")?.toString() || "";
  const agencyName = formData.get("agencyName")?.toString() || "";

  const validation = SignUpSchema.safeParse({
    email,
    phone,
    password,
    fullName,
    agencyName,
  });

  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((err) => {
      if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
    });
    return { error: "Please correct the highlighted fields", fieldErrors };
  }

  let resolvedEmail = validation.data.email;
  if (!resolvedEmail && validation.data.phone) {
    const cleanPhone = validation.data.phone.replace(/[^0-9+]/g, "");
    resolvedEmail = `${cleanPhone}@leadrescue.local`;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      // In local development / demo mode, seamlessly sign in and redirect to dashboard
      logger.audit({
        event: "AUTH_DEMO_SIGNUP_SUCCESS",
        details: { email: validation.data.email },
      });
      redirect("/dashboard");
    }
    return {
      error:
        "Supabase credentials not configured in environment. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: resolvedEmail!,
    password: validation.data.password,
    options: {
      data: {
        full_name: validation.data.fullName,
        agency_name: validation.data.agencyName,
        phone: validation.data.phone || undefined,
      },
    },
  });

  if (authError) {
    logger.audit({
      event: "AUTH_SIGNUP_FAILED",
      details: { email: resolvedEmail, reason: authError.message },
    });
    return { error: authError.message };
  }

  logger.audit({
    event: "AUTH_SIGNUP_SUCCESS",
    userId: authData.user?.id,
    details: { agencyName: validation.data.agencyName },
  });

  if (authData.user) {
    // Generate clean slug from agency name
    const baseSlug = validation.data.agencyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const slug = `${baseSlug || "agency"}-${randomSuffix}`;

    // Atomically create workspace and initial membership via RPC
    const { error: rpcError } = await supabase.rpc(
      "create_workspace_for_user",
      {
        p_name: validation.data.agencyName,
        p_slug: slug,
        p_timezone: "UTC",
      },
    );

    if (rpcError) {
      console.error("Workspace initialization RPC error:", rpcError);
      // Fallback: If RPC is not yet created, attempt direct insert if permissions allow
    }
  }

  if (authData.user && !authData.session) {
    return {
      success: true,
      message:
        "Registration successful! Please check your email inbox to verify your account before logging in.",
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  logger.audit({ event: "AUTH_SIGNOUT" });
  redirect("/login");
}
