import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Ministeriáveis — O Brasil também se escala',description:'Monte sua seleção de ministros para 2027. Conheça as pastas, escolha as pessoas e compartilhe sua escalação.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
