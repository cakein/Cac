import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'HabitLab — Small steps. Real change.',description:'Understand your habit loop, try a tiny first step, and discover what works for you.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
