'use strict';
// Assemble A4 pages from browser-rendered statement images so local-script names render offline.
function creditSlip(person,day,entries){
  const items=entries.filter(r=>r.date<=day).sort((a,b)=>a.date.localeCompare(b.date));
  let opening=0,credit=0,paid=0;
  for(const r of items){opening+=r.opening;credit+=r.buy;paid+=r.paid}
  const balance=opening+credit-paid;
  const ref='CS-'+day.replaceAll('-','')+'-'+Array.from(String(person.id||person.name)).reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0))>>>0,7).toString(36).toUpperCase();
  return {items,opening,credit,paid,balance,ref,label:balance<0?'Customer credit balance':'Remaining balance'};
}
function creditPdfFile(station,person,day,entries){
  const chunks=[],offsets=[0];
  let length=0;
  function write(data){
    const bytes=typeof data==='string'?new TextEncoder().encode(data):data;
    chunks.push(bytes);length+=bytes.length;
  }
  function object(id,content){offsets[id]=length;write(id+' 0 obj\n');write(content);write('\nendobj\n')}
  const slip=creditSlip(person,day,entries);entries=slip.items;
  const perPage=19,pages=Math.max(1,Math.ceil(entries.length/perPage));
  write('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+pages+' /Kids ['+Array.from({length:pages},(_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;
  const ctx=canvas.getContext('2d');let balance=0;
  for(let page=0;page<pages;page++){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);
    function line(value,x,y,size=25,right=false,width=1090){
      ctx.font=size+'px sans-serif';ctx.fillStyle='#163a35';ctx.textAlign=right?'right':'left';ctx.fillText(String(value),x,y,width);
    }
    ctx.fillStyle='#145548';ctx.fillRect(62,58,1116,10);
    line(station,72,140,45,false,680);line('CUSTOMER CREDIT SLIP',1170,137,28,true,375);
    line('Statement through '+day,72,204,25);line(slip.ref,1170,204,23,true);
    ctx.fillStyle='#eef4f1';ctx.fillRect(62,250,1116,155);
    line('CUSTOMER',84,288,20);line(person.name,84,338,35,false,1060);
    line([person.phone,person.address].filter(Boolean).join('   ·   '),84,383,23,false,1060);
    const amounts=[['Opening balances',slip.opening],['Total credit issued',slip.credit],['Total paid',slip.paid]];
    amounts.forEach(([label,value],i)=>{line(label,75+i*370,470,25);line('PKR '+fmt(value),75+i*370,522,31,false,342)});
    line(slip.label,75,607,32);line('PKR '+fmt(Math.abs(slip.balance)),1165,607,40,true,680);
    const columns=[74,438,660,901,1165],labels=['Date','Opening','Credit','Payment','Balance'];
    ctx.fillStyle='#e6f1ed';ctx.fillRect(62,665,1116,57);
    labels.forEach((v,i)=>line(v,columns[i],703,24,i>0));
    const items=entries.slice(page*perPage,(page+1)*perPage);
    items.forEach((r,j)=>{
      balance+=r.opening+r.buy-r.paid;
      [r.date,fmt(r.opening),fmt(r.buy),fmt(r.paid),fmt(balance)].forEach((v,i)=>line(v,columns[i],770+j*46,24,i>0,210));
    });
    if(!items.length)line('No transactions through this date.',74,770);
    line('Amounts in Pakistani rupees (PKR)',75,1690,22);line('Page '+(page+1)+' of '+pages,1170,1690,22,true);
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
