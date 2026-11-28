'use strict';
const $=s=>document.getElementById(s), E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), fmt=n=>Number(n).toLocaleString('en-PK',{maximumFractionDigits:2}), fuel=['Petrol','High speed diesel'], shifts=['Morning','Evening','Night'], key='forecourt-ledger-v1';
const types=['Reading','Delivery','Mart','Customer debit','Cash entry','Nozzle'];
const pages=['Overview','Nozzle shifts','Deliveries','Mart','Customer debit','Cash book','Monthly report','Setup'];
const days=['Daily station overview','Nozzle shifts','Fuel deliveries','Mart sales and inventory','Customer debit','Cash book','Monthly report','Station setup'];
const desc=['Fuel, sales and shift activity for your selected day.','Assign an attendant and record each meter handover.','Record opening stock and litres received from suppliers.','Scan products, receive stock and record counter sales.','Track credit purchases, repayments and customer balances.','Record expenses, investments, discounts and cash adjustments.','Daily movement and closing balances for the selected month.','Manage nozzles and back up the station ledger.'];
const initial=()=>fuel.flatMap((f,i)=>['A','B'].map((v,j)=>({id:'n'+i+j,type:'Nozzle',name:(i?'Diesel ':'Petrol ')+v,fuel:f,status:'Active',tank:''})));
let rows=[],page=0,editing=null,kind;
const today=new Date();$('date').value=new Date(today-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
const date=()=>$('date').value, get=t=>rows.filter(r=>r.type===t), net=r=>r.close===''?0:r.readingMode==='remaining'?r.open-r.close:r.close-r.open-r.returned, sum=(a,fn)=>a.reduce((s,r)=>s+fn(r),0);
const fields={
'Mart count':[['date','Date','date'],['reason','Reason','text'],['actor','Recorded by','text']],
'Mart item':[['name','Product','text'],['code','Barcode','text'],['cost','Unit cost','zero'],['price','Sale price','zero']],
Customer:[['name','Customer name','text']],
Reading:[['date','Business date','date'],['nozzle','Nozzle','nozzles'],['shift','Shift',shifts],['person','Attendant','text'],['open','Opening meter (L)','num'],['close','Closing meter (L) · optional','optional'],['returned','Returned to tank (L)','zero'],['cost','Purchase rate (PKR/L)','num'],['rate','Sale rate (PKR/L)','num']],
Delivery:[['date','Date','date'],['fuel','Fuel',fuel],['company','Supplier / opening stock','text'],['qty','Received (L)','num'],['cost','Unit cost (PKR/L)','num'],['paid','Cash paid (PKR)','zero']],
Mart:[['date','Date','date'],['name','Supplier / description','text'],['sale','Sales (PKR)','zero'],['buy','Purchases (PKR)','zero'],['paid','Paid (PKR)','zero'],['opening','Opening stock value (PKR)','zero'],['cash','Opening cash (PKR)','zero']],
'Customer debit':[['date','Date','date'],['name','Customer','text'],['opening','Opening balance (PKR)','zero'],['buy','Fuel sold on credit (PKR)','zero'],['paid','Repayment (PKR)','zero']],
'Cash entry':[['date','Date','date'],['category','Category',['Expense','Discount','Investment','Cash added','Cash withdrawn','Opening cash']],['name','Description','text'],['amount','Amount (PKR)','num']],
'Fuel type':[['name','Fuel type name','text']],
Tank:[['name','Tank name','text'],['fuel','Fuel',fuel],['date','Opening stock date','date'],['opening','Opening stock (L)','zero']],
Nozzle:[['name','Nozzle name','text'],['fuel','Fuel',fuel],['status','Status',['Active','Retired']],['cost','Fuel purchase rate (PKR/L)','zero']]};
const typeForPage=['Reading','Reading','Delivery','Mart','Customer debit','Cash entry',null,'Nozzle'];
function stats(a){const group=t=>a.filter(r=>r.type===t), s=(t,f)=>sum(group(t),f), rev=s('Reading',r=>net(r)*r.rate), mart=s('Mart',r=>r.sale), adj=c=>s('Cash entry',r=>r.category===c?r.amount:0), expenses=adj('Expense'),disc=adj('Discount'),martcash=s('Mart',r=>r.cash+r.sale-r.paid);
return {litres:s('Reading',net),rev,mart,gross:s('Reading',r=>net(r)*(r.rate-r.cost)),expenses,disc,stock:f=>s('Delivery',r=>r.fuel===f?r.qty:0)-s('Reading',r=>r.fuel===f?net(r):0),debit:s('Customer debit',r=>r.opening+r.buy-r.paid),martstock:s('Mart',r=>r.opening+r.buy-r.sale),martcash,cash:rev+martcash+s('Customer debit',r=>r.paid-r.buy)-s('Delivery',r=>r.paid)+adj('Opening cash')+adj('Investment')+adj('Cash added')-adj('Cash withdrawn')-expenses-disc};}
function card(k,v){return '<div class="card"><small>'+k+'</small><b>'+v+'</b></div>'}
function table(headers,body,empty='No entries for this date.'){return '<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+E(h)+'</th>').join('')+'</tr></thead><tbody>'+body.map(a=>'<tr>'+a.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+(body.length?'':'<div class="empty">'+empty+'</div>')+'</div>'}
function panel(title,content){return '<section><div class="head"><h2>'+title+'</h2></div>'+content+'</section>'}
const nozzleName=id=>get('Nozzle').find(n=>n.id===id)?.name||'Retired nozzle';
const edit=r=>r.owner?shiftControls(r):'<button data-id="'+E(r.id)+'">Edit</button>';
function shiftTime(r){
  if(r.startTime)return r.startTime;
  const recorded=new Date(r.started);
  return r.started&&Number.isFinite(recorded.getTime())?recorded.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'
}
function shiftGroupKey(r){
  if(r.batchId)return JSON.stringify(['batch',r.batchId]);
  if(r.owner&&r.startTime)return JSON.stringify(['handover',r.owner,r.date,r.shift,r.startTime]);
  return JSON.stringify(['reading',r.id]);
}
function readings(entries){
  const groups=new Map();
  for(const r of entries){
    const key=shiftGroupKey(r);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(r);
  }
  const body=Array.from(groups.values(),members=>{
    const first=members[0],single=members.length===1,open=members.find(r=>r.close==='');
    let control=single?(page===1&&!open&&!first.owner&&staffUser?.role==='admin'?'':edit(first)):'<button data-shift-details="'+E(first.id)+'" aria-expanded="false">View nozzles</button>'+
      (open&&first.batchId?' <button data-close="'+E(open.id)+'">Close shift</button>':'');
    if(page===1&&!open&&staffUser?.role==='admin')control+=' <button data-edit-completed="'+E(first.id)+'">Edit shift</button> <button data-delete-completed="'+E(first.id)+'">Delete shift</button>';
    return [E(first.date),E(first.shift),E(shiftTime(first)),E(first.person),single?E(nozzleName(first.nozzle)):members.length+' nozzles',
      fmt(sum(members,r=>r.open)),open?'On shift':fmt(sum(members,r=>r.close)),fmt(sum(members,r=>r.returned)),
      fmt(sum(members,net)),fmt(sum(members,r=>net(r)*r.rate)),control];
  });
  return table(['Date','Shift','Start time','Attendant','Nozzles','Opening L','Closing L','Returns L','Sold L','Sales PKR',''],body,'No shift readings yet. Add a reading to start a shift.');
}
function toggleNozzleDetails(button){
  const row=button.closest('tr');
  if(button.getAttribute('aria-expanded')==='true'){
    row.nextElementSibling.remove();button.setAttribute('aria-expanded','false');button.textContent='View nozzles';return;
  }
  const first=get('Reading').find(r=>r.id===button.dataset.shiftDetails);
  if(!first)return;
  const members=get('Reading').filter(r=>shiftGroupKey(r)===shiftGroupKey(first));
  const detail=row.parentElement.insertRow(row.sectionRowIndex+1),cell=detail.insertCell();
  cell.colSpan=row.cells.length;
  cell.innerHTML=table(['Nozzle','Fuel','Opening L','Closing L','Returns L','Sold L','PKR/L','Sales PKR','Meter record'],members.map(r=>[
    E(nozzleName(r.nozzle)),E(r.fuel),fmt(r.open),r.close===''?'On shift':fmt(r.close),fmt(r.returned),fmt(net(r)),fmt(r.rate),fmt(net(r)*r.rate),edit(r)]));
  button.setAttribute('aria-expanded','true');button.textContent='Hide nozzles';
}
function ledger(t,a){let fs=fields[t].filter(f=>f[0]!=='date');return table([...fs.map(f=>f[1]),''],a.map(r=>[...fs.map(([k,,v])=>['num','zero'].includes(v)?fmt(r[k]??0):E(r[k])),edit(r)]))}
function groups(a,fn){let m=new Map;for(const r of a)m.set(r.name,(m.get(r.name)||0)+fn(r));return [...m].map(([n,v])=>[E(n),fmt(v)])}
function fuelTypes(all=rows){return [...fuel,...all.filter(r=>r.type==='Fuel type').map(r=>r.name)]}
const defaultTank=f=>fuel.includes(f)?'default-'+fuel.indexOf(f):'default-fuel-'+f;
function upgradeRecords(all){
  const tanks=new Set(all.filter(r=>r.type==='Tank').map(r=>r.id));
  const customers=new Map(all.filter(r=>r.type==='Customer').map(r=>[r.name,r.id]));
  for(const r of all.slice()){
    if(['Reading','Delivery','Nozzle'].includes(r.type)&&r.fuel){
      if(r.tank===undefined)r.tank=defaultTank(r.fuel);
      if(r.tank===defaultTank(r.fuel)&&!tanks.has(r.tank)){
        all.push({id:r.tank,type:'Tank',name:r.fuel,fuel:r.fuel,date:'1970-01-01',opening:0});
        tanks.add(r.tank)
      }
    }
    if(r.type==='Customer debit'&&!r.customer){
      if(!customers.has(r.name)){
        const id='customer/'+r.name;customers.set(r.name,id);all.push({id,type:'Customer',name:r.name})
      }
      r.customer=customers.get(r.name)
    }
  }
  return all
}
async function deleteTank(id){
  const tank=get('Tank').find(r=>r.id===id);
  if(!tank||!confirm('Delete '+tank.name+' from active tanks? Its historical entries will be kept. Linked nozzles will be unassigned.'))return;
  const used=rows.some(r=>r.tank===id&&r.type!=='Nozzle');
  const next=rows.filter(r=>r.id!==id||used).map(r=>r.id===id?{...r,deleted:true}:r.type==='Nozzle'&&r.tank===id?{...r,tank:''}:r);
  await save(next);$('modal').close()
}

const waSettingKey='forecourt-whatsapp:'+new URL('.',location.href).pathname;
function businessRelay(){
  return localStorage.getItem(waSettingKey)||'';
}
function relayOrigin(value){
  if(!value.trim())return '';
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||!url.hostname.endsWith('.app.github.dev')||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Enter the HTTPS root address of your private Codespaces port.');
  return url.origin;
}
function configureWhatsApp(){
  const fields='<p>Customer profiles can always open WhatsApp with a draft. To use your station’s WhatsApp Business API sender, enter its private GitHub Codespaces address. Leave blank to configure later.</p><label>Business sender URL (optional)<input type="url" name="relay" placeholder="https://…-3100.app.github.dev" value="'+E(businessRelay())+'"></label><a href="https://github.com/iemfaraz/Forecourt-pump-/blob/main/WHATSAPP.md" target="_blank" rel="noopener noreferrer">Business sender setup guide</a>';
  dialog('WhatsApp integration',fields,'Save settings',async b=>{
    const url=relayOrigin(b.relay);
    if(url)localStorage.setItem(waSettingKey,url);else localStorage.removeItem(waSettingKey);
    render();
  });
}
function customerWhatsApp(pdf=false){
  const person=get('Customer').find(p=>p.id===selectedCustomer);
  if(!person)return;
  let number=(person.phone||'').trim().replace(/[\s()-]/g,'').replace(/^\+/,'').replace(/^00/,'');
  if(/^03\d{9}$/.test(number))number='92'+number.slice(1);
  if(!/^[1-9]\d{7,14}$/.test(number)){
    alert('Add the customer’s WhatsApp phone number with country code in Edit profile first.');
    show('Customer',person);return;
  }
  const day=date(),activity=get('Customer debit').filter(r=>r.customer===person.id&&r.date<=day);
  if(pdf){
    const file=creditPdfFile($('stationBrand').textContent,person,day,activity.sort((a,b)=>a.date.localeCompare(b.date)));
    const url=URL.createObjectURL(file),d=document.createElement('dialog');
    d.innerHTML='<h2>Share credit statement PDF</h2><p>'+E(person.name)+' · +'+E(number)+' · Through '+E(day)+'</p><p>Choose WhatsApp and select the customer, or download the PDF and attach it in their chat.</p><div class="actions"><a class="btn" data-download>Download PDF</a><a class="btn" href="https://wa.me/'+number+'" target="_blank" rel="noopener noreferrer">Open customer chat</a><button class="btn" data-dismiss>Close</button></div><p role="status"></p>';
    const download=d.querySelector('[data-download]');download.href=url;download.download=file.name;
    if(navigator.canShare?.({files:[file]})){
      const share=document.createElement('button');share.className='btn primary';share.textContent='Share PDF…';download.before(share);
      share.onclick=async()=>{try{await navigator.share({files:[file]})}catch(err){if(err.name!=='AbortError')d.querySelector('[role=status]').textContent='Download the PDF and attach it in the customer chat.'}};
    }
    d.querySelector('[data-dismiss]').onclick=()=>d.close();d.onclose=()=>{URL.revokeObjectURL(url);d.remove()};
    document.body.append(d);d.showModal();return;
  }
  const current=activity.filter(r=>r.date===day);
  const opening=sum(activity.filter(r=>r.date<day),r=>r.opening+r.buy-r.paid)+sum(current,r=>r.opening);
  const credit=sum(current,r=>r.buy),paid=sum(current,r=>r.paid);
  const values=[$('stationBrand').textContent,person.name,day,...[opening,credit,paid,opening+credit-paid].map(fmt)];
  const slip=creditSlip(person,day,activity);
  const message=[values[0],'CUSTOMER CREDIT SLIP · '+slip.ref,'Customer: '+person.name,'Date: '+day,'','Opening balance today: PKR '+values[3],'Credit added today: PKR '+values[4],'Paid today: PKR '+values[5],'','Total credit issued: PKR '+fmt(slip.credit),'Total paid: PKR '+fmt(slip.paid),slip.label+': PKR '+fmt(Math.abs(slip.balance))].join('\n');
  const chat='https://wa.me/'+number+'?text='+encodeURIComponent(message);
  const actions=document.createElement('dialog');
  actions.innerHTML='<h2>WhatsApp credit update</h2><p>To '+E(person.name)+' · +'+E(number)+'</p><pre style="white-space:pre-wrap">'+E(message)+'</pre><div class="actions"><button class="btn" type="button">Close</button><a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+E(chat)+'">Open in WhatsApp</a></div>';
  if(businessRelay()){
    const link=document.createElement('a');link.className='btn';link.textContent='Review in Business sender';link.target='_blank';link.rel='noopener noreferrer';
    link.href=relayOrigin(businessRelay())+'/#'+encodeURIComponent(JSON.stringify({to:number,values}));
    actions.querySelector('.actions').append(link);
  }
  actions.querySelector('button').onclick=()=>actions.close();actions.onclose=()=>actions.remove();
  document.body.append(actions);actions.showModal();
}

let selectedCustomer='';
function customerReport(){
  const profiles=get('Customer').sort((a,b)=>a.name.localeCompare(b.name));
  const person=profiles.find(r=>r.id===selectedCustomer)||profiles[0];
  if(!person)return panel('Customer profiles','<p>Add your first customer to record credit and payments.</p>');
  selectedCustomer=person.id;
  const slip=creditSlip(person,date(),get('Customer debit').filter(r=>r.customer===person.id)),entries=slip.items;
  let balance=0;
  const activity=entries.map(r=>{
    balance+=r.opening+r.buy-r.paid;
    return [E(r.date),fmt(r.opening),fmt(r.buy),fmt(r.paid),fmt(balance),edit(r)]
  });
  return panel('Customer profiles','<label>Customer <select id="customerProfile">'+profiles.map(p=>'<option value="'+E(p.id)+'" '+(p.id===person.id?'selected':'')+'>'+E(p.name)+'</option>').join('')+'</select></label><div class="actions"><button class="btn" data-id="'+E(person.id)+'">Edit profile</button><button class="btn" id="addCredit">Add daily credit</button><button class="btn" id="receivePayment">Receive payment</button><button class="btn" id="whatsAppCredit">Send credit update on WhatsApp</button><button class="btn" id="whatsAppPdf">Share PDF on WhatsApp</button><button class="btn" id="printCustomer">Print / Save PDF</button></div>')+
    '<section id="customerStatement"><div class="sliphead"><strong>'+E($('stationBrand').textContent)+'</strong><span>'+E(slip.ref)+'</span></div><h2>Customer credit slip</h2><p>Statement through '+E(date())+' · PKR</p><div class="slipcustomer">Customer<br><b>'+E(person.name)+'</b><br>'+[person.phone,person.address].filter(Boolean).map(E).join(' · ')+'</div><div class="cards">'+card('Opening balances',fmt(slip.opening))+card('Total credit issued',fmt(slip.credit))+card('Total paid',fmt(slip.paid))+'</div><h3 class="slipbalance">'+slip.label+' · PKR '+fmt(Math.abs(slip.balance))+'</h3>'+table(['Date','Opening balance','Credit','Payment received','Running balance',''],activity,'No activity recorded for this customer.')+'</section>'
}
function customerEntry(payment){
  const person=get('Customer').find(p=>p.id===selectedCustomer);if(!person)return;
  const fields=input('Date','date','date','value="'+date()+'"')+input(payment?'Payment received (PKR)':'Credit issued (PKR)','amount','number','min="0.01" step="0.01"')+(payment?'':input('Opening balance (PKR)','opening','number','min="0" step="0.01" value="0"'));
  dialog((payment?'Receive payment':'Add credit')+' · '+E(person.name),fields,'Save entry',async b=>{
    await save([...rows,{type:'Customer debit',id:crypto.randomUUID(),customer:person.id,name:person.name,date:b.date,opening:Number(b.opening||0),buy:payment?0:Number(b.amount),paid:payment?Number(b.amount):0}])
  })
}
function stationTanks(){
  return get('Tank')
}
function tankCards(past,dt){
  return stationTanks().filter(t=>!t.deleted&&(!t.date||t.date<=dt)).map(t=>{
    const movements=past.filter(r=>r.tank===t.id);
    const stock=(t.opening||0)+stats(movements).stock(t.fuel);
    return '<div class="tank '+(t.fuel===fuel[1]?'diesel':'')+'"><h2>'+E(t.name)+'</h2><b>'+fmt(stock)+' L</b><small>Closing tank stock</small><div class="vessel" aria-hidden="true"></div></div>'
  }).join('')
}
function tankOptions(f,selected){
  return stationTanks().filter(t=>t.fuel===f&&(!t.deleted||t.id===selected)).map(t=>'<option value="'+E(t.id)+'" '+(selected===t.id?'selected':'')+'>'+E(t.name)+'</option>').join('')
}
  function nozzleCell(r){
  const when=t=>t?E(new Date(t).toLocaleString()):'—';
    const done=r.close!=='';
    const photo=stage=>!r.owner||r[stage+'Photo']===false?'':'<button data-workphoto="'+E(r.id)+'" data-stage="'+stage+'">'+(stage==='opening'?'Opening photo':'Closing photo')+'</button>';
    const lines=[['Fuel',E(r.fuel)],['Opening L',fmt(r.open)],['Closing L',done?fmt(r.close):'—'],['Returns L',fmt(r.returned||0)],['Sold L',done?fmt(net(r)):'—'],['PKR/L',fmt(r.rate)],['Sales PKR',done?fmt(net(r)*r.rate):'—'],['Opened by',E(r.openedBy||r.person)],['Closed at',when(r.ended)],['Closed by',E(r.closedBy||'—')]];
    return '<dl class="nozzle-values">'+lines.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl>'+photo('opening')+(done?photo('closing'):'')
  }
let progressPeriod='Daily',progressOwner='';
const reportOwner=r=>r.owner||'legacy:'+r.person;
function progressDates(selected,period){
  const start=new Date(selected+'T00:00:00Z'),end=new Date(start);
  if(period==='Weekly'){
    start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
    end.setTime(start.getTime());end.setUTCDate(start.getUTCDate()+6)
  }else if(period==='Monthly'){
    start.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1,0)
  }else if(period==='Yearly'){
    start.setUTCMonth(0,1);end.setUTCMonth(11,31)
  }
  return [start,end].map(d=>d.toISOString().slice(0,10))
}
function progressUsers(){
  const names=new Map(get('Reading').map(r=>[reportOwner(r),r.person]));
  for(const user of accountList)names.set(user.id,user.name+' ('+user.login+')');
  return names
}
function progressShiftTable(entries){
  const groups=new Map(),used=new Set();
  for(const r of entries){
    const key=shiftGroupKey(r);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(r);used.add(r.nozzle)
  }
  const nozzles=Array.from(new Set([...get('Nozzle').filter(n=>n.status==='Active'||used.has(n.id)).map(n=>n.id),...used]));
  const body=Array.from(groups.values(),members=>{
    const r=members[0],closed=members.filter(n=>n.close!=='');
    return [E(r.date),E(r.person),E(r.shift),E(shiftTime(r)),closed.length===members.length?'Closed':'Open',...nozzles.map(id=>members.filter(n=>n.nozzle===id).map(nozzleCell).join('<hr>')||'—'),fmt(sum(closed,net)),fmt(sum(closed,n=>net(n)*n.rate))]
  });
  return '<h3>Shift details</h3>'+table(['Date','Salesperson','Shift','Start time','Status',...nozzles.map(nozzleName),'Total sold L','Total sales PKR'],body,'No shifts recorded for this selection.')
}
function progressReport(){
  const [from,to]=progressDates(date(),progressPeriod);
  const entries=rows.filter(r=>r.date>=from&&r.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
  const deliveries=entries.filter(r=>r.type==='Delivery'),mart=entries.filter(r=>r.type==='Mart'),cash=entries.filter(r=>r.type==='Cash entry'),credit=entries.filter(r=>r.type==='Customer debit');
  const totals=stats(entries),opening=stats(rows.filter(r=>r.date<from)).cash;
  const shifts=entries.filter(r=>r.type==='Reading'&&(!progressOwner||reportOwner(r)===progressOwner));
  const title='<h2>'+progressPeriod+' progress report</h2><p>'+from+(from===to?'':' through '+to)+' · '+E(progressOwner?progressUsers().get(progressOwner):'All users')+'</p>';
  const shiftTable=progressShiftTable(shifts);
  if(progressOwner)return title+'<div class="cards">'+card('Fuel sold · L',fmt(sum(shifts,net)))+card('Fuel sales · PKR',fmt(sum(shifts,r=>net(r)*r.rate)))+'</div>'+shiftTable;
  return title+
    '<div class="cards">'+card('Delivered · L',fmt(sum(deliveries,r=>r.qty)))+card('Fuel sold · L',fmt(totals.litres))+card('Fuel sales · PKR',fmt(totals.rev))+card('Mart sales · PKR',fmt(totals.mart))+'</div>'+shiftTable+
    '<h3>Deliveries</h3>'+table(['Date','Supplier','Fuel','Tank','Litres','Unit cost · PKR','Paid · PKR'],deliveries.map(r=>[E(r.date),E(r.company),E(r.fuel),E(stationTanks().find(t=>t.id===r.tank)?.name||'Unassigned'),fmt(r.qty),fmt(r.cost),fmt(r.paid)]),'No deliveries in this period.')+
    '<h3>Mart</h3>'+table(['Date','Description','Sales · PKR','Purchases · PKR','Paid · PKR'],mart.map(r=>[E(r.date),E(r.name),fmt(r.sale),fmt(r.buy),fmt(r.paid)]),'No mart entries in this period.')+
    '<h3>Cash book</h3><div class="cards">'+card('Opening cash · PKR',fmt(opening))+card('Net cash movement · PKR',fmt(totals.cash))+card('Closing cash · PKR',fmt(opening+totals.cash))+'</div>'+
    table(['Date','Category','Description','Amount · PKR'],cash.map(r=>[E(r.date),E(r.category),E(r.name),fmt(r.amount)]),'No cash-book entries in this period.')+
    '<h3>Customer credit and repayments</h3>'+table(['Date','Customer','Fuel on credit · PKR','Repaid · PKR'],credit.map(r=>[E(r.date),E(r.name),fmt(r.buy),fmt(r.paid)]),'No customer credit entries in this period.')
}
function overviewActions(){
  return '<section class="overview-actions"><div class="head"><h2>Station progress</h2></div><div class="actions"><label>Report period <select id="progressPeriod">'+['Daily','Weekly','Monthly','Yearly'].map(v=>'<option '+(v===progressPeriod?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>User <select id="progressOwner"><option value="">All users</option>'+Array.from(progressUsers(),([id,name])=>'<option value="'+E(id)+'" '+(progressOwner===id?'selected':'')+'>'+E(name)+'</option>').join('')+'</select></label><button class="btn" id="viewProgress">View report</button><button class="btn" id="printProgress">Print / Save PDF</button><button class="btn" id="addTank">＋ Add tank</button><button class="btn" id="addFuel">＋ Add fuel type</button><button class="btn" data-all-shift>Start all-nozzle shift</button></div></section>'
}
function printProgress(source='progressReport'){
  document.getElementById('reportFrame')?.remove();
  const frame=document.createElement('iframe');frame.id='reportFrame';frame.title='Printable station report';
  frame.style.cssText='position:fixed;left:-200vw;width:1000px;height:600px;border:0';document.body.append(frame);
  const doc=frame.contentDocument;doc.title=$('stationBrand').textContent+' '+progressPeriod+' progress '+date();
  const style=doc.createElement('style');
  style.textContent='@page{size:A4 landscape;margin:12mm}body{font:10pt Arial,sans-serif;color:#17212b}.cards{display:flex;gap:20px;margin:12px 0}.card{display:grid;gap:4px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border:1px solid #aaa;padding:4px}thead{display:table-header-group}tr{break-inside:avoid}h3{break-after:avoid}td{vertical-align:top;overflow-wrap:anywhere}dl,dd{margin:0}dt{color:#52655c}dd{margin-bottom:3px}.scroll table{font-size:8pt}';
  if(source==='customerStatement')style.textContent+='@page{size:A4 portrait}#customerStatement{background:white;border-top:4px solid #145548;padding:20px}.sliphead,.slipbalance{display:flex;justify-content:space-between;color:#145548}.sliphead{gap:12px;flex-wrap:wrap}.slipcustomer,.slipbalance{padding:12px;background:#eef4f1}.slipcustomer b{font-size:1.3em}.slipbalance{border-block:1px solid #a7bfb6}';
  doc.head.append(style);const stationHeading=doc.createElement('h1');stationHeading.textContent=$('stationBrand').textContent;if(source!=='customerStatement')doc.body.append(stationHeading);const printed=$(source).cloneNode(true);if(source==='customerStatement')doc.title=$('stationBrand').textContent+' · '+printed.querySelector('h2').textContent;printed.querySelectorAll('button').forEach(b=>b.remove());doc.body.append(printed);frame.contentWindow.focus();frame.contentWindow.print()
}
function render(){if(!staffUser)return;let dt=date(),a=rows.filter(r=>r.date===dt),past=rows.filter(r=>r.date<=dt),d=stats(a),p=stats(past),v='',t=typeForPage[page];
$('nav').innerHTML=pages.map((n,i)=>'<button data-page="'+i+'" class="'+(i===page?'on':'')+'" '+(i===page?'aria-current="page"':'')+'>'+n+'</button>').join('');
$('title').textContent=days[page];$('sub').textContent=desc[page];$('add').textContent=t?'＋ Add '+t.toLowerCase():'Print report';$('date').hidden=page===7;
if(!page){v='<div class="cards metric-strip">'+card('Fuel sales · PKR',fmt(d.rev))+card('Fuel sold · litres',fmt(d.litres))+card('Mart sales · PKR',fmt(d.mart))+card('Cash in hand · PKR',fmt(p.cash))+'</div><div class="tanks">'+tankCards(past,dt)+'</div>'+overviewActions()+'<section><article id="progressReport" tabindex="-1">'+progressReport()+'</article></section>'+panel('Shift readings',readings(a.filter(r=>r.type==='Reading')));}
else if(page===1)v='<div class="actions"><button class="btn" data-all-shift>Start all-nozzle shift</button></div>'+panel('Daily shift register',readings(a.filter(r=>r.type===t)));
else if(page===3){$('add').textContent='＋ New sale';v=martView(d,p)}
else if(page===4){$('add').textContent='＋ Add customer';v=customerReport()}
else if(page>=2&&page<=5){if(page===3)v='<div class="cards">'+card('Sales today · PKR',fmt(d.mart))+card('Stock value · PKR',fmt(p.martstock))+card('Mart cash · PKR',fmt(p.martcash))+'</div>';v+=panel('Daily entries',ledger(t,a.filter(r=>r.type===t)));if(page===3||page===4)v+=panel(page===3?'Supplier balances':'Customer balances',table(['Account','Remaining PKR'],groups(past.filter(r=>r.type===t&&(page===4||r.buy||r.paid)),r=>(page===4?r.opening:0)+r.buy-r.paid),'No accounts recorded.'));}
else if(page===6){const month=dt.slice(0,7),m=rows.filter(r=>r.date?.startsWith(month)),dates=[...new Set(m.map(r=>r.date))].sort(),s=stats(m);v='<div class="cards">'+card('Fuel revenue · PKR',fmt(s.rev))+card('Fuel margin · PKR',fmt(s.gross))+card('Mart revenue · PKR',fmt(s.mart))+card('Expenses · PKR',fmt(s.expenses))+'</div>'+panel('Monthly balance · '+month,table(['Date','Fuel L','Fuel sales','Fuel margin','Mart sales','Expenses','Discount','Customer debit¹','Cash in hand¹'],dates.map(x=>{let b=stats(m.filter(r=>r.date===x)),c=stats(rows.filter(r=>r.date<=x));return [x,...[b.litres,b.rev,b.gross,b.mart,b.expenses,b.disc,c.debit,c.cash].map(fmt)]}),'No entries for this month.'))+'<small>Amounts in PKR. ¹ Closing balances include prior periods.</small>';}
else v=panel('Station tanks','<button class="btn" id="addTank">＋ Add tank</button><button class="btn" id="addFuel">＋ Add fuel type</button>'+table(['Tank','Fuel','Opening stock (L)',''],stationTanks().filter(t=>!t.deleted).map(t=>[E(t.name),E(t.fuel),fmt(t.opening||0),edit(t)+' <button data-delete-tank="'+E(t.id)+'">Delete</button>'])))+panel('Station nozzles',ledger('Nozzle',get('Nozzle')))+panel('Station backup','<p>Export all entries or restore a saved station backup on this device.</p><div class="actions"><button class="btn" id="backup">Export backup</button><label class="btn">Restore backup<input hidden type="file" id="restore" accept=".json"></label></div>');
$('view').innerHTML=v;staffLayout();}
function show(t,r){if(t==='Reading'&&!r)return shiftForm();kind=t;editing=r?.id||null;$('ft').textContent=(r?'Edit ':'Add ')+t.toLowerCase();$('err').textContent='';$('remove').hidden=!r;
$('fields').innerHTML=fields[t].map(([k,label,def])=>{let value=r?.[k]??(def==='date'?date():def==='zero'?0:''),opts=def==='nozzles'?get('Nozzle').filter(n=>n.status==='Active'||n.id===r?.nozzle).map(n=>[n.id,n.name]):Array.isArray(def)?(def===fuel?fuelTypes():def).map(o=>[o,o]):null;return '<label>'+E(label)+(opts?'<select name="'+k+'" required>'+opts.map(([val,n])=>'<option value="'+E(val)+'" '+(val===value?'selected':'')+'>'+E(n)+'</option>').join('')+'</select>':'<input name="'+k+'" '+(def==='optional'?'':'required')+' type="'+(['zero','num','optional'].includes(def)?'number" min="0" step="any':def)+'" value="'+E(value)+'">')+'</label>'}).join('');if(t==='Customer')$('fields').insertAdjacentHTML('beforeend','<label>Phone (optional)<input name="phone" maxlength="60" value="'+E(r?.phone||'')+'"></label><label>Address (optional)<input name="address" maxlength="240" value="'+E(r?.address||'')+'"></label>');
if(t==='Customer debit')$('form').elements.name.readOnly=true;
if(t==='Nozzle'||t==='Delivery'){
  const form=$('form').elements;
  $('fields').insertAdjacentHTML('beforeend','<label>Tank<select name="tank" required>'+tankOptions(form.fuel.value,r?.tank)+'</select></label>');
  form.fuel.onchange=()=>{form.tank.innerHTML=tankOptions(form.fuel.value)}
}if(t==='Reading'&&!r)prefill();$('modal').showModal();}
const order=r=>r.date+shifts.indexOf(r.shift);
function prefill(){let el=$('form').elements,cur={date:el.date.value,shift:el.shift.value},prior=get('Reading').filter(r=>r.nozzle===el.nozzle.value&&order(r)<order(cur)).sort((a,b)=>order(b).localeCompare(order(a)))[0];el.open.value=prior?.close??'';el.rate.value=prior?.rate??'';el.cost.value=prior?.cost??'';}
function validate(all){
  validateMart(all);
  const available= fuelTypes(all);
  if(new Set(available.map(v=>String(v).trim().toLowerCase())).size!==available.length)throw Error('This fuel type already exists.');
  let ids=new Set;for(const r of all){if(!fields[r.type]||typeof r.id!=='string'||ids.has(r.id))throw Error('Invalid or duplicate record.');ids.add(r.id);for(const [k,,def] of fields[r.type]){let v=r[k];if(r.type==='Nozzle'&&k==='cost'&&v===undefined)continue;if(def==='optional'&&v==='')continue;if(['num','zero','optional'].includes(def)){if(!Number.isFinite(v)||v<0)throw Error('Enter a valid positive amount or zero.')}else if(typeof v!=='string'||!v.trim()||(Array.isArray(def)&&!(def===fuel?available:def).includes(v))||(def==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v)))throw Error('Check the entry fields.');}}
for(const r of all.filter(x=>x.tank)){
  const tank=all.find(t=>t.id===r.tank&&t.type==='Tank'&&t.fuel===r.fuel);
  if(!tank||r.date&&r.date<tank.date)throw Error('Keep the assigned tank, fuel and opening date consistent with its records.');
}
for(const n of all.filter(r=>r.type==='Reading'))if(!all.some(r=>r.type==='Nozzle'&&r.id===n.nozzle&&r.fuel===n.fuel))throw Error('A nozzle with readings must retain its fuel type. Retire it to preserve its history.');
for(const nozzle of all.filter(r=>r.type==='Nozzle')){let p;for(const r of all.filter(x=>x.nozzle===nozzle.id).sort((a,b)=>order(a).localeCompare(order(b)))){if(r.readingMode==='remaining'&&r.close!==''&&r.close>r.open)throw Error('Closing litres remaining cannot exceed opening litres.');if(r.close!==''&&net(r)<-0.000001||r.close===''&&r.returned>0)throw Error('Check the closing meter and returned litres.');if(p&&(order(r)===order(p)||p.close===''||(r.readingMode!=='remaining'&&p.readingMode!=='remaining'&&r.open<p.close)))throw Error('Check for a duplicate shift, unclosed shift or overlapping meter readings.');p=r;}}}
async function save(next){validate(next);await staffSave(next);}
$('form').onchange=e=>{if(!editing&&kind==='Reading'&&['date','nozzle','shift'].includes(e.target.name))prefill()};
$('form').onsubmit=async e=>{e.preventDefault();try{let r={id:editing||crypto.randomUUID(),type:kind};for(const [k,,def] of fields[kind]){let v=$('form').elements[k].value.trim();r[k]=v!==''&&['num','zero','optional'].includes(def)?Number(v):v}if(kind==='Nozzle'||kind==='Delivery')r.tank=$('form').elements.tank.value;
if(kind==='Customer'){if(get('Customer').some(p=>p.id!==r.id&&p.name.toLowerCase()===r.name.toLowerCase()))throw Error('A customer with this name already exists.');selectedCustomer=r.id;r.phone=$('form').elements.phone.value.trim();r.address=$('form').elements.address.value.trim()}
if(kind==='Customer debit'){const old=rows.find(x=>x.id===editing);r.customer=old.customer;r.name=old.name}
if(kind==='Reading')r.fuel=get('Nozzle').find(n=>n.id===r.nozzle).fuel;await save([...rows.filter(x=>x.id!==r.id).map(x=>kind==='Customer'&&x.customer===r.id?{...x,name:r.name}:x),r]);if(r.date){$('date').value=r.date;render()}$('modal').close()}catch(e){$('err').textContent=e.message}};
$('remove').onclick=async()=>{if(kind==='Customer'&&get('Customer debit').some(x=>x.customer===editing)){$('err').textContent='Keep this customer profile while it has ledger entries.';return}if(kind==='Tank'){try{await deleteTank(editing)}catch(err){$('err').textContent=err.message}return}if(confirm('Delete this entry and recalculate balances?'))try{await save(rows.filter(x=>x.id!==editing));$('modal').close()}catch(e){$('err').textContent=e.message}};
$('date').onchange=()=>{if(date())render()};$('add').onclick=()=>page===8?newAccount():page===3?martCheckout():page===4?show('Customer'):page===6?window.print():show(typeForPage[page]);$('nav').onclick=e=>{if(e.target.dataset.page!==undefined){page=Number(e.target.dataset.page);render()}};
$('view').onclick=e=>{if(e.target.id==='whatsAppPdf')customerWhatsApp(true);if(e.target.id==='whatsAppCredit')customerWhatsApp();if(e.target.id==='configureWhatsApp'&&staffUser.role==='admin')configureWhatsApp();if(e.target.dataset.deleteTank)deleteTank(e.target.dataset.deleteTank).catch(err=>alert(err.message));if(e.target.id==='addCredit')customerEntry(false);if(e.target.id==='receivePayment')customerEntry(true);if(e.target.id==='printCustomer')printProgress('customerStatement');if(e.target.hasAttribute('data-shift-details'))toggleNozzleDetails(e.target);if(e.target.id==='viewProgress'){$('progressReport').focus();$('progressReport').scrollIntoView({block:'start'})}if(e.target.hasAttribute('data-all-shift')){if(get('Nozzle').some(n=>n.status==='Active'))batchShift();else alert('Add an active nozzle in Setup first.')} if(e.target.id==='printProgress')printProgress();if(e.target.id==='addTank')show('Tank');if(e.target.id==='addFuel')show('Fuel type');if(e.target.dataset.id){let r=rows.find(r=>r.id===e.target.dataset.id);show(r.type,r)}if(e.target.id==='backup'){let url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forecourt-'+date()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}};
$('view').onchange=async e=>{if(e.target.id==='customerProfile'){selectedCustomer=e.target.value;render();return}if(e.target.id==='progressPeriod'||e.target.id==='progressOwner'){progressPeriod=$('progressPeriod').value;progressOwner=$('progressOwner').value;$('progressReport').innerHTML=progressReport();return}if(e.target.id==='restore'&&e.target.files[0])try{let next=JSON.parse(await e.target.files[0].text());if(!Array.isArray(next))throw Error('Invalid backup.');upgradeRecords(next);validate(next);if(confirm('Replace all station records with this backup?'))await save(next)}catch(err){alert(err.message)}};

