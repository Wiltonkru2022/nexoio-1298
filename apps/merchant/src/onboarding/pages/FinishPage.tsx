import { deriveSegmentModules, SITE_ONLY_MODULES } from '@nexoio/core';
import { Button } from '@nexoio/ui';
import { AuthCard, AuthLayout, AuthNotice } from '../../auth/components';
import { segmentNames } from './BusinessTypePage';
import type { StepProps } from '../types';

export function FinishPage({data,next,back}:StepProps){const total=data.productMode==='site_only'?SITE_ONLY_MODULES.length:deriveSegmentModules(data.segment,data.answers).length;return <AuthLayout><AuthCard title="Tudo pronto para criar" description="Revise os dados e conclua a configuração da empresa."><AuthNotice tone="success"><strong>{data.displayName}</strong><br/>{segmentNames[data.segment]} · {total} recursos configurados automaticamente</AuthNotice><div className="actions"><Button ghost onClick={back}>Voltar</Button><Button onClick={next}>Criar empresa</Button></div></AuthCard></AuthLayout>}
