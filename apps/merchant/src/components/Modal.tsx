import { useEffect, useId, useRef } from 'react';
import type { FormEvent, PropsWithChildren } from 'react';
import { Button, IconButton, Input } from '@nexoio/ui';

export function Modal({ open, title, description, submitLabel = 'Salvar', onClose, onSubmit, children }: PropsWithChildren<{ open: boolean; title: string; description?: string; submitLabel?: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) {
  const titleId=useId();const descriptionId=useId();const dialogRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const focusable=dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');focusable?.focus();
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=previousOverflow;previous?.focus();};
  },[open,onClose]);
  if(!open)return null;
  return <div className="nx-overlay" role="presentation" onMouseDown={event=>event.currentTarget===event.target&&onClose()}><section ref={dialogRef} className="nx-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined}><header className="nx-modal-head"><div><h2 id={titleId}>{title}</h2>{description?<p id={descriptionId}>{description}</p>:null}</div><IconButton icon="close" label="Fechar" onClick={onClose}/></header><form className="nx-modal-form" onSubmit={onSubmit}><div className="nx-modal-body form-grid">{children}</div><footer className="nx-modal-actions"><Button type="button" ghost onClick={onClose}>Cancelar</Button><Button type="submit">{submitLabel}</Button></footer></form></section></div>;
}

export function Field({ label, name, type = 'text', required = false, placeholder, children }: PropsWithChildren<{ label: string; name: string; type?: string; required?: boolean; placeholder?: string }>) {
  return <label className="nx-field"><span className="nx-field-label">{label}{required?<b aria-hidden> *</b>:null}</span>{children??<Input name={name} type={type} required={required} placeholder={placeholder}/>}</label>;
}
