begin;
-- The existing assistant RPC writes this feature; preserve its audit semantics.
alter table public.ai_logs drop constraint ai_logs_feature_check;
alter table public.ai_logs add constraint ai_logs_feature_check check (
 feature in ('legal_qa','compliance_check','cost_check','document_draft','completeness_check','bim_assistant')
);
commit;
