"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  initiateCsvImportAction,
  fetchImportJobsAction,
  exportLeadsToCsvAction,
  type ImportJobRecord,
} from "@/features/imports/actions";
import {
  parseCsv,
  MAX_CSV_FILE_SIZE,
  MAX_CSV_ROWS,
} from "@/features/imports/csv";
import {
  type ImportMapping,
  type DuplicatePolicy,
  type ImportProcessResult,
} from "@/features/imports/pipeline";
import { formatDate } from "@/lib/utils";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Download,
  RotateCcw,
  History,
} from "lucide-react";

export default function ImportsPage() {
  const [dragActive, setDragActive] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [csvContent, setCsvContent] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [previewRowCount, setPreviewRowCount] = React.useState(0);

  // Column Mapping State
  const [mapping, setMapping] = React.useState<ImportMapping>({
    firstNameCol: "",
    lastNameCol: "",
    emailCol: "",
    phoneCol: "",
    companyCol: "",
    websiteCol: "",
    notesCol: "",
  });

  const [duplicatePolicy, setDuplicatePolicy] =
    React.useState<DuplicatePolicy>("SKIP");

  // Ingestion State
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [importResult, setImportResult] =
    React.useState<ImportProcessResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Past Import Jobs
  const [recentJobs, setRecentJobs] = React.useState<ImportJobRecord[]>([]);

  React.useEffect(() => {
    let isMounted = true;
    async function loadJobs() {
      try {
        const res = await fetchImportJobsAction();
        if (isMounted && res.jobs) {
          setRecentJobs(res.jobs);
        }
      } catch {
        // Fall back gracefully
      }
    }
    loadJobs();
    return () => {
      isMounted = false;
    };
  }, [importResult]);

  // Auto-detect and suggest column mappings
  const detectMapping = (foundHeaders: string[]): ImportMapping => {
    const findMatch = (patterns: string[]) =>
      foundHeaders.find((h) =>
        patterns.some((p) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === p),
      ) || "";

    return {
      firstNameCol:
        findMatch(["firstname", "first", "name", "fname"]) ||
        foundHeaders[0] ||
        "",
      lastNameCol: findMatch(["lastname", "last", "lname", "surname"]),
      emailCol: findMatch(["email", "emailaddress", "contactemail"]),
      phoneCol: findMatch([
        "phone",
        "phonenumber",
        "mobile",
        "telephone",
        "cell",
      ]),
      companyCol: findMatch([
        "company",
        "companyname",
        "organization",
        "org",
        "agency",
      ]),
      websiteCol: findMatch(["website", "site", "url", "web", "domain"]),
      notesCol: findMatch([
        "notes",
        "note",
        "description",
        "comment",
        "comments",
      ]),
    };
  };

  const handleFileProcess = (selectedFile: File) => {
    setErrorMessage(null);
    setImportResult(null);

    if (selectedFile.size > MAX_CSV_FILE_SIZE) {
      setErrorMessage(
        `File is too large. Maximum allowed size is 10MB (file is ${(
          selectedFile.size /
          (1024 * 1024)
        ).toFixed(1)}MB).`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || text.trim().length === 0) {
        setErrorMessage("The selected CSV file appears to be empty.");
        return;
      }

      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        setErrorMessage(
          "Could not detect valid CSV headers. Please verify the file encoding.",
        );
        return;
      }

      if (parsed.totalRows > MAX_CSV_ROWS) {
        setErrorMessage(
          `CSV contains ${parsed.totalRows} rows, exceeding the 5,000 row batch limit. Please split the file.`,
        );
        return;
      }

      setFile(selectedFile);
      setCsvContent(text);
      setHeaders(parsed.headers);
      setPreviewRowCount(parsed.totalRows);
      setMapping(detectMapping(parsed.headers));
    };

    reader.onerror = () => {
      setErrorMessage("Error reading CSV file. Please try again.");
    };

    reader.readAsText(selectedFile);
  };

  const handleStartIngestion = async () => {
    if (!file || !csvContent) return;

    if (!mapping.firstNameCol) {
      setErrorMessage("Please select a column for First Name.");
      return;
    }

    if (!mapping.emailCol && !mapping.phoneCol) {
      setErrorMessage(
        "Please select at least one contact column (Email or Phone).",
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await initiateCsvImportAction({
        fileName: file.name,
        csvContent,
        mapping,
        duplicatePolicy,
      });

      if (res.success) {
        setImportResult(res.result);
      } else {
        setErrorMessage(res.error);
      }
    } catch {
      setErrorMessage("A server error occurred during CSV batch ingestion.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadFailureReport = () => {
    if (!importResult || importResult.errors.length === 0) return;

    const reportHeaders = ["Row Number", "Error Reason", "Raw Row Data"];
    const lines = [
      reportHeaders.join(","),
      ...importResult.errors.map(
        (err) =>
          `"${err.rowNumber}","${err.error.replace(/"/g, '""')}","${JSON.stringify(err.rawData).replace(/"/g, '""')}"`,
      ),
    ];

    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `import-failures-${importResult.jobId.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllLeads = async () => {
    try {
      const res = await exportLeadsToCsvAction();
      if (res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `leadrescue-export-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Failed to export leads.");
    }
  };

  const resetUpload = () => {
    setFile(null);
    setCsvContent(null);
    setHeaders([]);
    setPreviewRowCount(0);
    setImportResult(null);
    setErrorMessage(null);
  };

  return (
    <DashboardShell isLiveDatabase={true}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                CSV Lead Ingestion & Pipeline
              </h1>
              <Badge variant="success">Active (Phase 6)</Badge>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Upload prospect spreadsheets with automated column mapping,
              duplicate resolution, and per-row error isolation.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAllLeads}
            className="gap-2 self-start sm:self-auto"
          >
            <Download className="h-4 w-4" />
            <span>Export All Leads (CSV)</span>
          </Button>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Import Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* Import Summary Card (Shown when complete) */}
        {importResult && (
          <Card className="border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 animate-in fade-in-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <CardTitle className="text-lg text-emerald-950 dark:text-emerald-100">
                    Import Batch Processed
                  </CardTitle>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  Job #{importResult.jobId.slice(0, 8)}
                </Badge>
              </div>
              <CardDescription>
                Ingestion batch completed with per-row failure isolation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500 block">
                    Total Rows
                  </span>
                  <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {importResult.totalRows}
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 block">
                    Successfully Added
                  </span>
                  <span className="text-2xl font-bold text-emerald-600">
                    {importResult.successfulRows}
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500 block">
                    Skipped (Duplicates)
                  </span>
                  <span className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">
                    {importResult.skippedRows}
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-red-200 dark:border-red-900/50">
                  <span className="text-xs text-red-700 dark:text-red-400 block">
                    Failed / Conflicts
                  </span>
                  <span className="text-2xl font-bold text-red-600">
                    {importResult.failedRows}
                  </span>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {importResult.errors.length} invalid rows were isolated to
                    protect database integrity.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadFailureReport}
                    className="gap-1.5 text-xs text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Failure Report (CSV)</span>
                  </Button>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-emerald-500/20 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={resetUpload}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Import Another File</span>
              </Button>
              <Link href="/dashboard/leads">
                <Button size="sm" className="gap-2">
                  <span>View Pipeline</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {/* Upload Zone & Mapping Wizard */}
        {!importResult && (
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-lg">Upload Agency Leads CSV</CardTitle>
              <CardDescription>
                RFC 4180 format. Maximum file size: 10MB (up to 5,000 rows).
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Drag-and-drop dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileProcess(e.dataTransfer.files[0]);
                  }
                }}
                className={`flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                    : "border-zinc-300 dark:border-zinc-800"
                }`}
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 mb-2">
                  <UploadCloud className="h-5 w-5" />
                </div>

                {file ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      <span>{file.name}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {(file.size / 1024).toFixed(1)} KB · {previewRowCount}{" "}
                      rows ready for mapping
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Drag and drop your agency CSV here, or browse files
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      UTF-8 encoded files only
                    </p>
                  </div>
                )}

                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileProcess(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="csv-file-input" className="mt-3">
                  <span className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    {file ? "Choose different file" : "Browse CSV File"}
                  </span>
                </label>
              </div>

              {/* Column Mapping Wizard */}
              {headers.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in-50">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Step 2: Map Columns to Lead Fields
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Confirm which columns match your agency prospect records.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="firstNameCol"
                        className="text-xs font-medium"
                      >
                        First Name <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id="firstNameCol"
                        value={mapping.firstNameCol}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            firstNameCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- Select Header --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="lastNameCol"
                        className="text-xs font-medium"
                      >
                        Last Name (Optional)
                      </Label>
                      <select
                        id="lastNameCol"
                        value={mapping.lastNameCol || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            lastNameCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- None --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="emailCol" className="text-xs font-medium">
                        Email Address
                      </Label>
                      <select
                        id="emailCol"
                        value={mapping.emailCol || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            emailCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- None --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="phoneCol" className="text-xs font-medium">
                        Phone Number
                      </Label>
                      <select
                        id="phoneCol"
                        value={mapping.phoneCol || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            phoneCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- None --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="companyCol"
                        className="text-xs font-medium"
                      >
                        Company Name
                      </Label>
                      <select
                        id="companyCol"
                        value={mapping.companyCol || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            companyCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- None --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="websiteCol"
                        className="text-xs font-medium"
                      >
                        Website URL
                      </Label>
                      <select
                        id="websiteCol"
                        value={mapping.websiteCol || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            websiteCol: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">-- None --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Deduplication Strategy Selector */}
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Step 3: Deduplication Strategy
                    </h4>
                    <p className="text-xs text-zinc-500 mb-3">
                      How to handle rows matching existing active leads by
                      email:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <label
                        className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                          duplicatePolicy === "SKIP"
                            ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="duplicatePolicy"
                            checked={duplicatePolicy === "SKIP"}
                            onChange={() => setDuplicatePolicy("SKIP")}
                          />
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Skip (Default)
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 mt-1 pl-5">
                          Discard row; keep existing lead unmodified.
                        </span>
                      </label>

                      <label
                        className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                          duplicatePolicy === "UPDATE"
                            ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="duplicatePolicy"
                            checked={duplicatePolicy === "UPDATE"}
                            onChange={() => setDuplicatePolicy("UPDATE")}
                          />
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Update
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 mt-1 pl-5">
                          Enrich empty fields on existing prospect.
                        </span>
                      </label>

                      <label
                        className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                          duplicatePolicy === "CONFLICT_REPORT"
                            ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="duplicatePolicy"
                            checked={duplicatePolicy === "CONFLICT_REPORT"}
                            onChange={() =>
                              setDuplicatePolicy("CONFLICT_REPORT")
                            }
                          />
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Report Conflict
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 mt-1 pl-5">
                          Flag row in error report for manual review.
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <span className="text-xs text-zinc-400">
                Formula injection defense active: cells starting with =, +, -, @
                are safely neutralized.
              </span>
              <Button
                onClick={handleStartIngestion}
                disabled={isProcessing || !file || headers.length === 0}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    <span>Processing Batch...</span>
                  </>
                ) : (
                  <>
                    <span>Start Ingestion</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Recent Import Jobs History */}
        {recentJobs.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-zinc-500" />
                  <span>Recent Import Activity</span>
                </CardTitle>
                <CardDescription>
                  Previous batch ingestion jobs and row counts.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead className="text-right">
                      Success / Total
                    </TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium text-xs">
                        {job.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === "COMPLETED"
                              ? "success"
                              : job.status === "FAILED"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 uppercase">
                        {job.duplicatePolicy}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        <span className="text-emerald-600 font-semibold">
                          {job.successfulRows}
                        </span>
                        {" / "}
                        {job.totalRows}
                      </TableCell>
                      <TableCell className="text-xs text-right text-zinc-400">
                        {formatDate(job.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
