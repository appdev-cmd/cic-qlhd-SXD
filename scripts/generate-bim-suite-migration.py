"""Adapt the complete upstream BIM migrations to the SXD project bridge."""
from pathlib import Path
import re
import sys
source=Path(sys.argv[1])/'supabase/migrations'
target=Path(sys.argv[2])
mapping={
 'document_projects':'sxd_bim_projects','document_project_members':'sxd_bim_project_members',
 'appraisal_organizations':'sxd_bim_organizations','appraisal_project_profiles':'sxd_bim_project_profiles',
 'documents':'sxd_bim_documents','document_versions':'sxd_bim_document_versions','workspace_tasks':'sxd_bim_workspace_tasks',
}
chunks=[Path('supabase/bim-suite-bridge.sql').read_text(encoding='utf-8')]
files=sorted(source.glob('20261027*bim*.sql'))+[source/'20261028150000_bim_browser_converter.sql']
for f in files:
 s=f.read_text(encoding='utf-8')
 for old,new in mapping.items():s=re.sub(r'public\.'+old+r'\b','public.'+new,s)
 s=s.replace('document_private.','sxd_bim_document_private.').replace('appraisal_private.','sxd_bim_appraisal_private.')
 s=s.replace('assistant_private.fold(p)',"public.f_unaccent(lower(coalesce(p,'')))")
 chunks.append('-- Upstream: '+f.name+'\n'+s)
target.write_text('\n'.join(chunks),encoding='utf-8')
print('Generated',target,'from',len(files),'source migrations')
