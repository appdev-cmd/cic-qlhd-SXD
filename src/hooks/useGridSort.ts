import { useMemo } from 'react';
import { useFilterState } from './useFilterState';
export function useGridSort<T>(key:string,rows:T[],columns:{value:(r:T)=>string|number}[]){
  const [sort,setSort]=useFilterState(key,{column:0,descending:false});
  const sorted=useMemo(()=>[...rows].sort((a,b)=>{const get=columns[sort.column]?.value;if(!get)return 0;const x=get(a),y=get(b);const v=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'vi',{numeric:true});return sort.descending?-v:v;}),[rows,columns,sort]);
  return {sorted,sort,toggle:(column:number)=>setSort({column,descending:sort.column===column?!sort.descending:false})};
}
