"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UploadCloud,
  Settings,
  PlusCircle,
  Menu,
  X,
  AlertTriangle,
  Building2,
  ExternalLink,
  LogOut,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName?: string;
  workspaceSlug?: string;
  userEmail?: string;
  userFullName?: string;
  userRole?: string;
  isLiveDatabase?: boolean;
}

export function DashboardShell({
  children,
  workspaceName = "Acme Web & SEO",
  userEmail = "founder@acmedesign.example",
  userFullName = "John Doe",
  userRole = "OWNER",
  isLiveDatabase = false,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    {
      title: "Overview",
      href: "/dashboard",
      icon: LayoutDashboard,
      active: pathname === "/dashboard",
    },
    {
      title: "Leads & Pipeline",
      href: "/dashboard/leads",
      icon: Users,
      active: pathname.startsWith("/dashboard/leads"),
    },
    {
      title: "CSV Import",
      href: "/dashboard/imports",
      icon: UploadCloud,
      active: pathname.startsWith("/dashboard/imports"),
    },
    {
      title: "Settings",
      href: "/dashboard/settings",
      icon: Settings,
      active: pathname.startsWith("/dashboard/settings"),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      {/* Top Banner indicating Database & Session state */}
      <div
        className={cn(
          "px-4 py-2 text-xs flex items-center justify-between border-b",
          isLiveDatabase
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
            : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300",
        )}
      >
        <div className="flex items-center gap-2 mx-auto sm:mx-0">
          {isLiveDatabase ? (
            <>
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Connected to Supabase PostgreSQL:</strong> Authenticated
                session active. Data changes persist in your tenant workspace.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Local Demo Mode:</strong> Viewing in-memory fixtures.
                Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
                <code>.env.local</code> to connect live database.
              </span>
            </>
          )}
        </div>
        <Link
          href="/"
          className="hidden sm:inline-flex items-center gap-1 font-medium hover:underline opacity-80"
        >
          <span>Landing Page</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
                LR
              </div>
              <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                LeadRescue
              </span>
            </Link>

            {/* Active Workspace Card */}
            <div className="mt-4 rounded-lg bg-zinc-50 p-2.5 border border-zinc-200/80 dark:bg-zinc-800/50 dark:border-zinc-700/50">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {workspaceName}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {isLiveDatabase ? `${userRole} Role` : "Free Tier (Demo)"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 py-4">
            <Link href="/dashboard/leads/new">
              <Button className="w-full gap-2 mb-4" size="sm">
                <PlusCircle className="h-4 w-4" />
                <span>New Lead</span>
              </Button>
            </Link>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      item.active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs uppercase">
                {userFullName.slice(0, 2) || "AG"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {userFullName}
                </p>
                <p className="truncate text-[10px] text-zinc-500">
                  {userEmail}
                </p>
              </div>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </form>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="md:hidden flex flex-col flex-1">
          <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white font-bold text-xs">
                LR
              </div>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                LeadRescue
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </header>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="border-b border-zinc-200 bg-white p-4 space-y-2 dark:border-zinc-800 dark:bg-zinc-900">
              <Link
                href="/dashboard/leads/new"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button className="w-full gap-2 mb-3" size="sm">
                  <PlusCircle className="h-4 w-4" />
                  <span>New Lead</span>
                </Button>
              </Link>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                      item.active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-zinc-600 dark:text-zinc-400",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
              <form
                action={signOutAction}
                className="pt-2 border-t border-zinc-100 dark:border-zinc-800"
              >
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-2 py-2 text-xs text-red-600 rounded-md"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </form>
            </div>
          )}

          {/* Main Content (Mobile) */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        {/* Main Content (Desktop) */}
        <main className="hidden md:block flex-1 p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
