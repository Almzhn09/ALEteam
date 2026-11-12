'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useId,useRef,useState,type FormEvent} from 'react';
import {ApiClientError,errorText} from '@/lib/api';
import {safeReturnTo,useSession} from '@/lib/session';
import {useI18n} from '@/lib/lang';
import {Notice} from '@/components/ui';

export function RegisterForm(){
 const {t}=useI18n(),{user,signUp}=useSession(),router=useRouter(),params=useSearchParams(),id=useId();
 const returnTo=safeReturnTo(params.get('returnTo'));
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const errorRef=useRef<HTMLDivElement>(null);
 function fail(message:string){setError(message);requestAnimationFrame(()=>errorRef.current?.focus());}
 async function submit(e:FormEvent){
  e.preventDefault();if(busy)return;setError('');
  if(name.trim().length<2)return fail(t('Укажите имя: от 2 до 80 символов.'));
  if(!email.trim()||!e.currentTarget.querySelector<HTMLInputElement>('input[type=email]')?.validity.valid)return fail(t('Введите корректный email.'));
  if(password.length<12||password.length>128)return fail(t('Пароль должен содержать от 12 до 128 символов.'));
  if(password!==confirm)return fail(t('Пароли не совпадают.'));
  setBusy(true);
  try{await signUp(name.trim(),email.trim(),password);router.replace(returnTo);}
  catch(err){
   fail(err instanceof ApiClientError&&err.status===429?t('Слишком много попыток регистрации. Попробуйте через минуту.')
    :err instanceof ApiClientError&&[400,409,422].includes(err.status)?t('Не удалось создать аккаунт. Проверьте данные или войдите, если аккаунт уже есть.'):errorText(err,t));
   setPassword('');setConfirm('');
  }finally{setBusy(false);}
 }
 if(user)return <Notice tone="success" title={t('Вы вошли как {name}',{name:user.name})}><Link className="btn btn-primary" href={returnTo}>{t('Продолжить')}</Link></Notice>;
 return <form className="card stack" onSubmit={submit} noValidate aria-describedby={error?`${id}-error`:undefined}>
  {error&&<div ref={errorRef} id={`${id}-error`} tabIndex={-1}><Notice tone="error" title={t('Не удалось зарегистрироваться')} live><p>{error}</p></Notice></div>}
  <div className="field"><label htmlFor={`${id}-name`}>{t('Имя')}</label><input id={`${id}-name`} className="input" autoComplete="name" required minLength={2} maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></div>
  <div className="field"><label htmlFor={`${id}-email`}>Email</label><input id={`${id}-email`} className="input" type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></div>
  <div className="field"><label htmlFor={`${id}-password`}>{t('Пароль')}</label><input id={`${id}-password`} className="input" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy} aria-describedby={`${id}-password-help`} onChange={e=>setPassword(e.target.value)}/><p id={`${id}-password-help`} className="small muted">{t('Пароль должен содержать от 12 до 128 символов.')}</p></div>
  <div className="field"><label htmlFor={`${id}-confirm`}>{t('Повторите пароль')}</label><input id={`${id}-confirm`} className="input" type="password" autoComplete="new-password" required maxLength={128} value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></div>
  <button className="btn btn-primary" type="submit" disabled={busy}>{t(busy?'Создаём аккаунт…':'Зарегистрироваться')}</button>
  {busy&&<p className="small" role="status">{t('Создаём аккаунт…')}</p>}
  <p className="small">{t('Уже есть аккаунт?')} <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>{t('Войти')}</Link></p>
 </form>;
}
