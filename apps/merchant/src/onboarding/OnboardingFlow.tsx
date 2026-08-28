import { useEffect, useState } from 'react';
import { deriveSegmentModules, SITE_ONLY_MODULES } from '@nexoio/core';
import { api, ApiError } from '../lib/api';
import { WelcomePage } from './pages/WelcomePage';
import { ProductModePage } from './pages/ProductModePage';
import { BusinessTypePage } from './pages/BusinessTypePage';
import { BusinessInfoPage } from './pages/BusinessInfoPage';
import { SegmentSetupPage } from './pages/SegmentSetupPage';
import { TeamSetupPage } from './pages/TeamSetupPage';
import { FinishPage } from './pages/FinishPage';
import type { OnboardingData, StepProps } from './types';
import './onboarding.css';

const storageKey='nexoio:onboarding:v2';
const initial:OnboardingData={productMode:'full_system',answers:{},displayName:'',legalName:'',segment:'other',documentNumber:'',phone:'',email:'',city:'',state:'',timezone:'America/Sao_Paulo',slug:'',moduleKeys:[],inviteEmail:''};

export function OnboardingFlow(){
  const[saved]=useState(()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null')as{step:number;data:OnboardingData}|null}catch{return null}});
  const[step,setStep]=useState(saved?.step??0);const[data,setData]=useState<OnboardingData>(()=>saved?.data?{...initial,...saved.data,answers:saved.data.answers??{}}:initial);const[error,setError]=useState('');
  const pages=data.productMode==='site_only'?[WelcomePage,ProductModePage,BusinessTypePage,BusinessInfoPage,FinishPage]:[WelcomePage,ProductModePage,BusinessTypePage,SegmentSetupPage,BusinessInfoPage,TeamSetupPage,FinishPage];
  useEffect(()=>localStorage.setItem(storageKey,JSON.stringify({step,data})),[step,data]);
  const update=(values:Partial<OnboardingData>)=>setData(current=>({...current,...values}));
  const finish=async()=>{try{const payload={productMode:data.productMode,displayName:data.displayName,segment:data.segment,city:data.city,state:data.state,timezone:data.timezone,slug:data.slug,answers:data.answers,moduleKeys:data.productMode==='site_only'?SITE_ONLY_MODULES:deriveSegmentModules(data.segment,data.answers),...(data.legalName.trim()?{legalName:data.legalName.trim()}:{}),...(data.documentNumber.trim()?{documentNumber:data.documentNumber.trim()}:{}),...(data.phone.trim()?{phone:data.phone.trim()}:{}),...(data.email.trim()?{email:data.email.trim()}:{}),};await api.post('/api/v1/platform/onboarding/business',payload);localStorage.removeItem(storageKey);localStorage.removeItem('nexoio:onboarding:v1');location.assign('/')}catch(reason){setError(reason instanceof ApiError?reason.message:'Não foi possível criar a empresa')}};
  const Page=pages[step]??FinishPage;
  const props:StepProps={data,update,next:()=>step===pages.length-1?void finish():setStep(current=>Math.min(pages.length-1,current+1)),back:()=>setStep(current=>Math.max(0,current-1))};
  return <>{error?<div className="toast" role="alert">{error}</div>:null}<Page {...props}/></>;
}
