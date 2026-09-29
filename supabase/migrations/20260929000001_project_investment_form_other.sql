-- Projects funded by other lawful sources (religious works, community contributions) are neither
-- public investment, PPP nor business investment; permit authority and exemptions differ (Điều 43 Luật 135/2025).
alter table public.projects drop constraint if exists projects_investment_form_check;
alter table public.projects add constraint projects_investment_form_check
  check (investment_form = any (array['dau_tu_cong'::text, 'ppp'::text, 'kinh_doanh'::text, 'khac'::text]));
