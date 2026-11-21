'use client';
import {useEffect,useRef,useState} from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
export default function Modal({title,onClose,children,destructive=false,dismissible=true}:{title:string;onClose:()=>void;children:React.ReactNode;destructive?:boolean;dismissible?:boolean}) {
 const [open,setOpen]=useState(true);
 const origin=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
 const close=()=>{if(dismissible)setOpen(false)};
 // Keep the parent mounted while Radix plays its exit animation.
 useEffect(()=>{if(open)return;const timer=setTimeout(onClose,window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:220);return ()=>clearTimeout(timer)},[open,onClose]);
 const restoreFocus=(event:Event)=>{if(origin.current?.isConnected){event.preventDefault();origin.current.focus({preventScroll:true})}};
 const header=(heading:React.ReactNode)=><div className="modalhead">{heading}<Button variant="ghost" type="button" disabled={!dismissible} onClick={close} aria-label="Close">×</Button></div>;
 if(destructive) return <AlertDialog open={open} onOpenChange={next=>{if(!next)close()}}><AlertDialogContent className="modal" aria-describedby={undefined} onCloseAutoFocus={restoreFocus}>{header(<AlertDialogTitle>{title}</AlertDialogTitle>)}{children}</AlertDialogContent></AlertDialog>;
 return <Dialog open={open} onOpenChange={next=>{if(!next)close()}}><DialogContent className="modal" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={restoreFocus}>{header(<DialogTitle>{title}</DialogTitle>)}{children}</DialogContent></Dialog>;
}
