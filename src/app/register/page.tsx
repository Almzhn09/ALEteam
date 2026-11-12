import {Suspense} from 'react';
import {Breadcrumbs} from '@/components/ui';
import {getT} from '@/lib/i18n-server';
import {RegisterForm} from './RegisterForm';

export async function generateMetadata(){return {title:(await getT())('Регистрация'),robots:{index:false}};}
export default async function RegisterPage(){
 const t=await getT();
 return <div className="container page measure-form">
  <Breadcrumbs items={[{href:'/login',label:t('Вход')},{label:t('Регистрация')}]} />
  <h1>{t('Создать аккаунт')}</h1>
  <p className="muted">{t('Зарегистрируйтесь, чтобы комментировать материалы и следить за новыми публикациями.')}</p>
  <Suspense><RegisterForm/></Suspense>
 </div>;
}
