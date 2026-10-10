'use client';
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/client';
export function useResource<T>(path:string|null){const[data,setData]=useState<T|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[revision,setRevision]=useState(0);const refresh=useCallback(()=>setRevision(x=>x+1),[]);useEffect(()=>{if(!path){setLoading(false);return}const controller=new AbortController();setLoading(true);setError('');api<T>(path,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[path,revision]);return {data,loading,error,refresh}}
