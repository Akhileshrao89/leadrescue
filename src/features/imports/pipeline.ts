import { SupabaseClient } from "@supabase/supabase-js";
import { LeadStage } from "@/features/leads/types";

export type DuplicatePolicy = "SKIP" | "UPDATE" | "CONFLICT_REPORT";

export interface ImportMapping {
  firstNameCol: string;
  lastNameCol?: string;
  emailCol?: string;
  phoneCol?: string;
  companyCol?: string;
  websiteCol?: string;
  notesCol?: string;
  sourceCol?: string;
  stageCol?: string;
  nextFollowUpCol?: string;
}

export interface ImportRowFailure {
  rowNumber: number;
  error: string;
  rawData: Record<string, string>;
}

export interface ImportProcessResult {
  jobId: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  errors: ImportRowFailure[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a single mapped CSV row.
 * Invariant: Must have a first name and at least one contact method (email or phone).
 */
export function validateImportRow(
  row: Record<string, string>,
  mapping: ImportMapping,
): { valid: boolean; error?: string } {
  const firstName = mapping.firstNameCol
    ? row[mapping.firstNameCol]?.trim()
    : "";
  if (!firstName) {
    return { valid: false, error: "Missing required field: First Name" };
  }

  const email = mapping.emailCol ? row[mapping.emailCol]?.trim() : "";
  const phone = mapping.phoneCol ? row[mapping.phoneCol]?.trim() : "";

  if (!email && !phone) {
    return {
      valid: false,
      error: "At least one contact method (email or phone) is required",
    };
  }

  if (email && !EMAIL_REGEX.test(email)) {
    return { valid: false, error: `Invalid email address format: "${email}"` };
  }

  return { valid: true };
}

/**
 * Bounded batch ingestion worker. Processes parsed CSV rows with per-row failure isolation
 * and selected duplicate resolution policy (SKIP, UPDATE, CONFLICT_REPORT).
 */
export async function executeCsvIngestion(params: {
  supabase: SupabaseClient;
  jobId: string;
  workspaceId: string;
  userId: string;
  rows: Record<string, string>[];
  mapping: ImportMapping;
  duplicatePolicy: DuplicatePolicy;
}): Promise<ImportProcessResult> {
  const {
    supabase,
    jobId,
    workspaceId,
    userId,
    rows,
    mapping,
    duplicatePolicy,
  } = params;

  let successfulRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  const errors: ImportRowFailure[] = [];

  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const rowNumber = i + j + 2; // 1-indexed, accounting for header row

      // 1. Row Validation
      const validation = validateImportRow(row, mapping);
      if (!validation.valid) {
        failedRows++;
        const failure: ImportRowFailure = {
          rowNumber,
          error: validation.error || "Validation failed",
          rawData: row,
        };
        errors.push(failure);

        await supabase.from("import_row_results").insert({
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: row,
          error_message: failure.error,
        });
        continue;
      }

      const firstName = row[mapping.firstNameCol].trim();
      const lastName = mapping.lastNameCol
        ? row[mapping.lastNameCol]?.trim() || null
        : null;
      const email = mapping.emailCol
        ? row[mapping.emailCol]?.trim().toLowerCase() || null
        : null;
      const phone = mapping.phoneCol
        ? row[mapping.phoneCol]?.trim() || null
        : null;
      const companyName = mapping.companyCol
        ? row[mapping.companyCol]?.trim() || null
        : null;
      const website = mapping.websiteCol
        ? row[mapping.websiteCol]?.trim() || null
        : null;
      const notes = mapping.notesCol
        ? row[mapping.notesCol]?.trim() || null
        : null;
      const source = mapping.sourceCol
        ? row[mapping.sourceCol]?.trim() || "csv_import"
        : "csv_import";
      const rawStage = mapping.stageCol
        ? row[mapping.stageCol]?.trim().toUpperCase()
        : "NEW";
      const validStages: LeadStage[] = [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "PROPOSAL",
        "WON",
        "LOST",
      ];
      const stage: LeadStage = validStages.includes(rawStage as LeadStage)
        ? (rawStage as LeadStage)
        : "NEW";

      let nextFollowUpAt: string | null = null;
      if (mapping.nextFollowUpCol && row[mapping.nextFollowUpCol]?.trim()) {
        const parsedDate = new Date(row[mapping.nextFollowUpCol].trim());
        if (!isNaN(parsedDate.getTime())) {
          nextFollowUpAt = parsedDate.toISOString();
        }
      }

      // 2. Duplicate Detection
      let existingLeadId: string | null = null;
      if (email) {
        const { data: existing } = await supabase
          .from("leads")
          .select("id, phone, company_name, website, notes, next_follow_up_at")
          .eq("workspace_id", workspaceId)
          .eq("is_archived", false)
          .ilike("email", email)
          .limit(1)
          .single();

        if (existing) {
          existingLeadId = existing.id;
        }
      }

      if (existingLeadId) {
        if (duplicatePolicy === "SKIP") {
          skippedRows++;
          continue;
        } else if (duplicatePolicy === "CONFLICT_REPORT") {
          failedRows++;
          const failure: ImportRowFailure = {
            rowNumber,
            error: `Conflict: Active lead with email "${email}" already exists.`,
            rawData: row,
          };
          errors.push(failure);

          await supabase.from("import_row_results").insert({
            import_job_id: jobId,
            row_number: rowNumber,
            raw_data: row,
            error_message: failure.error,
          });
          continue;
        } else if (duplicatePolicy === "UPDATE") {
          // Update existing lead with non-blank imported fields
          const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (phone) updateData.phone = phone;
          if (companyName) updateData.company_name = companyName;
          if (website) updateData.website = website;
          if (notes) updateData.notes = notes;
          if (nextFollowUpAt) updateData.next_follow_up_at = nextFollowUpAt;

          const { error: updateError } = await supabase
            .from("leads")
            .update(updateData)
            .eq("id", existingLeadId)
            .eq("workspace_id", workspaceId);

          if (updateError) {
            failedRows++;
            const failure: ImportRowFailure = {
              rowNumber,
              error: `Update failed: ${updateError.message}`,
              rawData: row,
            };
            errors.push(failure);
            await supabase.from("import_row_results").insert({
              import_job_id: jobId,
              row_number: rowNumber,
              raw_data: row,
              error_message: failure.error,
            });
          } else {
            successfulRows++;
            await supabase.from("lead_activities").insert({
              workspace_id: workspaceId,
              lead_id: existingLeadId,
              user_id: userId,
              type: "IMPORTED",
              details: {
                action: "Updated via CSV import",
                import_job_id: jobId,
                row_number: rowNumber,
              },
            });
          }
          continue;
        }
      }

      // 3. Insert New Lead
      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          company_name: companyName,
          website,
          stage,
          source,
          notes,
          next_follow_up_at: nextFollowUpAt,
          assigned_user_id: userId,
        })
        .select("id")
        .single();

      if (insertError || !newLead) {
        failedRows++;
        const failure: ImportRowFailure = {
          rowNumber,
          error: insertError?.message || "Failed to insert lead",
          rawData: row,
        };
        errors.push(failure);

        await supabase.from("import_row_results").insert({
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: row,
          error_message: failure.error,
        });
      } else {
        successfulRows++;
        await supabase.from("lead_activities").insert({
          workspace_id: workspaceId,
          lead_id: newLead.id,
          user_id: userId,
          type: "IMPORTED",
          details: {
            import_job_id: jobId,
            row_number: rowNumber,
            source_file: "csv",
          },
        });
      }
    }

    // Yield execution to prevent event loop starvation during large batch imports
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Update import_jobs record with final counts and status
  const finalStatus =
    failedRows > 0 && successfulRows === 0 ? "FAILED" : "COMPLETED";

  await supabase
    .from("import_jobs")
    .update({
      status: finalStatus,
      processed_rows: rows.length,
      successful_rows: successfulRows,
      failed_rows: failedRows,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return {
    jobId,
    totalRows: rows.length,
    processedRows: rows.length,
    successfulRows,
    failedRows,
    skippedRows,
    errors,
  };
}
