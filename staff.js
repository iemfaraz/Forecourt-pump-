'use strict';
let staffUser=null,version=0,token='',accountList=[];

const isSales=()=>staffUser?.role==='salesperson';
const main=document.querySelector('main'), access=$('access');
async function api(path,data){try{return await DeviceStation.api(path,data)}catch(err){if(err.expired){document.querySelectorAll('dialog[open]').forEach(d=>d.close());await lock()}throw err}}
async function lock(){
  document.getElementById('reportFrame')?.remove();
  staffUser=null;rows=[];accountList=[];$('view').replaceChildren();$('nav').replaceChildren();$('modal').close();
  main.hidden=true;access.hidden=false;$('account').hidden=true;$('identity').textContent='Station access';
  access.textContent='Opening station records…';
  try{
    const first=await DeviceStation.empty();
    access.innerHTML='<h1 style="font-size:32px">Station login</h1><p>'+(first?'Register the first administrator on this station computer.':'Enter your staff username and password.')+'</p><form id="signin">'+input('Username','login','text','autocomplete="username"')+input('Password','password','password','autocomplete="current-password"')+'<p class="err" role="alert"></p><button class="btn primary">Log in</button> <button type="button" class="btn" id="register">Register</button></form><p><small>Accounts, readings and photos stay in this browser profile.</small></p>';
    $('register').onclick=()=>{
      const note=first?'Create the first administrator for this browser on the station computer.':'Request salesperson access on this station computer. A manager or administrator must approve your request.';
      dialog(first?'Register station administrator':'Register as a salesperson','<p class="wide">'+note+'</p>'+input('Full name','name','text','maxlength="100"')+input('Username','login','text',(first?'value="admin" ':'')+'autocomplete="username"')+passwordFields(),first?'Create administrator':'Request access',async b=>{
        checkPasswords(b);
        if(first){await DeviceStation.setup(b);await refresh(true);access.replaceChildren();return}
        await DeviceStation.register(b);
        $('signin').reset();$('signin').elements.login.value=b.login;
        $('signin').querySelector('.err').textContent='Registration submitted. You can log in after your manager approves your request.'
      })
    };
    if(!first){
      access.insertAdjacentHTML('beforeend','<button class="btn" id="recoverAdmin">Reset administrator password</button><p><small>Staff can ask an administrator or manager to reset their password.</small></p>');
      $('recoverAdmin').onclick=recoveryForm;
      if(location.hash==='#reset'){history.replaceState(null,'',location.pathname+location.search);recoveryForm()}
    }
    $('signin').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,btn=f.querySelector('button'),b=Object.fromEntries(new FormData(f));btn.disabled=true;
      try{if(first)throw Error('Choose Register to set up the first administrator on this station computer.');await DeviceStation.login(b);
        await refresh(true);access.replaceChildren()
      }catch(err){f.querySelector('.err').textContent=err.message}finally{btn.disabled=false}};
  }catch{access.textContent='Browser storage is unavailable. Open this page in a normal browser window with site data enabled.'}
}
async function refresh(first=false){let s=await api('/state');staffUser=s.user;version=s.revision;rows=s.rows;if(first)page=isSales()?1:0;if(isSales())page=1;access.hidden=true;main.hidden=false;$('account').hidden=false;$('account').textContent='Sign out';$('identity').textContent=staffUser.name+' · '+staffUser.role;document.querySelector('footer').textContent='PKR · Litres · Saved on this station computer';render()}
async function staffSave(next){await api('/ledger',{revision:version,rows:next});await refresh()}
$('account').onclick=async()=>{await api('/logout',{});await lock()};
function shiftControls(r){let photo=stage=>'<button data-photo="'+E(r.id)+'" data-stage="'+stage+'">'+(stage==='opening'?'Opening photo':'Closing photo')+'</button>';return photo('opening')+(r.close===''?'<button data-close="'+E(r.id)+'">Close shift</button>':photo('closing'))}
function staffLayout(){
  if(!isSales())$('nav').insertAdjacentHTML('beforeend','<button data-page="8" class="'+(page===8?'on':'')+'">Users &amp; passwords</button>');
  if(page===8&&!isSales()){
    $('title').textContent='Users & passwords';$('sub').textContent='Manage sign-in and access on this station computer.';$('date').hidden=true;
    $('add').textContent='＋ Create account';$('view').textContent='Loading station accounts…';
    drawAccounts().catch(err=>{if(page===8)$('view').textContent=err.message});return
  }
if(isSales())$('nav').innerHTML='<button class="on" data-page="1">Nozzle shifts</button>';if(page<=1)$('add').textContent='＋ Start shift';
if(page===1&&isSales())$('view').insertAdjacentHTML('afterbegin','<div class="head"><button class="btn" data-work="'+E(staffUser.id)+'">My work record</button></div>');
if(page===1){let active=get('Reading').filter(r=>r.owner&&r.close===''&&r.date!==date());if(active.length)$('view').insertAdjacentHTML('afterbegin',panel('Open shifts from other dates',readings(active)))}
if(page===7&&!isSales())$('view').insertAdjacentHTML('afterbegin',panel('Staff accounts','<button class="btn primary" id="manage">Manage staff</button>')+(localStorage.getItem(key)?panel('Previous browser ledger','<button id="migrate" class="btn">Import records from this browser</button>'):''));
if(page===7&&staffUser.role==='admin')$('view').insertAdjacentHTML('beforeend',panel('Full station backup','<p>Save accounts, ledger entries and meter photos together. Keep this file private.</p><div class="actions"><button class="btn" id="fullbackup">Download full backup</button><label class="btn">Restore full backup<input hidden type="file" id="fullrestore" accept=".json"></label></div>'))}
const photoInput='<label>Meter photo<input name="photo" type="file" accept="image/*" capture="environment" required></label>';
function input(label,name,type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" '+extra+' required></label>'}
function choices(label,name,opts){return '<label>'+label+'<select name="'+name+'" required>'+opts.map(([id,n])=>'<option value="'+E(id)+'">'+E(n)+'</option>').join('')+'</select></label>'}
function dialog(title,html,submit,action){let d=document.createElement('dialog');d.innerHTML='<form><div class="head"><h2>'+title+'</h2><button class="btn" type="button" data-cancel>Cancel</button></div><div class="grid">'+html+'</div><p class="err" role="alert"></p><button class="btn primary">'+submit+'</button></form>';document.body.append(d);d.onclose=()=>d.remove();d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('form').onsubmit=async e=>{e.preventDefault();let f=e.currentTarget,button=f.querySelector('.primary');button.disabled=true;try{await action(Object.fromEntries(new FormData(f)));d.close()}catch(err){f.querySelector('.err').textContent=err.message}finally{button.disabled=false}};d.showModal();return d}
async function meterPhoto(file){if(!file?.size||file.size>25e6)throw Error('Choose a photo under 25 MB.');let url=URL.createObjectURL(file);try{let img=new Image;img.src=url;await img.decode();let scale=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.78)}finally{URL.revokeObjectURL(url)}}
function batchShift(records){
  const closing=Boolean(records);
  const items=records||get('Nozzle').filter(n=>n.status==='Active');
  const shared=closing?'':input('Business date','date','date','value="'+date()+'"')+choices('Shift','shift',shifts.map(s=>[s,s]))+input('Shift start time','startTime','time','value="'+new Date().toTimeString().slice(0,5)+'"');
  const sections=items.map((r,i)=>{
    const name=closing?nozzleName(r.nozzle):r.name;
    const meter=closing?input('Closing litres remaining','litres'+i,'number','min="0" max="'+Number(r.open)+'" step="any"'):input('Opening litres remaining','litres'+i,'number','min="0" step="any"');
    const info=closing?'<p>Opening reading: '+fmt(r.open)+' L</p>':input('Sale rate (PKR/L)','rate'+i,'number','min="0" step="any"');
    return '<fieldset class="wide"><legend>'+E(name)+' · '+E(r.fuel)+'</legend>'+info+meter+photoInput.replace('name="photo"','name="photo'+i+'"')+'</fieldset>'
  }).join('');
  const switchMode=closing?'':'<button type="button" class="btn wide" data-single>Use one nozzle</button>';
  const form=dialog(closing?'End shift · all nozzles':'Start shift · all nozzles',switchMode+shared+sections,closing?'Save all closing readings':'Save all opening readings',async b=>{
    const entries=[];
    for(const [i,r] of items.entries()){
      const value=Number(b['litres'+i]),photo=await meterPhoto(b['photo'+i]);
      entries.push(closing?{id:r.id,close:value,photo}:{nozzle:r.id,open:value,rate:Number(b['rate'+i]),photo})
    }
    await api(closing?'/close':'/start',{date:b.date,shift:b.shift,startTime:b.startTime,entries});
    $('date').value=closing?items[0].date:b.date;await refresh()
  });
  if(!closing)form.querySelector("[data-single]").onclick=()=>{form.close();shiftForm(null,true)}
}
function shiftForm(r,single=false){
  if(r?.batchId)return batchShift(get('Reading').filter(x=>x.batchId===r.batchId&&x.close===''));
  const active=get('Nozzle').filter(n=>n.status==='Active');
  if(!r&&!active.length)return alert('A manager must add an active nozzle first.');
  if(!r&&!single)return batchShift();
  let html;
  if(r){
    html='<p class="wide">'+E(nozzleName(r.nozzle))+' · Start time: '+E(shiftTime(r))+' · Opening reading: '+fmt(r.open)+' L</p>';
    if(!r.readingMode)html+=choices('Reading used at shift start','readingMode',[['remaining','Litres remaining'],['meter','Legacy cumulative meter']]);
    html+=input('Closing litres remaining','close','number','min="0" step="any" max="'+r.open+'"');
    if(!r.readingMode)html+=input('Returned to tank (L)','returned','number','min="0" step="any" value="0"');
    html+='<output class="wide" aria-live="polite"></output>';
  }else{
    html=choices('Nozzle','nozzle',active.map(n=>[n.id,n.name]))+input('Business date','date','date','value="'+date()+'"')+
      choices('Shift','shift',shifts.map(s=>[s,s]))+input('Shift start time','startTime','time','value="'+new Date().toTimeString().slice(0,5)+'"')+input('Opening litres remaining','open','number','min="0" step="any"')+
      input('Sale rate (PKR/L)','rate','number','min="0" step="any"')+
      '<p class="wide">Record the fuel available at the start. If refilling, take the closing reading before the refill.</p>';
  }
  const d=dialog(r?'Close shift':'Start shift',html+photoInput,r?'Save closing reading':'Save opening reading',async b=>{
    b.photo=await meterPhoto(b.photo);
    for(const k of ['close','open','rate','returned'])if(k in b)b[k]=Number(b[k]);
    if(r){b.id=r.id;b.readingMode=r.readingMode||b.readingMode}
    await api(r?'/close':'/start',b);$('date').value=r?.date||b.date;await refresh()
  });
  if(!r){
    const button=document.createElement('button');button.type='button';button.className='btn wide';button.textContent='Use all active nozzles';
    d.querySelector('.grid').prepend(button);button.onclick=()=>{d.close();batchShift()};return
  }
  const f=d.querySelector('form'),closing=f.elements.namedItem('close'),returned=f.elements.namedItem('returned');
  function preview(){
    const remaining=r.readingMode==='remaining'||f.elements.namedItem('readingMode')?.value==='remaining';
    closing.parentElement.firstChild.textContent=remaining?'Closing litres remaining':'Closing cumulative meter (L)';
    closing.min=remaining?0:r.open;
    if(remaining)closing.max=r.open;else closing.removeAttribute('max');
    if(returned){returned.disabled=remaining;returned.parentElement.hidden=remaining}
    const sold=remaining?r.open-closing.valueAsNumber:closing.valueAsNumber-r.open-(returned?.valueAsNumber||0);
    f.querySelector('output').textContent=closing.value===''?'':sold<0?'Check the closing reading.':'Fuel sold: '+fmt(sold)+' L · Sales: PKR '+fmt(sold*r.rate)
  }
  f.addEventListener('input',preview);preview()
}
function recoveryForm(){
  const html='<p class="wide">Recover a local administrator account on this station computer. Verify the repository owner (iemfaraz) with a GitHub token. The token is sent directly to GitHub for identity verification.</p><label class="wide">Administrator username (optional if there is only one)<input name="login" autocomplete="username"></label>'+input('Owner GitHub token','proof','password','autocomplete="off"')+passwordFields();
  dialog('Reset administrator password',html,'Reset password',async b=>{
    checkPasswords(b);const login=await DeviceStation.recover(b);await lock();
    const f=$('signin');f.elements.login.value=login;
    f.querySelector('.err').textContent='Password reset. Sign in with your new password.';
    f.elements.password.focus()
  })
}
function passwordFields(){return input('New password (12–128 characters)','password','password','minlength="12" maxlength="128" autocomplete="new-password"')+input('Confirm new password','confirm','password','minlength="12" maxlength="128" autocomplete="new-password"')}
function checkPasswords(b){if(b.password!==b.confirm)throw Error('The new passwords must match.')}
function staffAccounts(){page=8;render()}
async function drawAccounts(){
  const users=await api('/users');if(page!==8||!staffUser||isSales())return;
  accountList=users.sort((a,b)=>a.name.localeCompare(b.name));
  const items=accountList.map(u=>{
    const allowed=staffUser.role==='admin'||u.role==='salesperson';
    return [E(u.name),E(u.login),E(u.role),u.pending?'Pending approval':u.active?'Active':'Disabled','<button data-work="'+E(u.id)+'">Work record</button>',allowed?'<button data-edituser="'+E(u.id)+'">'+(u.pending?'Review request':'Edit')+'</button> <button data-resetuser="'+E(u.id)+'">Reset password</button>':'']
  });
  $('view').innerHTML=panel('Station accounts',table(['Full name','Username','Role','Status','History','Actions'],items))
}
function newAccount(){
  const roles=staffUser.role==='admin'?['salesperson','manager','admin']:['salesperson'];
  const html=input('Full name','name','text','maxlength="100"')+input('Username','login','text','minlength="3" maxlength="60" autocomplete="off"')+choices('Role','role',roles.map(v=>[v,v]))+passwordFields();
  dialog('Create staff account',html,'Create account',async b=>{checkPasswords(b);await api('/users',b);await drawAccounts()})
}
function accountAction(id,reset){
  const user=accountList.find(u=>u.id===id);if(!user)return;
  const self=user.id===staffUser.id;
  const roles=staffUser.role==='admin'&&!self?['salesperson','manager','admin']:[user.role];
  const fields=reset?passwordFields():input('Full name','name','text','maxlength="100"')+choices('Role','role',roles.map(v=>[v,v]))+choices('Status','status',(self?['Active']:['Active','Disabled']).map(v=>[v,v]));
  const d=dialog(reset?'Reset staff password':'Edit staff account','<p class="wide">'+E(user.name)+' · '+E(user.login)+'</p>'+fields,reset?'Save new password':'Save changes',async b=>{
    if(reset)checkPasswords(b);
    await api('/account',{...b,action:reset?'password':'edit',active:b.status==='Active',id:user.id,login:user.login,generation:user.generation});
    await refresh();await drawAccounts();
    const msg=document.createElement('p');msg.setAttribute('role','status');msg.textContent=(reset?'Password reset for ':'Account updated for ')+user.login+'.';$('view').prepend(msg)
  });
  if(!reset){const f=d.querySelector('form');f.elements.name.value=user.name;f.elements.role.value=user.role;f.elements.status.value=user.pending||user.active?'Active':'Disabled'}
}
$('view').addEventListener('click',async e=>{let el=e.target;try{if(el.dataset.edituser)accountAction(el.dataset.edituser,false);if(el.dataset.resetuser)accountAction(el.dataset.resetuser,true);if(el.dataset.close)shiftForm(rows.find(r=>r.id===el.dataset.close));if(el.dataset.photo)await showWorkPhoto(el.dataset.photo,el.dataset.stage);if(el.dataset.work)await workRecord(el.dataset.work);if(el.id==='manage')await staffAccounts();if(el.id==='migrate'){let legacy=JSON.parse(localStorage.getItem(key)||'[]'),merged=new Map(rows.map(r=>[r.id,r]));for(let r of legacy){let existing=merged.get(r.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(r)&&existing.type!=='Nozzle')throw Error('A record conflicts with the shared ledger. Use a backup to resolve it.');if(!existing||existing.type==='Nozzle'&&!rows.some(x=>x.nozzle===r.id))merged.set(r.id,r)}if(confirm('Import these records into the shared station ledger and clear the old copy on this browser?')){await save([...merged.values()]);localStorage.removeItem(key);render()}}}catch(err){alert(err.message)}});
lock();

