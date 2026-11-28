'use strict';
const martMoney=n=>Math.round((n+Number.EPSILON)*100)/100;
const martCode=()=> 'M'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
const martItems=()=>get('Mart item').sort((a,b)=>a.name.localeCompare(b.name));
function martDelta(r,l){return r.type==='Mart count'?l.after-l.before:r.movement==='sale'?-l.qty:l.qty}
function martStock(all,day){
  const stock=new Map();
  for(const r of all){
    if(!['Mart','Mart count'].includes(r.type)||!r.lines||r.date>day)continue;
    for(const l of r.lines)stock.set(l.item,(stock.get(l.item)||0)+martDelta(r,l));
  }
  return stock;
}
function validateMart(all){
  const products=all.filter(r=>r.type==='Mart item'),codes=new Set(),ids=new Set(products.map(p=>p.id)),onHand=new Map();
  for(const p of products){
    if(!/^[!-~]{1,64}$/.test(p.code)||codes.has(p.code))throw Error('Use a unique printable barcode of 1–64 characters.');
    if(p.reorder!==undefined&&(!Number.isSafeInteger(p.reorder)||p.reorder<0))throw Error('Invalid reorder level.');
    codes.add(p.code);
  }
  const moves=all.filter(r=>r.type==='Mart count'||r.type==='Mart'&&r.lines!==undefined).sort((a,b)=>a.date.localeCompare(b.date)||Number(martDelta(a,a.lines?.[0]||{})<0)-Number(martDelta(b,b.lines?.[0]||{})<0));
  for(const r of moves){
    if(r.type==='Mart count'){
      const l=r.lines?.[0];
      if(!l||r.lines.length!==1||!ids.has(l.item)||![l.before,l.after].every(v=>Number.isSafeInteger(v)&&v>=0)||l.before===l.after||!['Shelf count','Damage','Expiry','Loss'].includes(r.reason)||r.reason!=='Shelf count'&&l.after>l.before)throw Error('Check the stock adjustment and its reason.');
      const qty=(onHand.get(l.item)||0)+martDelta(r,l);
      if(qty<0)throw Error('This adjustment would leave negative stock.');
      onHand.set(l.item,qty);continue;
    }
    if(r.tendered!==undefined&&(!Number.isFinite(r.tendered)||r.tendered<r.sale))throw Error('Cash received must cover the sale.');
    if(!['sale','receipt','opening'].includes(r.movement)||!Array.isArray(r.lines)||!r.lines.length)throw Error('Invalid mart stock transaction.');
    let total=0;
    for(const l of r.lines){
      if(!ids.has(l.item)||!Number.isSafeInteger(l.qty)||l.qty<=0||!Number.isFinite(l.price)||l.price<0)throw Error('Check the item, quantity and price.');
      total+=martMoney(l.qty*l.price);
      const qty=(onHand.get(l.item)||0)+martDelta(r,l);
      if(qty<0)throw Error('Insufficient stock for '+l.name+' on '+r.date+'.');
      onHand.set(l.item,qty);
    }
    if(martMoney(total)!==r[r.movement==='sale'?'sale':r.movement==='receipt'?'buy':'opening'])throw Error('The mart total does not match its items.');
  }
}
function martMove(movement,name,lines,paid=0){
  const total=martMoney(sum(lines,l=>martMoney(l.price*l.qty)));
  return {id:crypto.randomUUID(),type:'Mart',date:date(),name,movement,lines,sale:movement==='sale'?total:0,buy:movement==='receipt'?total:0,opening:movement==='opening'?total:0,paid,cash:0};
}
function martView(d,p){
  const products=martItems(),stock=martStock(rows,date()),entries=get('Mart').filter(r=>r.date===date());
  return '<div class="cards">'+card('Sales · PKR',fmt(d.mart))+card('Units on hand',fmt(sum(products,r=>stock.get(r.id)||0)))+card('Products',fmt(products.length))+card('Mart cash · PKR',fmt(p.martcash))+'</div>'+
    panel('Inventory','<div class="actions mart-tools"><button class="btn" data-mart="product">Add product</button><button class="btn" data-mart="receipt">Receive stock</button><label>Find product<input id="martSearch" type="search" placeholder="Name or barcode"></label></div>'+table(['Product','Barcode / QR value','On hand','Unit cost · PKR','Sale price · PKR','Stock status',''],products.map(r=>[E(r.name),E(r.code),fmt(stock.get(r.id)||0),fmt(r.cost),fmt(r.price),(stock.get(r.id)||0)===0?'Out of stock':(stock.get(r.id)||0)<=r.reorder?'Low · reorder':'In stock','<button data-count="'+E(r.id)+'">Adjust stock</button> <button data-product="'+E(r.id)+'">Edit</button> <button data-label="'+E(r.id)+'">Print labels</button>']),'Add a product to begin.'))+
    panel('Transactions · '+E(date()),table(['Description','Items','Sales · PKR','Purchases · PKR','Paid · PKR',''],entries.map(r=>[E(r.name),r.lines?fmt(sum(r.lines,l=>l.qty)):'—',fmt(r.sale),fmt(r.buy),fmt(r.paid),r.lines?'<button data-receipt="'+E(r.id)+'">View details</button>':edit(r)]),'No transactions on this date.')+'<button class="btn" data-mart="legacy">Add ledger adjustment</button>')+
    panel('Stock adjustments · '+E(date()),table(['Product','Reason','Before','After','Change','Recorded by'],get('Mart count').filter(r=>r.date===date()).map(r=>{const l=r.lines[0];return [E(l.name),E(r.reason),fmt(l.before),fmt(l.after),fmt(martDelta(r,l)),E(r.actor)]}),'No stock adjustments on this date.'))+
    panel('Supplier balances',table(['Supplier','Remaining PKR'],groups(get('Mart').filter(r=>r.date<=date()&&(r.buy||r.paid)),r=>r.buy-r.paid),'No balances recorded.'));
}
function martProduct(p){
  const code=p?.code||martCode();
  const num=(label,key,value)=>input(label,key,'number','min="0" step=".01" value="'+value+'"');
  const html=input('Product name','name','text','maxlength="120" value="'+E(p?.name||'')+'"')+
    input('Barcode / QR value','code','text','maxlength="64" value="'+E(code)+'"')+'<button type="button" class="btn" data-generate>Generate new code</button>'+
    input('Low-stock level (units)','reorder','number','min="0" step="1" value="'+(p?.reorder??0)+'"')+num('Unit cost (PKR)','cost',p?.cost||0)+num('Sale price (PKR)','price',p?.price||0)+(p?'':input('Opening quantity','qty','number','min="0" step="1" value="0"'));
  const f=dialog(p?'Edit mart product':'Add mart product',html,'Save product',async b=>{
    const item={id:p?.id||crypto.randomUUID(),type:'Mart item',name:b.name.trim(),code:b.code.trim(),cost:+b.cost,price:+b.price,reorder:+b.reorder};
    const next=[...rows.filter(r=>r.id!==item.id),item];
    if(+b.qty>0)next.push(martMove('opening','Opening inventory',[{item:item.id,name:item.name,qty:+b.qty,price:item.cost}]));
    await save(next);
  });
  f.querySelector('[data-generate]').onclick=()=>f.querySelector('[name=code]').value=martCode();
}
function martCount(p){
  const day=date(),before=martStock(rows,day).get(p.id)||0,revision=version;
  const html='<p class="wide">Recorded on hand: '+fmt(before)+' units · '+E(day)+'</p>'+choices('Reason','reason',['Shelf count','Damage','Expiry','Loss'].map(s=>[s,s]))+input('Physical units remaining','after','number','min="0" step="1" value="'+before+'"');
  dialog('Adjust stock · '+E(p.name),html,'Save adjustment',async b=>{
    if(version!==revision||day!==date())throw Error('Reopen this adjustment to review current stock.');
    const after=Number(b.after);
    if(after===before)throw Error('The quantities match. No adjustment is needed.');
    await save([...rows,{type:'Mart count',id:crypto.randomUUID(),date:day,reason:b.reason,actor:staffUser.name,lines:[{item:p.id,name:p.name,before,after}]}]);
  });
}
function martLabels(p){
  const d=document.createElement('dialog');
  d.innerHTML='<h2>Product labels</h2><div data-sticker style="text-align:center;padding:10px"><strong>'+E(p.name)+'</strong><div><svg data-bars style="max-width:100%;height:54px"></svg></div><span data-qr></span><div>'+E(p.code)+' · PKR '+fmt(p.price)+'</div></div><label>Copies<input type="number" value="1" min="1" max="100" step="1"></label><div class="actions"><button class="btn" data-dismiss>Close</button><button class="btn primary" data-print>Print labels</button></div>';
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();
  JsBarcode(d.querySelector('[data-bars]'),p.code,{format:'CODE128',displayValue:false,height:40,margin:10});
  const qr=qrcode(0,'M');qr.addData(p.code);qr.make();d.querySelector('[data-qr]').innerHTML=qr.createSvgTag(3,12);
  d.querySelector('[data-dismiss]').onclick=()=>d.close();
  d.querySelector('[data-print]').onclick=()=>{
    const input=d.querySelector('input');if(!input.reportValidity()||!input.value)return;
    document.getElementById('martLabelFrame')?.remove();const frame=document.createElement('iframe');frame.id='martLabelFrame';frame.style.cssText='position:fixed;left:-200vw;width:800px';d.append(frame);
    const doc=frame.contentDocument;doc.title=p.name+' · Product labels';const style=doc.createElement('style');style.textContent='body{font:12px Arial;display:flex;align-content:start;flex-wrap:wrap;gap:4mm}body>div{width:58mm;break-inside:avoid;border:1px dashed #aaa;overflow-wrap:anywhere}';doc.head.append(style);
    for(let i=0;i<+input.value;i++)doc.body.append(doc.importNode(d.querySelector('[data-sticker]'),true));frame.contentWindow.print();
  };
}

