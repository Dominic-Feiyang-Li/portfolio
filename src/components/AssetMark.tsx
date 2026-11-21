import type {ReactNode} from 'react';

// The allocation palette stays consistent; list marks use open graphite geometry.
const tones:Record<string,string>={
 '纳指':'growth','标普':'index','个股':'equity','债券/红利':'bond',
 '黄金':'gold','现金':'cash','加密货币':'crypto',
};
const marks:Record<string,ReactNode>={
 '纳指':<><path d="m7 24 11-17 11 7-11 17Z"/><path d="m11 27 11-17M15 30l11-17" opacity=".4"/></>,
 '标普':<><ellipse cx="18" cy="18" rx="13" ry="6" transform="rotate(-35 18 18)"/><ellipse cx="18" cy="18" rx="13" ry="6" transform="rotate(35 18 18)" opacity=".45"/><path d="M18 5v26" opacity=".3"/></>,
 '个股':<><path d="M6 15V6h9m6 0h9v9m0 6v9h-9m-6 0H6v-9"/><path d="m18 10 8 8-8 8-8-8Z" opacity=".45"/></>,
 '债券/红利':<><path d="M19 8a9 9 0 1 0 0 20"/><path d="M17 8a9 9 0 1 1 0 20" opacity=".45"/><path d="M12 18h12" opacity=".65"/></>,
 '黄金':<><path d="m18 4 13 14-13 14L5 18Z"/><path d="m18 4 6 14-6 14-6-14Z" opacity=".4"/><path d="M5 18h26" opacity=".4"/></>,
 '现金':<><path d="M29 18A11 11 0 1 1 18 7"/><path d="M24 18a6 6 0 1 1-6-6" opacity=".45"/><path d="M23 6a13 13 0 0 1 7 7" opacity=".65"/></>,
 '加密货币':<><path d="m18 5 12 21H6Z" opacity=".45"/><path d="M7 12h22L18 32Z"/><circle cx="18" cy="18" r="3.5" opacity=".6"/></>,
};
export function assetTone(name:string){return tones[name]??'equity'}
export default function AssetMark({name}:{name:string}){
 return <span className={`assetmark tone-${assetTone(name)}`} aria-hidden="true"><svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" focusable="false">{marks[name]??marks['个股']}</svg></span>;
}