document.addEventListener('visibilitychange',()=>{if(staffUser&&!document.hidden&&!document.querySelector('dialog[open]'))refresh().catch(err=>console.warn(err.message))});



$('view').addEventListener('click',async e=>{if(e.target.id!=='fullbackup')return;try{const data=await DeviceStation.backup(),url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forecourt-full-'+date()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(err){alert(err.message)}});
$('view').addEventListener('change',async e=>{if(e.target.id!=='fullrestore'||!e.target.files[0])return;try{const data=JSON.parse(await e.target.files[0].text());if(confirm('Replace accounts, records and photos on this computer with this backup and sign out?')){await DeviceStation.restore(data);await lock()}}catch(err){alert(err.message)}});


async function showWorkPhoto(id,stage){
  const blob=await api('/photo/'+encodeURIComponent(id)+'/'+stage,undefined,true);
  const url=URL.createObjectURL(blob),d=document.createElement('dialog');
  d.innerHTML='<button class="btn">Close</button><img style="display:block;max-width:100%" alt="Meter photo">';
  d.querySelector('img').src=url;d.querySelector('button').onclick=()=>d.close();
  d.onclose=()=>{URL.revokeObjectURL(url);d.remove()};document.body.append(d);d.showModal()
}
async function workRecord(id){
  if(isSales()&&id!==staffUser.id)return;
  const person=id===staffUser.id?staffUser:accountList.find(u=>u.id===id);
  if(!person)return;
  const state=await api('/state');
  const shifts=state.rows.filter(r=>r.type==='Reading'&&r.owner===id).sort((a,b)=>order(b).localeCompare(order(a)));
  const labels=new Map(state.rows.filter(r=>r.type==='Nozzle').map(n=>[n.id,n.name]));
  const d=document.createElement('dialog');d.className='work-record';
  d.innerHTML='<div class="head"><div><h2>'+E(person.name)+' · Work record</h2><small>'+E(person.login)+' · '+E(person.role)+'</small></div><div><button class="btn" data-print>Print record</button> <button class="btn" data-dismiss>Close</button></div></div>'+
    '<div class="work-filters"><label>From<input type="date" name="from"></label><label>Through<input type="date" name="through"></label><label>Shift status<select name="status"><option value="">All shifts</option><option>Open</option><option>Closed</option></select></label><button class="btn" data-clear>All dates</button></div><div data-results></div>';
  const first=d.querySelector('[name=from]'),last=d.querySelector('[name=through]'),status=d.querySelector('[name=status]'),results=d.querySelector('[data-results]');
  const when=t=>t?E(new Date(t).toLocaleString()):'—';
  function display(){
    const invalid=Boolean(first.value&&last.value&&first.value>last.value);
    d.querySelector('[data-print]').disabled=invalid;
    if(invalid){results.textContent='Choose an end date on or after the start date.';return}
    const filtered=shifts.filter(r=>(!first.value||r.date>=first.value)&&(!last.value||r.date<=last.value)&&(!status.value||(r.close===''?'Open':'Closed')===status.value));
    const closed=filtered.filter(r=>r.close!=='');
    const list=filtered.map(r=>{const done=r.close!=='',photo=stage=>'<button data-workphoto="'+E(r.id)+'" data-stage="'+stage+'">'+(stage==='opening'?'Opening':'Closing')+'</button>';
      return [E(r.date),E(r.shift),E(labels.get(r.nozzle)||r.nozzle),E(r.fuel),done?'Closed':'Open',fmt(r.open),done?fmt(r.close):'—',done?fmt(net(r)):'—',fmt(r.rate),done?fmt(net(r)*r.rate):'—',E(shiftTime(r)),when(r.ended),E(r.closedBy||'—'),photo('opening')+(done?photo('closing'):'')]
    });
    results.innerHTML='<div class="cards">'+card('Shifts',fmt(new Set(filtered.map(r=>r.batchId||r.id)).size))+card('Open shifts',fmt(new Set(filtered.filter(r=>r.close==='').map(r=>r.batchId||r.id)).size))+card('Litres sold',fmt(sum(closed,net)))+card('Sales · PKR',fmt(sum(closed,r=>net(r)*r.rate)))+'</div>'+
      table(['Date','Shift','Nozzle','Fuel','Status','Opening L','Closing L','Sold L','PKR/L','Sales PKR','Start time','Closed at','Closed by','Meter photos'],list,'No shifts recorded for this account in this period.')
  }
  d.onchange=display;d.onclick=async e=>{const el=e.target;
    if(el.hasAttribute('data-print')){
      d.querySelector('iframe')?.remove();
      const frame=document.createElement('iframe');
      frame.title='Printable work record';
      frame.style.cssText='position:fixed;left:-200vw;top:0;width:1000px;height:600px;border:0';
      d.append(frame);
      const doc=frame.contentDocument;
      doc.title=person.name+' · Work record';
      const css=doc.createElement('style');
      css.textContent='@page{size:A4 landscape;margin:10mm}body{font:10pt Arial,sans-serif;color:#17212b}h1{font-size:18pt}table{width:100%;border-collapse:collapse;font-size:8pt}th,td{text-align:left;border:1px solid #aaa;padding:4px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.cards{display:flex;gap:2em;margin:1em 0}.cards>*{display:grid;gap:4px}';
      doc.head.append(css);
      const heading=doc.createElement('h1'),info=doc.createElement('p');
      heading.textContent=doc.title;
      info.textContent=[person.login,person.role,'From '+(first.value||'earliest date'),'Through '+(last.value||'latest date'),status.value||'All shifts'].join(' · ');
      const copy=results.cloneNode(true);
      copy.querySelectorAll('tr').forEach(row=>row.lastElementChild?.remove());
      doc.body.append(heading,info,copy);
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }
    if(el.hasAttribute('data-dismiss'))d.close();
    if(el.hasAttribute('data-clear')){first.value='';last.value='';status.value='';display()}
    if(el.dataset.workphoto)try{await showWorkPhoto(el.dataset.workphoto,el.dataset.stage)}catch(err){alert(err.message)}
  };
  d.onclose=()=>d.remove();document.body.append(d);display();d.showModal()
}
