'use client';

import {useChat} from '@ai-sdk/react';
import {DefaultChatTransport,type FileUIPart} from 'ai';
import {useEffect,useId,useState,useRef} from 'react';
import {ArrowUp,Square,RotateCcw,X,MessageSquare,ImagePlus} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Conversation,ConversationContent,ConversationEmptyState,ConversationScrollButton} from '@/components/ai-elements/conversation';
import {Message,MessageContent,MessageResponse} from '@/components/ai-elements/message';

const transport=new DefaultChatTransport({
 api:'/api/assistant',
 prepareSendMessagesRequest:({messages,body})=>({body:{...body,messages:messages.slice(-15).map(message=>({role:message.role,parts:message.parts.filter(part=>(part.type==='text'||part.type==='file'))}))}}),
 fetch:async(input,init)=>{
  const response=await fetch(input,init);
  if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||'AI 暂时无法连接，请稍后重试')}
  return response;
 },
});
const markdownComponents={img:()=>null};
const suggestions=['分析我的持仓分布和风险','按成交截图帮我记录交易','帮我记录一笔现金支出'];

export default function InvestmentAssistant({open,onOpenChange,positionCount}:{open:boolean;onOpenChange:(open:boolean)=>void;positionCount:number}) {
 const {messages,sendMessage,status,error,stop,setMessages,clearError,regenerate}=useChat({transport,onFinish:()=>window.dispatchEvent(new Event('portfolio-updated'))});
 const [input,setInput]=useState('');
 const [files,setFiles]=useState<FileUIPart[]>([]),[allowWrites,setAllowWrites]=useState(false),[uploadError,setUploadError]=useState(''),[uploading,setUploading]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const attach=async(file:File)=>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setUploadError('请使用PNG、JPEG或WebP图片');return}
  setUploading(true);setUploadError('');
  const url=URL.createObjectURL(file);
  try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.85);if(data.length>2800000)throw new Error('图片过大，请裁剪后再上传');setFiles([{type:'file',mediaType:'image/jpeg',filename:file.name,url:data}])}catch(e){setUploadError(e instanceof Error?e.message:'图片无法读取')}finally{URL.revokeObjectURL(url);setUploading(false)}
 };
 const promptId=useId();
 const busy=status==='submitted'||status==='streaming';
 // The transcript stays in memory when the dialog closes, and never enters browser storage.
 useEffect(()=>{if(!open)void stop()},[open,stop]);
 const submit=(text:string)=>{const trimmed=text.trim();if((!trimmed&&!files.length)||busy||uploading)return;clearError();setInput('');const attachments=files;setFiles([]);void sendMessage({text:trimmed||'请识别图片，缺少信息先问我。',files:attachments},{body:{allowWrites,requestId:crypto.randomUUID()}})};
 const reset=()=>{void stop();setMessages([]);clearError();setInput('');setFiles([]);setAllowWrites(false)};
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent lang="zh-CN" className="investmentassistant" showCloseButton={false} onOpenAutoFocus={event=>event.preventDefault()}>
   <header className="assistantheader">
    <div><DialogTitle>投资助手</DialogTitle><DialogDescription>DeepSeek · 图片识别、记账与投资分析</DialogDescription></div>
    <div className="assistantactions"><Button variant="ghost" size="icon" aria-label="开始新对话" title="开始新对话" onClick={reset} disabled={busy||!messages.length}><RotateCcw/></Button><Button variant="ghost" size="icon" aria-label="关闭投资助手" onClick={()=>onOpenChange(false)}><X/></Button></div>
   </header>
   <div className="assistantcontext"><span>{positionCount} 项持仓 · 含账户、分类汇总及近期记录</span><span>{allowWrites?'允许本次记账':'只读分析'}</span></div>
   <Conversation className="assistantconversation" aria-label="与投资助手的对话">
    <ConversationContent>
     {!messages.length?<ConversationEmptyState title="从你的持仓开始聊" description="分析持仓，或上传截图记录持仓与已成交交易。" icon={<MessageSquare aria-hidden="true"/>}/>:messages.map(message=>{
      const text=message.parts.filter(part=>part.type==='text').map(part=>part.text).join('');
      return <Message key={message.id} from={message.role}>
       <span className="assistantrole">{message.role==='user'?'你':'DeepSeek'}</span>
       <MessageContent>{message.parts.filter(p=>p.type==='file').map((p,i)=>p.type==='file'?<img key={i} src={p.url} alt="上传的截图" style={{maxWidth:'100%',maxHeight:240,borderRadius:12}}/>:null)}{message.role==='assistant'?<MessageResponse skipHtml components={markdownComponents} isAnimating={status==='streaming'&&message.id===messages.at(-1)?.id}>{text}</MessageResponse>:<p className="assistantusertext">{text}</p>}</MessageContent>
      </Message>;
     })}
     {busy&&<p className="assistantpending" role="status">{status==='submitted'?'正在读取账本并分析…':'正在回答…'}</p>}
     {error&&<Alert variant="destructive"><AlertDescription>{error.message}<Button variant="ghost" size="sm" onClick={()=>{clearError();void regenerate()}}>重试</Button></AlertDescription></Alert>}
    </ConversationContent>
    <ConversationScrollButton aria-label="滚动到最新回答"/>
   </Conversation>
   <footer className="assistantfooter">
    {files.map((file,i)=><div key={i}><img src={file.url} alt="待发送截图" style={{height:80,borderRadius:8}}/><Button variant="ghost" size="sm" onClick={()=>setFiles([])}>移除图片</Button></div>)}
    {uploadError&&<p role="alert">{uploadError}</p>}
    <label className="checklabel"><input type="checkbox" checked={allowWrites} disabled={busy} onChange={e=>setAllowWrites(e.target.checked)}/>允许本次记账（持仓和已成交交易）</label>
    <input type="file" accept="image/png,image/jpeg,image/webp" hidden ref={fileInput} onChange={e=>{const file=e.target.files?.[0];if(file)void attach(file);e.target.value=''}}/>
    <Button variant="outline" size="sm" disabled={busy||uploading} onClick={()=>fileInput.current?.click()}><ImagePlus/>{uploading?'处理图片中…':'上传截图'}</Button>
    {!messages.length&&<div className="assistantsuggestions">{suggestions.map(text=><Button variant="outline" size="sm" key={text} onClick={()=>submit(text)}>{text}</Button>)}</div>}
    <form className="assistantform" onSubmit={event=>{event.preventDefault();submit(input)}}>
     <FieldGroup><Field><FieldLabel htmlFor={promptId} className="sr-only">向投资助手提问</FieldLabel><Textarea id={promptId} value={input} maxLength={6000} placeholder="描述要记录的交易，或上传截图…" onPaste={e=>{const image=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(image){e.preventDefault();void attach(image)}}} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&window.matchMedia('(pointer:fine)').matches){event.preventDefault();submit(input)}}}/></Field></FieldGroup>
     {busy?<Button type="button" variant="outline" size="icon" aria-label="停止回答" onClick={()=>void stop()}><Square/></Button>:<Button type="submit" size="icon" aria-label="发送问题" disabled={(!input.trim()&&!files.length)||uploading}><ArrowUp/></Button>}
    </form>
    <p className="assistantprivacy">消息、图片和相关账本数据会发送给 DeepSeek。开启记账后可修改账本并保留记录；不会向券商下单。</p>
   </footer>
  </DialogContent>
 </Dialog>;
}
