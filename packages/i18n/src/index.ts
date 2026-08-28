const ptBR='pt-BR';
const digits=(value:string|number)=>String(value??'').replace(/\D/g,'');
export const formatCurrency=(value:number|string,currency='BRL')=>Number(value||0).toLocaleString(ptBR,{style:'currency',currency});
export const formatNumber=(value:number|string,options?:Intl.NumberFormatOptions)=>Number(value||0).toLocaleString(ptBR,options);
export const formatPercent=(value:number|string,maximumFractionDigits=1)=>Number(value||0).toLocaleString(ptBR,{style:'percent',maximumFractionDigits});
export const formatDate=(value:string|number|Date)=>new Intl.DateTimeFormat(ptBR,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value));
export const formatTime=(value:string|number|Date)=>new Intl.DateTimeFormat(ptBR,{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value));
export const formatDateTime=(value:string|number|Date)=>new Intl.DateTimeFormat(ptBR,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value));
export function formatCPF(value:string|number){const v=digits(value).slice(0,11);return v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}
export function formatCNPJ(value:string|number){const v=digits(value).slice(0,14);return v.replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2')}
export function formatCEP(value:string|number){return digits(value).slice(0,8).replace(/(\d{5})(\d{1,3})$/,'$1-$2')}
export function formatPhone(value:string|number){const v=digits(value).slice(0,13);const local=v.startsWith('55')?v.slice(2):v;if(local.length<=10)return local.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');return local.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'')}
export const formatBoolean=(value:boolean)=>value?'Sim':'Não';
export const formatEmpty=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
export const PT_BR={locale:ptBR,currency:'BRL',timeZone:'America/Sao_Paulo'} as const;
