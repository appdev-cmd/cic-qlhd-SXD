import { useEffect,useState } from 'react';
export function useFilterState<T>(key:string,initial:T){
  const [value,setValue]=useState<T>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null')??initial;}catch{return initial;}});
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}},[key,value]);
  return [value,setValue] as const;
}
