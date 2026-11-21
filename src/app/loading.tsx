import Image from 'next/image';
import PortfolioPending from '@/components/PortfolioPending';

export default function Loading(){
 return <main className="app simpleapp"><header className="appheader simpleheader"><h1 className="sr-only">Personal portfolio</h1><span className="simplebrand"><Image src="/logo.png" width={40} height={40} alt="Portfolio" priority/></span></header><div className="pagecontent" aria-busy="true"><PortfolioPending positions={[]} failed={false}/></div></main>;
}
