import{useState}from'react';import{AuthCard,AuthForm,AuthLayout,AuthNotice,FormField,PasswordField,PasswordStrength}from'../components';import{api,ApiError}from'../../lib/api';
export function RegisterPage(){
 const[password,setPassword]=useState('');const[loading,setLoading]=useState(false);const[message,setMessage]=useState('');
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setLoading(true);setMessage('');const d=new FormData(e.currentTarget);const email=String(d.get('email')??'').trim();const callbackURL=`${location.origin}/login?verified=1`;try{
   const result=await api.post<{token?:string|null;user?:{id:string}}>('/api/auth/sign-up/email',{name:String(d.get('name')??'').trim(),email,password,callbackURL});
   // Sem provedor de e-mail configurado (desenvolvimento), Better Auth cria a sessão
   // imediatamente. Em produção com verificação ativa, token fica ausente e seguimos
   // para a tela de confirmação do endereço.
   location.assign(result.token||result.user?'/':`/verificar-email?email=${encodeURIComponent(email)}`);
 }catch(x){setMessage(x instanceof ApiError?x.message:'Não foi possível criar a conta')}finally{setLoading(false)}};
 return <AuthLayout><AuthCard title="Criar sua conta" description="Crie a conta primeiro. Depois você configura a empresa e pode ativar recursos extras de segurança nas Configurações." footer={<span>Já possui conta? <a href="/login">Entrar</a></span>}><AuthForm onSubmit={submit} submitLabel="Criar conta" loading={loading}>{message?<AuthNotice tone="error">{message}</AuthNotice>:null}<FormField label="Nome completo" name="name" autoComplete="name" required/><FormField label="E-mail" name="email" type="email" autoComplete="email" required/><PasswordField aria-label="Senha (mínimo 12 caracteres)" name="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required/><PasswordStrength password={password}/></AuthForm></AuthCard></AuthLayout>}
