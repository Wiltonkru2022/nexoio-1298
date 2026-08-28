import { useEffect, useId } from 'react';
import type { FormEvent, PropsWithChildren } from 'react';
import { Button, IconButton, Input } from '@nexoio/ui';

export function Modal({ open, title, description, submitLabel = 'Salvar', onClose, onSubmit, children }: PropsWithChildren<{ open: boolean; title: string; description?: string; submitLabel?: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) {
  const titleId = useId();
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); const previous=document.activeElement as HTMLElement|null; return () => { window.removeEventListener('keydown', onKey); previous?.focus(); }; }, [open, onClose]);
  if (!open) return null;
  return <div className="nx-overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="nx-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><header><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div><IconButton icon="close" label="Fechar" onClick={onClose}/></header><form onSubmit={onSubmit}><div className="nx-modal-body form-grid">{children}</div><footer><Button type="button" ghost onClick={onClose}>Cancelar</Button><Button type="submit">{submitLabel}</Button></footer></form></section></div>;
}

export function Field({ label, name, type = 'text', required = false, placeholder, children }: PropsWithChildren<{ label: string; name: string; type?: string; required?: boolean; placeholder?: string }>) {
  return <label className="nx-field"><span className="nx-field-label">{label}{required?<b aria-hidden> *</b>:null}</span>{children ?? <Input name={name} type={type} required={required} placeholder={placeholder} />}</label>;
}
