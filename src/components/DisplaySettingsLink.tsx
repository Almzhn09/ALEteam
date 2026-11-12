'use client';
export function DisplaySettingsLink({children}:{children:React.ReactNode}){
 return <a href="#display-settings" onClick={event=>{const panel=document.getElementById('display-settings') as HTMLDetailsElement|null;if(!panel)return;event.preventDefault();panel.open=true;panel.querySelector('summary')?.focus();panel.scrollIntoView({block:'nearest'});}}>{children}</a>;
}
