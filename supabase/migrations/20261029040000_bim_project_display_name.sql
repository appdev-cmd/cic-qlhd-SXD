-- Keep transfer provenance in metadata, without including it in the project display name.
update public.projects
set title = 'Mô hình BIM NOXH HVT'
where code = 'BIM-QA-NOXH-HVT'
  and title = 'Mô hình BIM NOXH HVT — chuyển từ qa-si-xd';

update public.sxd_bim_projects b
set name = p.title
from public.projects p
where b.target_project_id = p.id
  and p.code = 'BIM-QA-NOXH-HVT'
  and b.name = 'Mô hình BIM NOXH HVT — chuyển từ qa-si-xd';
