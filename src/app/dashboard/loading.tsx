import { Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center space-y-4">
      <Spinner size="lg" />
      <p className="text-sm font-medium text-zinc-500 animate-pulse">
        Loading agency pipeline...
      </p>
    </div>
  );
}
