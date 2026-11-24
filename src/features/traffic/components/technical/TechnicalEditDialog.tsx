import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Native modal keeps focus inside the editor and restores it on dismissal. */
export function TechnicalEditDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    if(dialog && !dialog.open) dialog.showModal();
    return ()=>{if(dialog?.open)dialog.close();};
  },[]);
  return <dialog ref={ref} className="ti-edit-dialog" aria-label={title}
    onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}}
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}}>
    <div className="ti-dialog-heading"><h3>{title}</h3><button type="button" className="ti-dialog-close" onClick={onClose} aria-label="Cerrar edición"><X size={20}/></button></div>
    {children}
  </dialog>;
}
