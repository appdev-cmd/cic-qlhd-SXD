import React,{useEffect,useState} from 'react';
import {CatalogEditor,CatalogHistory} from './CatalogEditor';
import {apiRequest,type Page} from '../../services/apiClient';
import {DossierGrid,type GridColumn} from './DossierGrid';
import {EntityLink} from '../ui/EntityLink';
import {SearchableSelect} from '../ui/SearchableSelect';
import {GridToolbar,GridSearchInput,GridCount} from '../ui/grid/GridToolbar';
import {useFilterState} from '../../hooks/useFilterState';
import {formatDate,formatCurrency} from '../../lib/utils';

type Row={id:string;[key:string]:any};
const names:Record<string,string>={organizations:'Tổ chức tham gia',personnel:'Cá nhân hành nghề',material_prices:'Giá vật liệu'};
const labels:Record<string,string>={investor:'Chủ đầu tư',consultant_design:'Tư vấn thiết kế',consultant_audit:'Tư vấn thẩm tra',contractor:'Nhà thầu',supervisor:'Tư vấn giám sát',hieu_luc:'Còn hiệu lực',sap_het_han:'Sắp hết hạn',het_han:'Hết hạn',tam_dung:'Tạm dừng',thu_hoi:'Thu hồi',active:'Hoạt động',suspended:'Tạm dừng'};
const button='rounded-lg border border-border dark:border-border bg-surface dark:bg-surface text-ink dark:text-ink px-3 py-2 text-sm disabled:opacity-50';
export function CatalogPage({kind}:{kind:'organizations'|'personnel'|'material_prices'}){
  const [editing,setEditing]=useState<Row|null|undefined>(undefined),[history,setHistory]=useState<Row|null>(null);
  const [filters,setFilters]=useFilterState('catalog-'+kind,{search:'',category:'all',status:'all',sort:kind==='personnel'?'full_name':'name',direction:'asc'});
  const [offset,setOffset]=useState(0);const [version,setVersion]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [data,setData]=useState<(Page<Row>&{categories:string[];statuses:string[];canEdit?:boolean})|null>(null);
  useEffect(()=>setOffset(0),[JSON.stringify(filters)]);
  useEffect(()=>{let active=true;setBusy(true);setError('');const timer=setTimeout(()=>{
    apiRequest<Page<Row>&{categories:string[];statuses:string[]}>('/catalog/'+kind+'?'+new URLSearchParams({...filters,offset:String(offset)})).then(p=>{if(active)setData(p);}).catch(e=>{if(active){setError(e.message);setData(null);}}).finally(()=>{if(active)setBusy(false);});
  },180);return()=>{active=false;clearTimeout(timer);};},[kind,JSON.stringify(filters),offset,version]);
  const columns:GridColumn<Row>[]=[{label:'Mã',sortKey:'code',value:r=>r.code||'—',width:120},
    {label:kind==='personnel'?'Họ và tên':'Tên',sortKey:kind==='personnel'?'full_name':'name',value:r=>r.full_name||r.name,width:300,render:r=>kind==='material_prices'?r.name:<EntityLink type={kind==='organizations'?'organization':'personnel'} id={r.id} name={r.full_name||r.name}/>}];
  if(kind==='material_prices')columns.push(...[
    {label:'Đơn vị',sortKey:'unit',value:(r:Row)=>r.unit||'—',width:100},
    {label:'Giá công bố',sortKey:'standard_price',value:(r:Row)=>Number(r.standard_price||0),render:(r:Row)=>r.standard_price==null?'Chưa có':formatCurrency(Number(r.standard_price))},
    {label:'Giá thị trường',sortKey:'market_price',value:(r:Row)=>Number(r.market_price||0),render:(r:Row)=>r.market_price==null?'Chưa có':formatCurrency(Number(r.market_price))},
    {label:'Địa bàn',sortKey:'region',value:(r:Row)=>r.region||'—'},
    {label:'Kỳ công bố',sortKey:'period',value:(r:Row)=>r.period||'—'},
    {label:'Nhà cung cấp',sortKey:'supplier',value:(r:Row)=>r.supplier||'—'},
  ]);else columns.push(...[
    {label:kind==='organizations'?'Loại tổ chức':'Đơn vị',sortKey:kind==='organizations'?'type':'org_name',value:(r:Row)=>labels[r.type]||r.org_name||r.type||'—',render:(r:Row)=>kind==='personnel'&&r.org_id?<EntityLink type="organization" id={r.org_id} name={r.org_name||'Xem đơn vị'}/>:labels[r.type]||r.org_name||r.type||'—',width:220},
    {label:'Chứng chỉ',sortKey:'cert_number',value:(r:Row)=>r.cert_number||'Chưa ghi nhận'},
    {label:'Hạng',sortKey:'cert_grade',value:(r:Row)=>r.cert_grade||'—',width:90},
    {label:'Hết hạn',sortKey:'cert_expiry',value:(r:Row)=>r.cert_expiry||'',render:(r:Row)=>r.cert_expiry?formatDate(r.cert_expiry):'Chưa ghi nhận'},
    {label:'Trạng thái ghi nhận',sortKey:'status',value:(r:Row)=>labels[r.status]||r.status||'Chưa xác định'},
  ]);
  columns.push({label:'Thao tác',value:r=>r.code||'',width:170,render:r=><div className="flex gap-2">{data?.canEdit&&<button className={button} onClick={()=>setEditing(r)}>Sửa</button>}<button className={button} onClick={()=>setHistory(r)}>Lịch sử</button></div>});
  return <div className="space-y-5 text-ink dark:text-ink"><h1 className="text-2xl font-bold">{names[kind]}</h1>
    <p className="text-sm text-ink-muted dark:text-ink-muted">Dữ liệu Supabase trong phạm vi quyền truy cập. {kind==='material_prices'?'Đối chiếu văn bản công bố và kỳ giá trước khi sử dụng; chưa kết nối tự động với nguồn công bố giá.':'Thông tin chứng chỉ cần được đối chiếu nguồn cấp trước khi xác nhận năng lực.'}</p>
    <GridToolbar
      search={<GridSearchInput value={filters.search} onChange={search=>setFilters({...filters,search})} label="Tìm danh mục" placeholder="Tìm tên, mã, chứng chỉ…"/>}
      classification={<div className="w-48"><SearchableSelect value={filters.category} onChange={category=>setFilters({...filters,category})} options={[{value:'all',label:'Tất cả phân loại'},...(data?.categories||[]).map(value=>({value,label:labels[value]||value}))]}/></div>}
      status={<div className="w-48"><SearchableSelect value={filters.status} onChange={status=>setFilters({...filters,status})} options={[{value:'all',label:kind==='material_prices'?'Tất cả kỳ giá':'Tất cả trạng thái'},...(data?.statuses||[]).map(value=>({value,label:labels[value]||value}))]}/></div>}
      onReset={()=>{setFilters({...filters,search:'',category:'all',status:'all'});setOffset(0);}}
      count={data&&<GridCount total={data.total}/>}
      actions={<><button className={button} disabled={busy} onClick={()=>setVersion(n=>n+1)}>Tải lại</button>
        {data?.canEdit&&<button className={button+' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'} onClick={()=>setEditing(null)}>Thêm mới</button>}</>}
    />
{error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    <p role="status" className="text-sm text-ink-muted dark:text-ink-muted">{busy?'Đang tải…':`${data?.total||0} bản ghi · Trang ${offset/50+1}`}</p>
    <DossierGrid storageKey={'catalog-'+kind} columns={columns} rows={data?.items||[]} serverSort={{key:filters.sort,direction:filters.direction}} onSort={(sort,direction)=>setFilters({...filters,sort,direction})}/>
    <div className="flex gap-3"><button className={button} disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Trang trước</button><button className={button} disabled={busy||offset+50>=(data?.total||0)} onClick={()=>setOffset(offset+50)}>Trang sau</button></div>
    {editing!==undefined&&<CatalogEditor kind={kind} row={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);setVersion(n=>n+1);}}/>}
    {history&&<CatalogHistory kind={kind} row={history} onClose={()=>setHistory(null)}/>}
  </div>;
}
