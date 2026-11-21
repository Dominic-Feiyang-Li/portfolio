import type {Metadata,Viewport} from 'next';
import './globals.css';
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";



export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata:Metadata={title:'Portfolio',description:'Personal asset tracking',robots:{index:false,follow:false},appleWebApp:{capable:true,title:'Portfolio',statusBarStyle:'default'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={cn("font-sans", GeistSans.variable)}><body>{children}</body></html>}
