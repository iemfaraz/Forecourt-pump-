'use strict';
const DeviceStation=(()=>{
  let opening, current;
  const stores=['users','ledger','photos'];
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  const result=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  function database(){
    if(!opening){const r=indexedDB.open('forecourt-pump-station-device',1);
      r.onupgradeneeded=()=>{for(const name of stores)r.result.createObjectStore(name)};
      opening=result(r).catch(err=>{opening=null;throw err})}
    return opening;
  }
  async function transaction(names,mode,work){
    const db=await database(),tx=db.transaction(names,mode);
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Storage operation cancelled.'))});
    done.catch(()=>{});
    try{const value=await work(n=>tx.objectStore(n));await done;return value}catch(err){try{tx.abort()}catch{}await done.catch(()=>{});throw err}
  }
  const username=s=>String(s||'').trim().toLowerCase();
  const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
  async function passwordHash(password,salt){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:600000},material,256))
  }
  const visible=({id,name,role,login})=>({id,name,role,login});
  async function makeUser(b,role){
    const login=username(b.login),name=b.name.trim();
    assert(/^[a-z0-9._-]{3,60}$/.test(login),'Use 3–60 letters, numbers, dots, underscores or hyphens for the username.');
    assert(name&&name.length<=100,'Enter a name of up to 100 characters.');
    assert(typeof b.password==='string'&&b.password.length>=12&&b.password.length<=128,'Use a password between 12 and 128 characters.');
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    return {id:crypto.randomUUID(),login,name,role,salt,hash:await passwordHash(b.password,salt)}
  }
  const empty=()=>transaction(['users'],'readonly',s=>result(s('users').count()).then(n=>n===0));
  async function setup(b){
    const user=await makeUser(b,'admin');
    await transaction(['users','ledger'],'readwrite',async s=>{
      assert(await result(s('users').count())===0,'An administrator already exists. Reload and sign in.');
      s('users').add(user,user.login);s('ledger').add({revision:1,rows:initial()},'station')
    });current=visible(user)
  }
  async function login(b){
    const user=await transaction(['users'],'readonly',s=>result(s('users').get(username(b.login))));
    const h=await passwordHash(b.password,user?.salt||'unknown');
    assert(user&&user.hash===h,'Incorrect username or password.');current=visible(user)
  }
  async function api(path,b){
    if(path==='/logout'){current=null;return}
    assert(current,'Please sign in.');const lead=current.role!=='salesperson';
    if(path==='/users'){assert(lead,'Manager access required.');
      if(b){assert(b.role==='salesperson'||(current.role==='admin'&&['manager','admin'].includes(b.role)),'Role unavailable.');const user=await makeUser(b,b.role);
        await transaction(['users'],'readwrite',async s=>{assert(!await result(s('users').get(user.login)),'Username already exists.');s('users').add(user,user.login)})}
      return transaction(['users'],'readonly',async s=>(await result(s('users').getAll())).map(visible))}
    const write=b!==undefined;
    return transaction(['ledger','photos'],write?'readwrite':'readonly',async s=>{
      const state=await result(s('ledger').get('station'));
      assert(state,'Set up this station first.');
      if(path==='/state')return {revision:state.revision,user:current,rows:lead?state.rows:state.rows.filter(r=>r.type==='Nozzle'||r.owner===current.id).map(({cost,...r})=>r)};
      if(path.startsWith('/photo/')){const [, ,id,stage]=path.split('/'),r=state.rows.find(x=>x.id===id);
        assert(r&&(lead||r.owner===current.id),'Photo unavailable.');const photo=await result(s('photos').get(id+'/'+stage));assert(photo,'Photo unavailable.');return photo}
      if(path==='/ledger'){
        assert(lead&&b.revision===state.revision,'Refresh the ledger before saving.');validate(b.rows);
        const old=new Map(state.rows.filter(r=>r.owner).map(r=>[r.id,JSON.stringify(r)]));
        const managed=b.rows.filter(r=>r.owner);
        assert(managed.length===old.size&&managed.every(r=>old.get(r.id)===JSON.stringify(r)),'Keep photo-recorded shifts in the ledger.');
        state.rows=b.rows;
      }else{
        assert(path==='/start'||path==='/close','Unknown operation.');
        assert(/^data:image\/jpeg;base64,/.test(b.photo),'Attach the meter photo.');
        const raw=atob(b.photo.slice(23)),photo=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/jpeg'});
        let r,stage;if(path==='/start'){
          const n=state.rows.find(x=>x.id===b.nozzle&&x.type==='Nozzle'&&x.status==='Active');assert(n,'Select an active nozzle.');
          r={id:crypto.randomUUID(),type:'Reading',owner:current.id,person:current.name,fuel:n.fuel,nozzle:n.id,date:b.date,shift:b.shift,open:b.open,close:'',rate:b.rate,cost:n.cost||0,returned:0,started:new Date().toISOString()};
          state.rows.push(r);stage='opening';
        }else{
          r=state.rows.find(x=>x.id===b.id&&x.type==='Reading'&&x.owner);
          assert(r&&(lead||r.owner===current.id)&&r.close==='','This shift cannot be closed.');Object.assign(r,{close:b.close,returned:b.returned,ended:new Date().toISOString(),closedBy:current.name});stage='closing'
        }
        validate(state.rows);s('photos').add(photo,r.id+'/'+stage)
      }
      state.revision++;s('ledger').put(state,'station')
    })
  }
  async function backup(){
    assert(current?.role==='admin','Administrator access required.');
    const data=await transaction(stores,'readonly',async s=>({users:await result(s('users').getAll()),ledger:await result(s('ledger').get('station')),keys:await result(s('photos').getAllKeys()),blobs:await result(s('photos').getAll())}));
    const photos=await Promise.all(data.blobs.map((blob,i)=>new Promise((resolve,reject)=>{const f=new FileReader;f.onload=()=>resolve([data.keys[i],f.result]);f.onerror=reject;f.readAsDataURL(blob)})));
    return {format:'forecourt-device-1',users:data.users,rows:data.ledger.rows,photos}
  }
  async function restore(b){
    assert(current?.role==='admin','Administrator access required.');assert(b.format==='forecourt-device-1'&&Array.isArray(b.users)&&Array.isArray(b.photos),'Select a full station backup.');validate(b.rows);
    assert(b.users.some(u=>u.role==='admin')&&b.users.every(u=>typeof u.id==='string'&&typeof u.login==='string'&&['admin','manager','salesperson'].includes(u.role)&&/^[a-f0-9]{64}$/.test(u.hash)&&/^[a-f0-9]{32}$/.test(u.salt)),'Invalid account backup.');
    const photos=new Map(b.photos.map(([k,v])=>{assert(typeof k==='string'&&v.startsWith('data:image/jpeg;base64,'),'Invalid photo backup.');return [k,new Blob([Uint8Array.from(atob(v.slice(23)),c=>c.charCodeAt(0))],{type:'image/jpeg'})]}));
    for(const r of b.rows.filter(r=>r.owner))assert(b.users.some(u=>u.id===r.owner)&&photos.has(r.id+'/opening')&&(r.close===''||photos.has(r.id+'/closing')),'Backup is missing staff or photos.');
    await transaction(stores,'readwrite',async s=>{const old=await result(s('ledger').get('station'));for(const n of stores)s(n).clear();for(const u of b.users)s('users').add(u,u.login);for(const [k,v] of photos)s('photos').add(v,k);s('ledger').put({revision:old.revision+1,rows:b.rows},'station')});current=null
  }
  return {empty,setup,login,api,backup,restore}
})();
