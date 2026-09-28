-- SLA facts live in appraisal_cases.payload->'sla' (computed by the backend on every save).
-- Index the due date so list filters/sorts by deadline stay database-side.
create index if not exists appraisal_sla_due_page
  on public.appraisal_cases (province_id, department, ((payload->'sla'->>'dueDate')), id);
