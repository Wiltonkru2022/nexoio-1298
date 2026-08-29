export type ApiErrorCode='UNAUTHORIZED'|'FORBIDDEN'|'MODULE_DISABLED'|'BUSINESS_NOT_FOUND'|'VALIDATION_ERROR'|'RATE_LIMITED'|'SESSION_EXPIRED'|string;
export class ApiError extends Error{constructor(public code:ApiErrorCode,message:string,public status:number,public details?:unknown){super(message)}}
const baseUrl=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,'')??'http://localhost:8787';
const publicPaths=new Set(['/login','/cadastro','/esqueci-senha','/redefinir-senha','/verificar-email','/mfa','/recuperar-mfa','/convite','/aceitar-convite','/sessao-expirada','/403']);
const translatedErrors:Record<string,string>={PASSWORD_TOO_SHORT:'A senha precisa ter pelo menos 12 caracteres.',INVALID_TOKEN:'O link expirou ou já foi utilizado.',PASSWORD_COMPROMISED:'Escolha uma senha diferente e mais segura.',INVALID_PASSWORD:'Senha incorreta.',USER_NOT_FOUND:'Conta não encontrada.',EMAIL_NOT_VERIFIED:'Confirme seu e-mail para continuar.'};

type CacheEntry={value:unknown;expiresAt:number};
const getCache=new Map<string,CacheEntry>();
const inflightGet=new Map<string,Promise<unknown>>();
const DEFAULT_GET_TTL=15000;

function clearGetCache(){getCache.clear();inflightGet.clear()}

export function navigate(path:string,replace=false){
  if(`${location.pathname}${location.search}`===path)return;
  if(replace)history.replaceState({},'',path);else history.pushState({},'',path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function apiRequest<T>(path:string,options:RequestInit&{timeoutMs?:number}={}):Promise<T>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),options.timeoutMs??12000);
  const isForm=typeof FormData!=='undefined'&&options.body instanceof FormData;
  try{
    const response=await fetch(`${baseUrl}${path}`,{...options,credentials:'include',signal:controller.signal,headers:{accept:'application/json',...(options.body&&!isForm?{'content-type':'application/json'}:{}),...options.headers}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const value=payload as{code?:string;message?:string;error?:{code?:string;message?:string;details?:unknown}};
      const code=value.error?.code??value.code??(response.status===401?'UNAUTHORIZED':'REQUEST_FAILED');
      if(!publicPaths.has(location.pathname)&&code==='SESSION_EXPIRED')navigate('/sessao-expirada',true);
      throw new ApiError(code,translatedErrors[code]??value.error?.message??value.message??'Não foi possível concluir a solicitação.',response.status,value.error?.details);
    }
    return payload as T;
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new ApiError('REQUEST_TIMEOUT','A solicitação demorou demais. Tente novamente.',408);
    throw error;
  }finally{clearTimeout(timeout)}
}

async function getCached<T>(path:string,ttlMs=DEFAULT_GET_TTL,force=false):Promise<T>{
  const now=Date.now();
  const cached=getCache.get(path);
  if(!force&&cached&&cached.expiresAt>now)return cached.value as T;
  const running=inflightGet.get(path);
  if(!force&&running)return running as Promise<T>;
  const request=apiRequest<T>(path).then(value=>{getCache.set(path,{value,expiresAt:Date.now()+ttlMs});return value}).finally(()=>inflightGet.delete(path));
  inflightGet.set(path,request as Promise<unknown>);
  return request;
}

async function mutate<T>(path:string,options:RequestInit&{timeoutMs?:number}):Promise<T>{
  const result=await apiRequest<T>(path,options);
  clearGetCache();
  return result;
}

export const api={
  get:<T>(path:string,options?:{ttlMs?:number;force?:boolean})=>getCached<T>(path,options?.ttlMs??DEFAULT_GET_TTL,options?.force??false),
  invalidate:clearGetCache,
  post:<T>(path:string,body?:unknown)=>mutate<T>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)}),
  put:<T>(path:string,body:unknown)=>mutate<T>(path,{method:'PUT',body:JSON.stringify(body)}),
  patch:<T>(path:string,body:unknown)=>mutate<T>(path,{method:'PATCH',body:JSON.stringify(body)}),
  delete:<T>(path:string)=>mutate<T>(path,{method:'DELETE'}),
  upload:<T>(path:string,form:FormData)=>mutate<T>(path,{method:'POST',body:form,timeoutMs:30000})
};
