import { BUSINESS_TYPES, SEGMENT_MODULES } from '@nexoio/core';
import { Button } from '@nexoio/ui';
import { AuthCard, AuthLayout } from '../../auth/components';
import type { StepProps } from '../types';

export const segmentNames:Record<string,string>={salon:'Salão de beleza',beauty:'Estética',barbershop:'Barbearia',restaurant:'Restaurante',snackbar:'Lanchonete',retail:'Loja e varejo',technical_assistance:'Assistência técnica',service_provider:'Prestador de serviços',gym:'Academia',studio:'Estúdio',clinic:'Clínica',other:'Negócio geral'};
export function BusinessTypePage({data,update,next,back}:StepProps){return <AuthLayout><AuthCard title="Qual é o segmento da empresa?" description="A Nexoio ativará automaticamente somente os recursos adequados a esse tipo de operação."><div className="onboarding-grid">{BUSINESS_TYPES.map(segment=><button type="button" className={`segment-option ${data.segment===segment?'active':''}`} key={segment} onClick={()=>update({segment,moduleKeys:SEGMENT_MODULES[segment]})}>{segmentNames[segment]}</button>)}</div><div className="actions"><Button ghost onClick={back}>Voltar</Button><Button onClick={next}>Continuar</Button></div></AuthCard></AuthLayout>}
