import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <PublicHeader />

      {/* Hero Section */}
      <section className="relative px-4 pt-16 pb-20 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 mb-6">
          <Zap className="h-3.5 w-3.5" />
          <span>Purpose-built for Web Design, SEO & Lead Gen Agencies</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
          Know which leads need attention today, and prepare the next follow-up
          in <span className="text-blue-600">minutes.</span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto leading-relaxed">
          Stop losing \$3,000–\$10,000 client proposals to forgotten inboxes and
          disorganized spreadsheets. LeadRescue gives your agency an uncluttered
          action layer focused strictly on timely outreach, qualification, and
          closing.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/demo" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto gap-2">
              <span>Explore Demo Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/signup" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              Create Agency Workspace
            </Button>
          </Link>
        </div>

        {/* Value Prop Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center mb-2">
                <Clock className="h-5 w-5" />
              </div>
              <CardTitle>Due Today Action Queue</CardTitle>
              <CardDescription>
                Zero clutter. Every morning, see exactly who is overdue, who
                needs a check-in today, and reschedule with one click.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center mb-2">
                <Sparkles className="h-5 w-5" />
              </div>
              <CardTitle>Rapid Draft Assistance</CardTitle>
              <CardDescription>
                Generate tailored check-ins in seconds using agency
                battle-tested templates or opt-in AI suggestions. Always
                human-reviewed.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mb-2">
                <UploadCloud className="h-5 w-5" />
              </div>
              <CardTitle>Clean CSV Ingestion</CardTitle>
              <CardDescription>
                Import scraped or directory leads with automatic column mapping,
                duplicate detection, and formula injection sanitization.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Pricing Preview Section */}
      <section className="bg-zinc-50 border-t border-zinc-200 py-16 dark:bg-zinc-900/50 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Simple, Transparent Agency Pricing
          </h2>
          <p className="mt-3 text-sm text-zinc-500 max-w-xl mx-auto">
            Start free, validate your agency pipeline, and upgrade when your
            lead volume scales.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            {/* Free Tier */}
            <Card className="flex flex-col">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">
                  Free Pilot
                </Badge>
                <CardTitle className="text-2xl font-bold">
                  \$0{" "}
                  <span className="text-sm font-normal text-zinc-500">/mo</span>
                </CardTitle>
                <CardDescription>
                  Ideal for solo consultants testing the workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Up to
                  100 active leads
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1
                  workspace seat
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard
                  follow-up queue
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />{" "}
                  Deterministic draft templates
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Link href="/demo" className="w-full">
                  <Button variant="outline" className="w-full">
                    Try Free Demo
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Starter Tier */}
            <Card className="flex flex-col border-blue-300 shadow-sm relative dark:border-blue-700">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge
                  variant="default"
                  className="bg-blue-600 text-white font-semibold"
                >
                  Most Popular
                </Badge>
              </div>
              <CardHeader>
                <Badge variant="default" className="w-fit mb-2">
                  Starter
                </Badge>
                <CardTitle className="text-2xl font-bold">
                  \$29{" "}
                  <span className="text-sm font-normal text-zinc-500">/mo</span>
                </CardTitle>
                <CardDescription>
                  For growing boutique design and SEO agencies.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Up to
                  500 active leads
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 3 team
                  members
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Email
                  reminder notifications
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 100
                  monthly AI draft credits
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Link href="/signup" className="w-full">
                  <Button className="w-full">Start 14-Day Trial</Button>
                </Link>
              </div>
            </Card>

            {/* Agency Tier */}
            <Card className="flex flex-col">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">
                  Agency Pro
                </Badge>
                <CardTitle className="text-2xl font-bold">
                  \$79{" "}
                  <span className="text-sm font-normal text-zinc-500">/mo</span>
                </CardTitle>
                <CardDescription>
                  For established outbound & inbound agencies.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Up to
                  2,500 active leads
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 10 team
                  members
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Bulk CSV
                  batch processing
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 500
                  monthly AI draft credits
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <a
                  href="mailto:akhileshrao1754@gmail.com?subject=LeadRescue%20Agency%20Pro%20Inquiry"
                  className="w-full"
                >
                  <Button variant="outline" className="w-full">
                    Contact Sales
                  </Button>
                </a>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-200 py-8 px-4 sm:px-6 lg:px-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 LeadRescue. Built for agency closers.</p>
          <div className="flex items-center gap-6">
            <Link href="/demo" className="hover:underline">
              Demo Dashboard
            </Link>
            <Link href="/login" className="hover:underline">
              Sign In
            </Link>
            <Link href="/signup" className="hover:underline">
              Create Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
