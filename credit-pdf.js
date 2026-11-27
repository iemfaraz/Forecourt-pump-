'use strict';
// Assemble A4 pages from browser-rendered statement images so local-script names render offline.
function creditPdfFile(station,person,day,entries){
  const chunks=[],offsets=[0];
  let length=0;
  function write(data){
    const bytes=typeof data==='string'?new TextEncoder().encode(data):data;
    chunks.push(bytes);length+=bytes.length;
  }
  function object(id,content){offsets[id]=length;write(id+' 0 obj\n');write(content);write('\nendobj\n')}
  const perPage=25,pages=Math.max(1,Math.ceil(entries.length/perPage));
  write('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+pages+' /Kids ['+Array.from({length:pages},(_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;
  const ctx=canvas.getContext('2d');let balance=0;
  for(let page=0;page<pages;page++){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);
    function line(value,x,y,size=25,right=false,width=1090){
      ctx.font=size+'px sans-serif';ctx.fillStyle='#163a35';ctx.textAlign=right?'right':'left';ctx.fillText(String(value),x,y,width);
    }
    line(station,70,96,44);line('Customer credit statement',70,160,36);
    line(person.name,70,220,32);line('Through '+day+'   ·   PKR',70,270);
    const columns=[70,453,675,914,1170],labels=['Date','Opening','Credit','Payment','Balance'];
    ctx.fillStyle='#e6f1ed';ctx.fillRect(58,313,1124,55);
    labels.forEach((v,i)=>line(v,columns[i],350,24,i>0));
    const items=entries.slice(page*perPage,(page+1)*perPage);
    items.forEach((r,j)=>{
      balance+=r.opening+r.buy-r.paid;
      [r.date,fmt(r.opening),fmt(r.buy),fmt(r.paid),fmt(balance)].forEach((v,i)=>line(v,columns[i],410+j*47,25,i>0,210));
    });
    if(!items.length)line('No transactions through this date.',70,410);
    if(page===pages-1)line('Closing balance: PKR '+fmt(balance),1170,1595,32,true);
    line('Page '+(page+1)+' of '+pages,1170,1690,22,true);
    const jpeg=Uint8Array.from(atob(canvas.toDataURL('image/jpeg',0.88).split(',')[1]),c=>c.charCodeAt(0));
    const id=3+page*3,draw='q 595 0 0 842 0 0 cm /PageImage Do Q\n';
    object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /PageImage '+(id+2)+' 0 R >> >> /Contents '+(id+1)+' 0 R >>');
    object(id+1,'<< /Length '+draw.length+' >>\nstream\n'+draw+'endstream');
    offsets[id+2]=length;write((id+2)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');write(jpeg);write('\nendstream\nendobj\n');
  }
  const xref=length;
  write('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
  for(const offset of offsets.slice(1))write(String(offset).padStart(10,'0')+' 00000 n \n');
  write('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return new File(chunks,['Credit',person.name.replace(/[^\p{L}\p{N}-]+/gu,'-').slice(0,70),day].join('-')+'.pdf',{type:'application/pdf'});
}
