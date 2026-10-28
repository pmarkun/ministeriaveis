'use client';
import {useState} from 'react';
import {Copy,KeyRound,UserPlus,LogIn,ArrowRight} from 'lucide-react';
import type {AccountUser} from '../../lib/auth';
import {Modal} from './primitives';
type Mode='login'|'register'|'recover'|'password';
export default function AuthDialog({request,onAuthenticated,onClose,initialMode='login'}:{request:(path:string,init?:RequestInit)=>Promise<any>;onAuthenticated:(user:AccountUser)=>void;onClose:()=>void;initialMode?:Mode}){
 const [mode,setMode]=useState<Mode>(initialMode),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recovery,setRecovery]=useState(''),[authenticated,setAuthenticated]=useState<AccountUser|null>(null),[copied,setCopied]=useState(false),[email,setEmail]=useState('');
 function change(next:Mode){setMode(next);setError('')}
 function finish(){authenticated?onAuthenticated(authenticated):onClose()}
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);const data=Object.fromEntries(form);if(mode!=='login'&&data.password!==data.confirm){setError('As senhas não coincidem.');return}delete data.confirm;setBusy(true);setError('');try{const result=await request('/auth/'+(mode==='password'?'password':mode),{method:'POST',body:JSON.stringify(data)});if(result.recoveryCode){setAuthenticated(result.user);setRecovery(result.recoveryCode)}else onAuthenticated(result.user);}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const title=recovery?'Guarde seu código de recuperação':mode==='register'?'Crie sua conta no Ministeriáveis':mode==='recover'?'Recupere seu acesso':mode==='password'?'Altere sua senha':'Entre no Ministeriáveis';
 return <Modal title={title} onClose={()=>{if(!busy)finish()}}>
 {recovery?<div className="auth-recovery"><p>Sua conta está pronta. Este código permite criar uma nova senha caso você esqueça a atual. Guarde em um lugar seguro.</p><label>Código de recuperação<input aria-label="Código de recuperação" readOnly value={recovery} onFocus={e=>e.currentTarget.select()}/></label><button className="button secondary full" onClick={async()=>{try{await navigator.clipboard.writeText(recovery);setCopied(true)}catch{setError('Selecione o código acima e copie manualmente.')}}}><Copy size={17}/>{copied?'Código copiado':'Copiar código'}</button><p className="small muted">Exibido somente agora. Ao usar ou renovar o código, o anterior deixa de funcionar. Não enviamos recuperação por e-mail.</p>{error?<p className="error" role="alert">{error}</p>:null}<button className="button primary full" onClick={finish}>Guardei, continuar <ArrowRight size={17}/></button></div>:<>
 {mode==='login'||mode==='register'?<div className="auth-tabs" role="group" aria-label="Acesso à conta"><button className={'button '+(mode==='login'?'primary':'secondary')} onClick={()=>change('login')}><LogIn size={17}/> Entrar</button><button className={'button '+(mode==='register'?'primary':'secondary')} onClick={()=>change('register')}><UserPlus size={17}/> Criar conta</button></div>:null}
 <p>{mode==='login'?'Salve suas versões e fortaleça outras escalações com sua conta. Seu rascunho continua no campo.':mode==='register'?'Escolha um nome ou apelido público. Seu e-mail serve para entrar e não aparece nas escalações.':mode==='recover'?'Use o e-mail cadastrado e o código que você guardou ao criar a conta.':'Informe a senha atual e escolha a nova. Os outros dispositivos serão desconectados e você receberá um novo código de recuperação.'}</p>
 <form className="form auth-form" onSubmit={submit} key={mode}>
 {mode==='register'?<label>Nome ou apelido público<input name="name" autoComplete="nickname" required minLength={2} maxLength={60}/></label>:null}
 {mode!=='password'?<label>E-mail<input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none" spellCheck={false}/></label>:<label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/></label>}
 {mode==='recover'?<label>Código de recuperação<input name="code" autoComplete="off" required maxLength={100} placeholder="O código entregue no cadastro" spellCheck={false}/></label>:null}
 <label>{mode==='login'||mode==='register'?'Senha':'Nova senha'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:12} maxLength={128}/></label>
 {mode!=='login'?<><small className="muted">Pelo menos 12 caracteres. Uma frase longa também funciona.</small><label>Repita a nova senha<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label></>:null}
 {error?<p className="error" role="alert">{error}</p>:null}
 <button className="button primary full" disabled={busy}><KeyRound size={17}/>{busy?'Aguarde…':mode==='register'?'Criar minha conta':mode==='recover'?'Recuperar e entrar':mode==='password'?'Alterar senha':'Entrar na minha conta'}</button>
 </form>
 {mode==='login'?<button className="text-button full" onClick={()=>change('recover')}>Esqueci minha senha</button>:mode==='recover'?<button className="text-button full" onClick={()=>change('login')}>Voltar para entrar</button>:null}
 </>}
 </Modal>
}
