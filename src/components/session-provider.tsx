'use client';
import {createContext,useContext,useEffect,useState,useCallback,type ReactNode} from 'react';
import {useI18n} from './language-provider';
import {api,setDisplayCurrency} from '@/lib/client';
export type SessionUser={id:string;name:string;email:string;role:'ADMIN'|'MANAGER'|'STAFF'};
type Session={user:SessionUser|null;loading:boolean;store:{storeName:string;currency:string};refresh:()=>Promise<void>};
const Context=createContext<Session>({user:null,loading:true,store:{storeName:'Sri Lakshmi Supermarket',currency:'INR'},refresh:async()=>{}});
export function SessionProvider({children}:{children:ReactNode}){const {setCurrency}=useI18n();const [user,setUser]=useState<SessionUser|null>(null);const [loading,setLoading]=useState(true);const[store,setStore]=useState({storeName:'Sri Lakshmi Supermarket',currency:'INR'});const refresh=useCallback(async()=>{try{const result=await api<{user:SessionUser;store?:{storeName:string;currency:string}}>('auth/me');setUser(result.user);if(result.store){setStore(result.store);setDisplayCurrency(result.store.currency);setCurrency(result.store.currency)}}catch{setUser(null)}finally{setLoading(false)}},[setCurrency]);useEffect(()=>{void refresh()},[refresh]);return <Context.Provider value={{user,loading,store,refresh}}>{children}</Context.Provider>}
export const useSession=()=>useContext(Context);

