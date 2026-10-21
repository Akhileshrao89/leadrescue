import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400 mb-6">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
        Page Not Found (404)
      </h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm">
        The page or resource you requested could not be located in this
        workspace.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/dashboard">
          <Button size="sm">Return to Dashboard</Button>
        </Link>
        <Link href="/">
          <Button variant="outline" size="sm">
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
