import type { BusinessSegment, ModuleKey } from '@nexoio/core';
export type ProductMode='full_system'|'site_only';
export type OnboardingData={productMode:ProductMode;answers:Record<string,string|number|boolean>;displayName:string;legalName:string;segment:BusinessSegment;documentNumber:string;phone:string;email:string;city:string;state:string;timezone:string;slug:string;moduleKeys:ModuleKey[];inviteEmail:string};
export type StepProps={data:OnboardingData;update:(values:Partial<OnboardingData>)=>void;next:()=>void;back:()=>void};
