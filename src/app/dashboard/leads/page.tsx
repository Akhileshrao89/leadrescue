"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MOCK_LEADS, DEMO_DATA_DISCLAIMER } from "@/features/leads/fixtures";
import { filterLeads } from "@/features/leads/lead-filter";
import { Lead, LeadStage, FollowUpQueueType } from "@/features/leads/types";
import { formatDate, getFollowUpStatus } from "@/lib/utils";
import { fetchWorkspaceLeadsKeyset } from "@/features/leads/actions";
import {
  PlusCircle,
  Search,
  Mail,
  Phone,
  FolderOpen,
  ArrowDown,
} from "lucide-react";

export default function LeadsListPage() {
  const [search, setSearch] = React.useState("");
  const [selectedStage, setSelectedStage] = React.useState<LeadStage | "ALL">(
    "ALL",
  );
  const [selectedQueue, setSelectedQueue] = React.useState<
    FollowUpQueueType | "ALL"
  >("ALL");

  const [liveLeads, setLiveLeads] = React.useState<Lead[] | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState<boolean>(false);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState<boolean>(false);

  React.useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetchWorkspaceLeadsKeyset({
          search,
          stage: selectedStage,
          queue: selectedQueue,
          limit: 25,
        });

        if (active && res.leads) {
          setLiveLeads(res.leads);
          setNextCursor(res.nextCursor);
          setHasMore(res.hasMore);
          if (res.totalActiveCount !== undefined) {
            setTotalCount(res.totalActiveCount);
          }
        }
      } catch {
        // Fall back to demo data in development
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [search, selectedStage, selectedQueue]);

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const res = await fetchWorkspaceLeadsKeyset({
        search,
        stage: selectedStage,
        queue: selectedQueue,
        cursor: nextCursor,
        limit: 25,
      });

      if (res.leads && res.leads.length > 0) {
        setLiveLeads((prev) => [...(prev || []), ...res.leads]);
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Use live leads if available, otherwise filter local mock data
  const displayedLeads =
    liveLeads !== null
      ? liveLeads
      : filterLeads(MOCK_LEADS, {
          search,
          stage: selectedStage,
          queue: selectedQueue,
        });

  const stages: Array<LeadStage | "ALL"> = [
    "ALL",
    "NEW",
    "CONTACTED",
    "QUALIFIED",
    "PROPOSAL",
    "WON",
    "LOST",
  ];

  return (
    <DashboardShell isLiveDatabase={liveLeads !== null}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Agency Leads & Pipeline
              </h1>
              {totalCount !== null && (
                <Badge variant="outline" className="text-xs">
                  {totalCount} Total Active
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Filter and manage all active prospect opportunities across your
              agency.
            </p>
          </div>

          <Link href="/dashboard/leads/new">
            <Button size="sm" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              <span>Create Lead</span>
            </Button>
          </Link>
        </div>

        {/* Filter Toolbar */}
        <Card className="p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search by name, company, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Quick Filter: Due Date Queue */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-medium text-zinc-500 shrink-0">
                Queue:
              </span>
              {(
                [
                  "ALL",
                  "overdue",
                  "due_today",
                  "upcoming",
                  "unscheduled",
                ] as const
              ).map((q) => (
                <Button
                  key={q}
                  variant={selectedQueue === q ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedQueue(q)}
                  className="text-xs shrink-0 capitalize"
                >
                  {q === "ALL" ? "All Queues" : q.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>

          {/* Secondary Filter: Stages */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <span className="text-xs font-medium text-zinc-500 shrink-0 mr-1">
              Stage:
            </span>
            {stages.map((stage) => (
              <Badge
                key={stage}
                variant={selectedStage === stage ? "default" : "outline"}
                className="cursor-pointer text-xs transition-colors shrink-0"
                onClick={() => setSelectedStage(stage)}
              >
                {stage}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Table / List View */}
        <Card className="shadow-xs overflow-hidden">
          {displayedLeads.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-8 w-8 text-zinc-400" />}
              title="No prospects found"
              description="No leads match your current filter parameters or search term."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setSelectedStage("ALL");
                    setSelectedQueue("ALL");
                  }}
                >
                  Reset Filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prospect</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Next Follow-Up</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Latest Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedLeads.map((lead) => {
                    const followUpInfo = getFollowUpStatus(lead.nextFollowUpAt);
                    return (
                      <TableRow key={lead.id} className="hover:bg-zinc-50/50">
                        <TableCell>
                          <div>
                            <Link
                              href={`/dashboard/leads/${lead.id}`}
                              className="font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
                            >
                              {lead.firstName} {lead.lastName}
                            </Link>
                            <p className="text-xs text-zinc-500 font-medium">
                              {lead.companyName || "No Company Specified"}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                              {lead.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {lead.email}
                                </span>
                              )}
                              {lead.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              lead.stage === "WON"
                                ? "default"
                                : lead.stage === "LOST"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-xs"
                          >
                            {lead.stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lead.nextFollowUpAt ? (
                            <div>
                              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                {formatDate(lead.nextFollowUpAt)}
                              </p>
                              {followUpInfo && (
                                <Badge
                                  variant={followUpInfo.variant}
                                  className="text-[10px] mt-0.5"
                                >
                                  {followUpInfo.label}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              No follow-up set
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-zinc-500 capitalize">
                            {lead.source || "Manual"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                            {lead.notes || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/leads/${lead.id}`}>
                            <Button variant="outline" size="sm">
                              Manage
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Keyset Pagination: Load More */}
          {hasMore && (
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-center bg-zinc-50/50 dark:bg-zinc-900/30">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                isLoading={isLoadingMore}
                className="text-xs"
              >
                <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
                Load More Prospects (Keyset Cursor)
              </Button>
            </div>
          )}
        </Card>

        {/* Demo Disclaimer (Shown only if live database is not connected) */}
        {liveLeads === null && (
          <p className="text-xs text-zinc-400 text-center italic">
            {DEMO_DATA_DISCLAIMER}
          </p>
        )}
      </div>
    </DashboardShell>
  );
}
