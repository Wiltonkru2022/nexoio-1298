import { useEffect, useId } from 'react';
import type { FormEvent, PropsWithChildren } from 'react';
import { Button } from '@nexoio/ui';

export function Modal({ open, title, description, submitLabel = 'Salvar', onClose, onSubmit, children }: PropsWithChildren<{ open: boolean; title: string; description?: string; submitLabel?: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) {
  const titleId = useId();
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="modal-head"><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button></div><form onSubmit={onSubmit}><div className="form-grid">{children}</div><div className="modal-actions"><Button type="button" ghost onClick={onClose}>Cancelar</Button><Button type="submit">{submitLabel}</Button></div></form></section></div>;
}

export function Field({ label, name, type = 'text', required = false, placeholder, children }: PropsWithChildren<{ label: string; name: string; type?: string; required?: boolean; placeholder?: string }>) {
  return <label className="field"><span>{label}</span>{children ?? <input name={name} type={type} required={required} placeholder={placeholder} />}</label>;
}