function martCheckout(receiving=false){
  const products=martItems();if(!products.length){martProduct();return}
  const cart=new Map(),stock=martStock(rows,date()),options=products.map(p=>'<option value="'+E(p.id)+'">'+E(p.name)+' · '+E(p.code)+'</option>').join('');
  const html='<div class="wide"><label>Scan barcode or QR<input name="scan" autocomplete="off" placeholder="Scan, or type code and press Enter"></label><label>Choose product<select name="item">'+options+'</select></label><div class="actions"><button type="button" class="btn" data-add-line>Add product</button><button type="button" class="btn" data-camera>Scan with camera</button></div><video hidden playsinline muted style="max-width:100%"></video><p data-scan-status role="status"></p><div data-cart></div><h3 data-total></h3></div>'+
    (receiving?input('Supplier','supplier')+input('Amount paid (PKR)','paid','number','min="0" step=".01" value="0"'):'<label>Cash received (PKR)<input name="tendered" type="number" min="0" step=".01" placeholder="Exact amount"></label><p data-change aria-live="polite"></p>');
  const d=dialog(receiving?'Receive mart stock':'Mart checkout',html,receiving?'Save stock receipt':'Complete cash sale',async b=>{
    if(!cart.size)throw Error('Add at least one product.');
    const lines=Array.from(cart,([item,line])=>({item,...line}));
    const transaction=martMove(receiving?'receipt':'sale',receiving?b.supplier.trim():'Cash sale',lines,receiving?+b.paid:0);
    if(receiving&&transaction.paid>transaction.buy)throw Error('Payment exceeds this purchase.');
    if(!receiving){
      transaction.tendered=b.tendered===''?transaction.sale:Number(b.tendered);
      transaction.cashier=staffUser.name;
      if(transaction.tendered<transaction.sale)throw Error('Cash received is below the sale total.');
    }
    const next=rows.map(p=>receiving&&p.type==='Mart item'&&cart.has(p.id)?{...p,cost:cart.get(p.id).price}:p);
    await save([...next,transaction]);
  });
  const scan=d.querySelector('[name=scan]'),status=d.querySelector('[data-scan-status]');
  function total(){
    const amount=martMoney(sum([...cart.values()],l=>martMoney(l.qty*l.price)));
    d.querySelector('[data-total]').textContent='Total · PKR '+fmt(amount);
    if(!receiving){
      const v=d.querySelector('[name=tendered]').value,diff=martMoney((v===''?amount:Number(v))-amount);
      d.querySelector('[data-change]').textContent=(diff<0?'Still due':'Change due')+' · PKR '+fmt(Math.abs(diff));
    }
  }
  if(!receiving)d.querySelector('[name=tendered]').oninput=total;
  function draw(){
    d.querySelector('[data-cart]').innerHTML=table(['Product','Qty',receiving?'Unit cost':'Sale price',''],[...cart].map(([id,l])=>[E(l.name),'<input aria-label="Quantity" style="width:5em" data-qty="'+E(id)+'" required type="number" min="1" step="1" value="'+l.qty+'">',receiving?'<input aria-label="Unit cost" style="width:7em" data-price="'+E(id)+'" required type="number" min="0" step=".01" value="'+l.price+'">':fmt(l.price),'<button type="button" data-drop="'+E(id)+'">Remove</button>']),'Scan or choose a product.');total();
  }
  function add(p){
    if(!p){status.textContent='Unknown code. Add the product to inventory first.';return}
    const line=cart.get(p.id)||{name:p.name,qty:0,price:receiving?p.cost:p.price};
    if(!receiving&&line.qty+1>(stock.get(p.id)||0)){status.textContent='Insufficient stock for '+p.name+'.';return}
    line.qty++;cart.set(p.id,line);status.textContent=p.name+' added.';draw();scan.value='';scan.focus();
  }
  scan.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add(products.find(p=>p.code===scan.value.trim()));scan.select()}};
  d.querySelector('[data-add-line]').onclick=()=>add(products.find(p=>p.id===d.querySelector('[name=item]').value));
  d.querySelector('[data-cart]').oninput=e=>{const id=e.target.dataset.qty||e.target.dataset.price;if(id){cart.get(id)[e.target.dataset.qty?'qty':'price']=Number(e.target.value);total()}};
  d.querySelector('[data-cart]').onclick=e=>{if(e.target.dataset.drop){cart.delete(e.target.dataset.drop);draw()}};
  let stream,timer,attempt=0;const video=d.querySelector('video'),camera=d.querySelector('[data-camera]');
  function stop(){attempt++;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;camera.textContent='Scan with camera'}
  d.addEventListener('close',stop);
  camera.onclick=async()=>{
    if(stream){stop();return}
    if(!window.BarcodeDetector||!navigator.mediaDevices?.getUserMedia){status.textContent='Use a USB/Bluetooth scanner, enter the code, or choose the product on this browser.';return}
    const n=++attempt;camera.disabled=true;
    try{
      const detector=new BarcodeDetector();const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
      if(n!==attempt||!d.open){media.getTracks().forEach(t=>t.stop());return}
      stream=media;video.srcObject=stream;video.hidden=false;await video.play();camera.textContent='Stop camera';
      async function detect(){if(n!==attempt||!d.open)return;try{const hits=await detector.detect(video);if(n!==attempt)return;if(hits.length){stop();add(products.find(p=>p.code===hits[0].rawValue));return}timer=setTimeout(detect,200)}catch{stop();status.textContent='Camera scan unavailable. Enter the product code.'}}
      detect();
    }catch{stop();status.textContent='Camera unavailable. Use the scanner field or choose a product.'}finally{camera.disabled=false}
  };
  draw();scan.focus();
}
function martDetails(r){
  const d=document.createElement('dialog');d.innerHTML='<h2>'+E(r.name)+'</h2><p>'+E(r.date)+'</p>'+table(['Product','Qty','Unit PKR','Total PKR'],r.lines.map(l=>[E(l.name),fmt(l.qty),fmt(l.price),fmt(martMoney(l.qty*l.price))]))+'<p>Total · PKR '+fmt(r.sale||r.buy||r.opening)+'</p><button class="btn">Close</button>';
  document.body.append(d);d.onclose=()=>d.remove();d.querySelector('button').onclick=()=>d.close();
  if(r.movement==='sale'){
    const title=d.querySelector('h2');title.textContent=$('stationBrand').textContent+' · Sales receipt';
    title.insertAdjacentHTML('afterend','<p>Receipt '+E(r.id)+'<br>'+E(r.cashier||'')+'</p>');
    if(r.tendered!==undefined)d.querySelector('button').insertAdjacentHTML('beforebegin','<p>Cash received · PKR '+fmt(r.tendered)+'<br>Change · PKR '+fmt(martMoney(r.tendered-r.sale))+'</p>');
    const print=document.createElement('button');print.className='btn primary';print.textContent='Print receipt';d.append(print);print.onclick=()=>{
      d.querySelector('iframe')?.remove();const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-200vw';d.append(frame);
      const doc=frame.contentDocument;doc.title='Mart receipt '+r.id;const style=doc.createElement('style');style.textContent='body{font:12px sans-serif;max-width:80mm;margin:auto}table{width:100%;border-collapse:collapse}th,td{padding:3px;text-align:left}p,td{overflow-wrap:anywhere}';doc.head.append(style);
      for(const node of d.children)if(!node.matches('button,iframe'))doc.body.append(doc.importNode(node,true));
      frame.contentWindow.print();
    };
  }
  d.showModal();
}
document.addEventListener('click',e=>{
  if(page!==3||!staffUser||isSales())return;
  const el=e.target;
  if(el.dataset.mart==='product')martProduct();
  if(el.dataset.mart==='receipt')martCheckout(true);
  if(el.dataset.mart==='legacy')show('Mart');
  if(el.dataset.count)martCount(get('Mart item').find(p=>p.id===el.dataset.count));
  if(el.dataset.product)martProduct(get('Mart item').find(r=>r.id===el.dataset.product));
  if(el.dataset.label)martLabels(get('Mart item').find(r=>r.id===el.dataset.label));
  if(el.dataset.receipt)martDetails(get('Mart').find(r=>r.id===el.dataset.receipt));
});
document.addEventListener('input',e=>{if(e.target.id==='martSearch'){
  const q=e.target.value.toLowerCase();for(const row of e.target.closest('section').querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(q);
}});

