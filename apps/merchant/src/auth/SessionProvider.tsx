import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { SEGMENT_MODULES, type BusinessSegment } from '@nexoio/core';
import { PERMISSIONS } from '@nexoio/permissions';
import { api, ApiError } from '../lib/api';

export type Membership={businessId:string;businessName:string;segment:string;status:string;roleId:string;roleCode:string};
export type SessionContextValue={loading:boolean;refreshing:boolean;user:null|{id:string;name:string;email:string};memberships:Membership[];activeBusiness:Membership|null;permissions:Set<string>;modules:Set<string>;onboardingRequired:boolean;error:string|null;refresh:()=>Promise<void>;selectBusiness:(id:string)=>Promise<void>;logout:()=>Promise<void>};
type ContextResponse={data:{user:{id:string;name:string;email:string};memberships:Membership[];activeBusiness:Membership|null;permissions:string[];modules:string[];onboardingRequired:boolean}};
type State=Omit<SessionContextValue,'refresh'|'selectBusiness'|'logout'>;
const SessionContext=createContext<SessionContextValue|null>(null);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export function SessionProvider({children}:PropsWithChildren){
  const[state,setState]=useState<State>({loading:true,refreshing:false,user:null,memberships:[],activeBusiness:null,permissions:new Set(),modules:new Set(),onboardingRequired:false,error:null});
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false},[]);

  const refresh=useCallback(async()=>{
    setState(current=>({...current,loading:current.user===null,refreshing:current.user!==null,error:null}));
    let lastError:unknown=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const response=await api.get<ContextResponse>('/api/v1/platform/context',{force:attempt>0,ttlMs:5000});
        const owner=response.data.activeBusiness?.roleCode==='owner';
        const segment=response.data.activeBusiness?.segment as BusinessSegment|undefined;
        const modules=response.data.modules.length?response.data.modules:(owner&&segment?SEGMENT_MODULES[segment]:[]);
        const permissions=response.data.permissions.length?response.data.permissions:(owner?[...PERMISSIONS]:[]);
        if(mounted.current)setState({loading:false,refreshing:false,user:response.data.user,memberships:response.data.memberships,activeBusiness:response.data.activeBusiness,permissions:new Set(permissions),modules:new Set(modules),onboardingRequired:response.data.onboardingRequired,error:null});
        return;
      }catch(reason){
        lastError=reason;
        if(!(reason instanceof ApiError&&reason.code==='PROFILE_NOT_READY')||attempt===3)break;
        await sleep([150,350,700][attempt]??700);
      }
    }
    if(mounted.current)setState(current=>({...current,loading:false,refreshing:false,user:current.user,error:lastError instanceof ApiError?lastError.message:'Falha ao carregar sessão'}));
  },[]);

  useEffect(()=>{void refresh()},[refresh]);
  const selectBusiness=useCallback(async(id:string)=>{await api.post('/api/v1/platform/businesses/select',{businessId:id});await refresh()},[refresh]);
  const logout=useCallback(async()=>{await api.post('/api/auth/sign-out');api.invalidate();location.assign('/login')},[]);
  const value=useMemo(()=>({...state,refresh,selectBusiness,logout}),[state,refresh,selectBusiness,logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(){const value=useContext(SessionContext);if(!value)throw new Error('useSession must be used inside SessionProvider');return value}
