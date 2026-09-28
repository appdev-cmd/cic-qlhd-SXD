import type { Project,ProjectTT39Data } from '../data/mockData';
import { apiRequest,type Page } from './apiClient';

export function mapProject(row:Record<string,any>):Project{
  if('name' in row && 'projectGroup' in row)return row as Project;
  const group=String(row.group_type??'').replace(/^Nhóm\s*/i,'');
  const grade=String(row.grade??'').replace(/^Cấp\s*/i,'');
  return {
    id:row.id,code:row.code,name:row.title,coverImage:row.thumbnail_url||undefined,
    images:Array.isArray(row.images)?row.images:[],investorId:row.investor_id,
    investorName:row.investor_name||'Chưa xác định',location:row.location_district||'Chưa xác định',
    projectGroup:(['A','B','C','QG'].includes(group)?group:null) as Project['projectGroup'],
    buildingGrade:(['I','II','III','IV','DB'].includes(grade)?grade:null) as Project['buildingGrade'],
    totalInvestment:row.investment_cost==null?null:Number(row.investment_cost),
    stage:row.stage,slaStatus:row.sla_status,submissionDate:row.submission_date||'',deadlineDate:row.deadline||'',
    assignee:row.lead_reviewer_name||'Chưa phân công',department:row.department||'',
    planningCompliance:row.planning_compliance??null,standardCompliance:row.standard_compliance??null,
    fireSafetyStatus:row.fire_safety_status??null,estimatedSavings:row.estimated_savings==null?null:Number(row.estimated_savings),
    contractors:Array.isArray(row.contractors)?row.contractors:[],
  };
}
export const projectService={
  async list(options:{search?:string;offset?:number;limit?:number;stage?:string;group?:string;status?:string;sort?:string;direction?:string}={}):Promise<Page<Project>>{
    const query=new URLSearchParams();Object.entries(options).forEach(([k,v])=>{if(v!==undefined&&v!==''&&v!=='all')query.set(k,String(v));});
    const page=await apiRequest<Page<Record<string,any>>>('/projects?'+query);
    return {...page,items:page.items.map(mapProject)};
  },
  async getById(id:string):Promise<Project>{return mapProject(await apiRequest('/projects/'+encodeURIComponent(id)));},
  async getAll():Promise<Project[]>{
    const rows:Project[]=[];let offset=0;
    while(true){const page=await projectService.list({offset,limit:100});rows.push(...page.items);offset+=page.items.length;if(offset>=page.total||!page.items.length)return rows;}
  },
  async getTT39Data(project:Project):Promise<ProjectTT39Data|null>{
    const row=await apiRequest<Record<string,any>>('/projects/'+encodeURIComponent(project.id));
    return row.tt39_data??null;
  },
};
