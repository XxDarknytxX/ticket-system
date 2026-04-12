import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply saved theme color on startup
;(() => {
  const hex = localStorage.getItem('theme_primary_color');
  if (!hex) return;
  const [h, s] = (() => {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let hue = 0; const l = (max+min)/2; let sat = 0;
    if (max !== min) { const d = max-min; sat = l>0.5?d/(2-max-min):d/(max+min); if(max===r)hue=((g-b)/d+(g<b?6:0))/6; else if(max===g)hue=((b-r)/d+2)/6; else hue=((r-g)/d+4)/6; }
    return [hue*360, sat*100];
  })();
  const toHex = (h:number,s:number,l:number) => { s/=100;l/=100;const a=s*Math.min(l,1-l);const f=(n:number)=>{const k=(n+h/30)%12;return l-a*Math.max(Math.min(k-3,9-k,1),-1);};return'#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join(''); };
  const shades: Record<string,number> = {'50':97,'100':93,'200':85,'300':72,'400':60,'500':50,'600':42,'700':34,'800':26,'900':18,'950':12};
  const caps: Record<string,number> = {'50':100,'100':95,'200':90,'300':85,'400':80,'500':75,'600':72,'700':70,'800':65,'900':60,'950':55};
  Object.entries(shades).forEach(([k,l]) => { document.documentElement.style.setProperty(`--color-violet-${k}`, toHex(h, Math.min(s,caps[k]),l)); });
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
