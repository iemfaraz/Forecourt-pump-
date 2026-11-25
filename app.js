'use strict';
const $=s=>document.getElementById(s), E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), fmt=n=>Number(n).toLocaleString('en-PK',{maximumFractionDigits:2}), fuel=['Petrol','High speed diesel'], shifts=['Morning','Evening','Night'], key='forecourt-ledger-v1';
const types=['Reading','Delivery','Mart','Customer debit','Cash entry','Nozzle'];
const pages=['Overview','Nozzle shifts','Deliveries','Mart','Customer debit','Cash book','Monthly report','Setup'];
const days=['Daily station overview','Nozzle shifts','Fuel deliveries','Mart ledger','Customer debit','Cash book','Monthly report','Station setup'];
const desc=['Fuel, sales and shift activity for your selected day.','Assign an attendant and record each meter handover.','Record opening stock and litres received from suppliers.','Track daily sales, purchases and supplier payments.','Track credit purchases, repayments and customer balances.','Record expenses, investments, discounts and cash adjustments.','Daily movement and closing balances for the selected month.','Manage nozzles and back up the station ledger.'];
const initial=()=>fuel.flatMap((f,i)=>['A','B'].map((v,j)=>({id:'n'+i+j,type:'Nozzle',name:(i?'Diesel ':'Petrol ')+v,fuel:f,status:'Active'})));
let rows=[],page=0,editing=null,kind;
const today=new Date();$('date').value=new Date(today-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
const date=()=>$('date').value, get=t=>rows.filter(r=>r.type===t), net=r=>r.close===''?0:r.readingMode==='remaining'?r.open-r.close:r.close-r.open-r.returned, sum=(a,fn)=>a.reduce((s,r)=>s+fn(r),0);
const fields={
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
function readings(a){return table(['Nozzle','Shift','Start time','Attendant','Opening L','Closing L','Returns L','Sold L','Sales PKR',''],a.map(r=>[E(nozzleName(r.nozzle)),E(r.shift),E(shiftTime(r)),E(r.person),fmt(r.open),r.close===''?'On shift':fmt(r.close),fmt(r.returned),fmt(net(r)),fmt(net(r)*r.rate),edit(r)]),'No shift readings yet. Add a reading to start a shift.')}
function ledger(t,a){let fs=fields[t].filter(f=>f[0]!=='date');return table([...fs.map(f=>f[1]),''],a.map(r=>[...fs.map(([k,,v])=>['num','zero'].includes(v)?fmt(r[k]??0):E(r[k])),edit(r)]))}
function groups(a,fn){let m=new Map;for(const r of a)m.set(r.name,(m.get(r.name)||0)+fn(r));return [...m].map(([n,v])=>[E(n),fmt(v)])}
function fuelTypes(all=rows){return [...fuel,...all.filter(r=>r.type==='Fuel type').map(r=>r.name)]}
const defaultTank=f=>fuel.includes(f)?'default-'+fuel.indexOf(f):'default-fuel-'+f;
function stationTanks(){
  return [...fuelTypes().map(f=>({id:defaultTank(f),name:f,fuel:f})),...get('Tank')]
}
function tankCards(past,dt){
  return stationTanks().filter(t=>!t.date||t.date<=dt).map(t=>{
    const movements=past.filter(r=>(r.tank||defaultTank(r.fuel))===t.id);
    const stock=(t.opening||0)+stats(movements).stock(t.fuel);
    return '<div class="tank '+(t.fuel===fuel[1]?'diesel':'')+'"><h2>'+E(t.name)+'</h2><b>'+fmt(stock)+' L</b><small>Closing tank stock</small><div class="vessel" aria-hidden="true"></div></div>'
  }).join('')
}
function tankOptions(f,selected){
  return stationTanks().filter(t=>t.fuel===f).map(t=>'<option value="'+E(t.id)+'" '+(selected===t.id?'selected':'')+'>'+E(t.name)+'</option>').join('')
}
let progressPeriod='Daily';
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
function progressReport(){
  const [from,to]=progressDates(date(),progressPeriod);
  const entries=rows.filter(r=>r.date>=from&&r.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
  const deliveries=entries.filter(r=>r.type==='Delivery'),sales=entries.filter(r=>r.type==='Reading'&&r.close!==''),mart=entries.filter(r=>r.type==='Mart'),cash=entries.filter(r=>r.type==='Cash entry'),credit=entries.filter(r=>r.type==='Customer debit');
  const totals=stats(entries),opening=stats(rows.filter(r=>r.date<from)).cash;
  return '<h2>'+progressPeriod+' progress report</h2><p>'+from+(from===to?'':' through '+to)+'</p>'+
    '<div class="cards">'+card('Delivered · L',fmt(sum(deliveries,r=>r.qty)))+card('Fuel sold · L',fmt(totals.litres))+card('Fuel sales · PKR',fmt(totals.rev))+card('Mart sales · PKR',fmt(totals.mart))+'</div>'+
    '<h3>Deliveries</h3>'+table(['Date','Supplier','Fuel','Tank','Litres','Unit cost · PKR','Paid · PKR'],deliveries.map(r=>[E(r.date),E(r.company),E(r.fuel),E(stationTanks().find(t=>t.id===(r.tank||defaultTank(r.fuel)))?.name),fmt(r.qty),fmt(r.cost),fmt(r.paid)]),'No deliveries in this period.')+
    '<h3>Fuel sales</h3>'+table(['Date','Shift','Salesperson','Nozzle','Fuel','Sold · L','Sales · PKR'],sales.map(r=>[E(r.date),E(r.shift),E(r.person),E(nozzleName(r.nozzle)),E(r.fuel),fmt(net(r)),fmt(net(r)*r.rate)]),'No completed nozzle sales in this period.')+
    '<h3>Mart</h3>'+table(['Date','Description','Sales · PKR','Purchases · PKR','Paid · PKR'],mart.map(r=>[E(r.date),E(r.name),fmt(r.sale),fmt(r.buy),fmt(r.paid)]),'No mart entries in this period.')+
    '<h3>Cash book</h3><div class="cards">'+card('Opening cash · PKR',fmt(opening))+card('Net cash movement · PKR',fmt(totals.cash))+card('Closing cash · PKR',fmt(opening+totals.cash))+'</div>'+
    table(['Date','Category','Description','Amount · PKR'],cash.map(r=>[E(r.date),E(r.category),E(r.name),fmt(r.amount)]),'No cash-book entries in this period.')+
    '<h3>Customer credit and repayments</h3>'+table(['Date','Customer','Fuel on credit · PKR','Repaid · PKR'],credit.map(r=>[E(r.date),E(r.name),fmt(r.buy),fmt(r.paid)]),'No customer credit entries in this period.')
}
function overviewActions(){
  return '<section class="overview-actions"><div class="head"><h2>Station progress</h2></div><div class="actions"><label>Report period <select id="progressPeriod">'+['Daily','Weekly','Monthly','Yearly'].map(v=>'<option '+(v===progressPeriod?'selected':'')+'>'+v+'</option>').join('')+'</select></label><button class="btn" id="viewProgress">View report</button><button class="btn" id="printProgress">Print / Save PDF</button><button class="btn" id="addTank">＋ Add tank</button><button class="btn" id="addFuel">＋ Add fuel type</button><button class="btn" data-all-shift>Start all-nozzle shift</button></div></section>'
}
function printProgress(){
  document.getElementById('reportFrame')?.remove();
  const frame=document.createElement('iframe');frame.id='reportFrame';frame.title='Printable station report';
  frame.style.cssText='position:fixed;left:-200vw;width:1000px;height:600px;border:0';document.body.append(frame);
  const doc=frame.contentDocument;doc.title='Forecourt '+progressPeriod+' progress '+date();
  const style=doc.createElement('style');
  style.textContent='@page{size:A4 landscape;margin:12mm}body{font:10pt Arial,sans-serif;color:#17212b}.cards{display:flex;gap:20px;margin:12px 0}.card{display:grid;gap:4px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border:1px solid #aaa;padding:4px}thead{display:table-header-group}tr{break-inside:avoid}h3{break-after:avoid}';
  doc.head.append(style);doc.body.append($('progressReport').cloneNode(true));frame.contentWindow.focus();frame.contentWindow.print()
}
function render(){if(!staffUser)return;let dt=date(),a=rows.filter(r=>r.date===dt),past=rows.filter(r=>r.date<=dt),d=stats(a),p=stats(past),v='',t=typeForPage[page];
$('nav').innerHTML=pages.map((n,i)=>'<button data-page="'+i+'" class="'+(i===page?'on':'')+'">'+n+'</button>').join('');
$('title').textContent=days[page];$('sub').textContent=desc[page];$('add').textContent=t?'＋ Add '+t.toLowerCase():'Print report';$('date').hidden=page===7;
if(!page){v=overviewActions()+'<div class="cards">'+card('Fuel sales · PKR',fmt(d.rev))+card('Fuel sold · litres',fmt(d.litres))+card('Mart sales · PKR',fmt(d.mart))+card('Cash in hand · PKR',fmt(p.cash))+'</div><div class="tanks">'+tankCards(past,dt)+'</div>'+'<section><article id="progressReport" tabindex="-1">'+progressReport()+'</article></section>'+panel('Shift readings',readings(a.filter(r=>r.type==='Reading')));}
else if(page===1)v='<div class="actions"><button class="btn" data-all-shift>Start all-nozzle shift</button></div>'+panel('Daily shift register',readings(a.filter(r=>r.type===t)));
else if(page>=2&&page<=5){if(page===3)v='<div class="cards">'+card('Sales today · PKR',fmt(d.mart))+card('Stock value · PKR',fmt(p.martstock))+card('Mart cash · PKR',fmt(p.martcash))+'</div>';v+=panel('Daily entries',ledger(t,a.filter(r=>r.type===t)));if(page===3||page===4)v+=panel(page===3?'Supplier balances':'Customer balances',table(['Account','Remaining PKR'],groups(past.filter(r=>r.type===t&&(page===4||r.buy||r.paid)),r=>(page===4?r.opening:0)+r.buy-r.paid),'No accounts recorded.'));}
else if(page===6){const month=dt.slice(0,7),m=rows.filter(r=>r.date?.startsWith(month)),dates=[...new Set(m.map(r=>r.date))].sort(),s=stats(m);v='<div class="cards">'+card('Fuel revenue · PKR',fmt(s.rev))+card('Fuel margin · PKR',fmt(s.gross))+card('Mart revenue · PKR',fmt(s.mart))+card('Expenses · PKR',fmt(s.expenses))+'</div>'+panel('Monthly balance · '+month,table(['Date','Fuel L','Fuel sales','Fuel margin','Mart sales','Expenses','Discount','Customer debit¹','Cash in hand¹'],dates.map(x=>{let b=stats(m.filter(r=>r.date===x)),c=stats(rows.filter(r=>r.date<=x));return [x,...[b.litres,b.rev,b.gross,b.mart,b.expenses,b.disc,c.debit,c.cash].map(fmt)]}),'No entries for this month.'))+'<small>Amounts in PKR. ¹ Closing balances include prior periods.</small>';}
else v=panel('Station tanks','<button class="btn" id="addTank">＋ Add tank</button><button class="btn" id="addFuel">＋ Add fuel type</button>'+table(['Tank','Fuel','Opening stock (L)',''],stationTanks().map(t=>[E(t.name),E(t.fuel),fmt(t.opening||0),t.type?edit(t):'Default tank'])))+panel('Station nozzles',ledger('Nozzle',get('Nozzle')))+panel('Station backup','<p>Export all entries or restore a saved station backup on this device.</p><div class="actions"><button class="btn" id="backup">Export backup</button><label class="btn">Restore backup<input hidden type="file" id="restore" accept=".json"></label></div>');
$('view').innerHTML=v;staffLayout();}
function show(t,r){if(t==='Reading'&&!r)return shiftForm();kind=t;editing=r?.id||null;$('ft').textContent=(r?'Edit ':'Add ')+t.toLowerCase();$('err').textContent='';$('remove').hidden=!r;
$('fields').innerHTML=fields[t].map(([k,label,def])=>{let value=r?.[k]??(def==='date'?date():def==='zero'?0:''),opts=def==='nozzles'?get('Nozzle').filter(n=>n.status==='Active'||n.id===r?.nozzle).map(n=>[n.id,n.name]):Array.isArray(def)?(def===fuel?fuelTypes():def).map(o=>[o,o]):null;return '<label>'+E(label)+(opts?'<select name="'+k+'" required>'+opts.map(([val,n])=>'<option value="'+E(val)+'" '+(val===value?'selected':'')+'>'+E(n)+'</option>').join('')+'</select>':'<input name="'+k+'" '+(def==='optional'?'':'required')+' type="'+(['zero','num','optional'].includes(def)?'number" min="0" step="any':def)+'" value="'+E(value)+'">')+'</label>'}).join('');if(t==='Nozzle'||t==='Delivery'){
  const form=$('form').elements;
  $('fields').insertAdjacentHTML('beforeend','<label>Tank<select name="tank" required>'+tankOptions(form.fuel.value,r?.tank)+'</select></label>');
  form.fuel.onchange=()=>{form.tank.innerHTML=tankOptions(form.fuel.value)}
}if(t==='Reading'&&!r)prefill();$('modal').showModal();}
const order=r=>r.date+shifts.indexOf(r.shift);
function prefill(){let el=$('form').elements,cur={date:el.date.value,shift:el.shift.value},prior=get('Reading').filter(r=>r.nozzle===el.nozzle.value&&order(r)<order(cur)).sort((a,b)=>order(b).localeCompare(order(a)))[0];el.open.value=prior?.close??'';el.rate.value=prior?.rate??'';el.cost.value=prior?.cost??'';}
function validate(all){
  const available= fuelTypes(all);
  if(new Set(available.map(v=>String(v).trim().toLowerCase())).size!==available.length)throw Error('This fuel type already exists.');
  let ids=new Set;for(const r of all){if(!fields[r.type]||typeof r.id!=='string'||ids.has(r.id))throw Error('Invalid or duplicate record.');ids.add(r.id);for(const [k,,def] of fields[r.type]){let v=r[k];if(r.type==='Nozzle'&&k==='cost'&&v===undefined)continue;if(def==='optional'&&v==='')continue;if(['num','zero','optional'].includes(def)){if(!Number.isFinite(v)||v<0)throw Error('Enter a valid positive amount or zero.')}else if(typeof v!=='string'||!v.trim()||(Array.isArray(def)&&!(def===fuel?available:def).includes(v))||(def==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v)))throw Error('Check the entry fields.');}}
for(const r of all.filter(x=>x.tank&&x.tank!==defaultTank(x.fuel))){
  const tank=all.find(t=>t.id===r.tank&&t.type==='Tank'&&t.fuel===r.fuel);
  if(!tank||r.date&&r.date<tank.date)throw Error('Keep the assigned tank, fuel and opening date consistent with its records.');
}
for(const n of all.filter(r=>r.type==='Reading'))if(!all.some(r=>r.type==='Nozzle'&&r.id===n.nozzle&&r.fuel===n.fuel))throw Error('A nozzle with readings must retain its fuel type. Retire it to preserve its history.');
for(const nozzle of all.filter(r=>r.type==='Nozzle')){let p;for(const r of all.filter(x=>x.nozzle===nozzle.id).sort((a,b)=>order(a).localeCompare(order(b)))){if(r.readingMode==='remaining'&&r.close!==''&&r.close>r.open)throw Error('Closing litres remaining cannot exceed opening litres.');if(r.close!==''&&net(r)<-0.000001||r.close===''&&r.returned>0)throw Error('Check the closing meter and returned litres.');if(p&&(order(r)===order(p)||p.close===''||(r.readingMode!=='remaining'&&p.readingMode!=='remaining'&&r.open<p.close)))throw Error('Check for a duplicate shift, unclosed shift or overlapping meter readings.');p=r;}}}
async function save(next){validate(next);await staffSave(next);}
$('form').onchange=e=>{if(!editing&&kind==='Reading'&&['date','nozzle','shift'].includes(e.target.name))prefill()};
$('form').onsubmit=async e=>{e.preventDefault();try{let r={id:editing||crypto.randomUUID(),type:kind};for(const [k,,def] of fields[kind]){let v=$('form').elements[k].value.trim();r[k]=v!==''&&['num','zero','optional'].includes(def)?Number(v):v}if(kind==='Nozzle'||kind==='Delivery')r.tank=$('form').elements.tank.value;
if(kind==='Reading')r.fuel=get('Nozzle').find(n=>n.id===r.nozzle).fuel;await save([...rows.filter(x=>x.id!==r.id),r]);if(r.date){$('date').value=r.date;render()}$('modal').close()}catch(e){$('err').textContent=e.message}};
$('remove').onclick=async()=>{if(confirm('Delete this entry and recalculate balances?'))try{await save(rows.filter(x=>x.id!==editing));$('modal').close()}catch(e){$('err').textContent=e.message}};
$('date').onchange=()=>{if(date())render()};$('add').onclick=()=>page===8?newAccount():page===6?window.print():show(typeForPage[page]);$('nav').onclick=e=>{if(e.target.dataset.page!==undefined){page=Number(e.target.dataset.page);render()}};
$('view').onclick=e=>{if(e.target.id==='viewProgress'){$('progressReport').focus();$('progressReport').scrollIntoView({block:'start'})}if(e.target.hasAttribute('data-all-shift')){if(get('Nozzle').some(n=>n.status==='Active'))batchShift();else alert('Add an active nozzle in Setup first.')} if(e.target.id==='printProgress')printProgress();if(e.target.id==='addTank')show('Tank');if(e.target.id==='addFuel')show('Fuel type');if(e.target.dataset.id){let r=rows.find(r=>r.id===e.target.dataset.id);show(r.type,r)}if(e.target.id==='backup'){let url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forecourt-'+date()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}};
$('view').onchange=async e=>{if(e.target.id==='progressPeriod'){progressPeriod=e.target.value;$('progressReport').innerHTML=progressReport();return}if(e.target.id==='restore'&&e.target.files[0])try{let next=JSON.parse(await e.target.files[0].text());if(!Array.isArray(next))throw Error('Invalid backup.');validate(next);if(confirm('Replace all station records with this backup?'))await save(next)}catch(err){alert(err.message)}};
