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
  const visible=({id,name,role,login,active=true,generation=0,pending=false})=>({id,name,role,login,active,generation,pending});  async function credentials(password){
    assert(typeof password==='string'&&password.length>=12&&password.length<=128,'Use a password between 12 and 128 characters.');
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    return {salt,hash:await passwordHash(password,salt)}
  }
  const session=(u)=>({...visible(u),generation:u.generation||0});
  async function verify(s){
    const u=current&&await result(s('users').get(current.login));
    if(!u||u.active===false||u.id!==current.id||(u.generation||0)!==current.generation){
      current=null;throw Object.assign(Error('Your account changed. Sign in again.'),{expired:true})
    }
    return u
  }
  async function manage(b){
    const replacement=b.action==='password'?await credentials(b.password):null;
    return transaction(['users'],'readwrite',async s=>{
      const actor=await verify(s),store=s('users'),target=await result(store.get(username(b.login)));
      assert(target&&target.id===b.id,'Account unavailable. Refresh the user list.');
      assert(actor.role==='admin'||(actor.role==='manager'&&target.role==='salesperson'),'You cannot manage this account.');
      assert((target.generation||0)===b.generation,'The account changed. Refresh the user list.');
      if(replacement)Object.assign(target,replacement);
      else {
        assert(b.action==='edit','Unknown account action.');
        const name=String(b.name||'').trim();
        assert(name&&name.length<=100,'Enter a full name of up to 100 characters.');
        assert(['admin','manager','salesperson'].includes(b.role)&&typeof b.active==='boolean','Select a valid role and status.');
        assert(actor.role==='admin'||b.role==='salesperson','Managers may manage salesperson profiles only.');
        if(actor.id===target.id)assert(b.active&&b.role===actor.role,'Keep your own role and account active.');
        Object.assign(target,{name,role:b.role,active:b.active,pending:false});
      }
      target.generation=(target.generation||0)+1;
      store.put(target,target.login);
      return {user:visible(target),self:actor.id===target.id,profile:session(target)}
    }).then(change=>{if(change.self)current=change.profile;return change.user})
  }
  async function recover(b){
    const replacement=await credentials(b.password);
    const response=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+b.proof.trim(),Accept:'application/vnd.github+json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
    assert(response.ok,'GitHub could not verify the owner token. Check the token and try again.');
    assert((await response.json()).id===328499199,'Only the repository owner can recover station administrators.');
    const account=await transaction(['users'],'readwrite',async s=>{
      const store=s('users'),admins=(await result(store.getAll())).filter(u=>u.role==='admin'&&u.active!==false);
      const u=b.login.trim()?admins.find(a=>a.login===username(b.login)):admins.length===1?admins[0]:null;
      assert(u,'Choose an active administrator username: '+admins.map(a=>a.login).join(', '));
      Object.assign(u,replacement,{generation:(u.generation||0)+1});
      store.put(u,u.login);return u.login
    });
    current=null;return account
  }

  async function makeUser(b,role){
    const login=username(b.login),name=b.name.trim();
    assert(/^[a-z0-9._-]{3,60}$/.test(login),'Use 3–60 letters, numbers, dots, underscores or hyphens for the username.');
    assert(name&&name.length<=100,'Enter a name of up to 100 characters.');
    return {id:crypto.randomUUID(),login,name,role,active:true,generation:0,...await credentials(b.password)}
  }
  const empty=()=>transaction(['users'],'readonly',s=>result(s('users').count()).then(n=>n===0));
  const stationName=()=>transaction(['ledger'],'readonly',async s=>(await result(s('ledger').get('station-name')))||'Forecourt');
  function validName(value){
    assert(typeof value==='string'&&value.trim()&&value.trim().length<=80,'Enter a station name of 1 to 80 characters.');
    return value.trim()
  }
  async function setup(b){
    const user=await makeUser(b,'admin');
    await transaction(['users','ledger'],'readwrite',async s=>{
      assert(await result(s('users').count())===0,'An administrator already exists. Reload and sign in.');
      s('users').add(user,user.login);s('ledger').add({revision:1,profileSchema:1,rows:initial()},'station')
    });current=visible(user)
  }
  async function register(b){
    const user=await makeUser(b,'salesperson');
    user.active=false;user.pending=true;
    await transaction(['users'],'readwrite',async s=>{
      const users=s('users');
      assert(await result(users.count())>0,'Set up the station administrator first.');
      assert(!await result(users.get(user.login)),'That username is unavailable.');
      users.add(user,user.login)
    })
  }
  async function login(b){
    const user=await transaction(['users'],'readonly',s=>result(s('users').get(username(b.login))));
    const h=await passwordHash(b.password,user?.salt||'unknown');
    assert(user&&user.active!==false&&user.hash===h,'Incorrect username or password.');current=visible(user)
  }
  async function api(path,b){
    if(path==='/logout'){current=null;return}
    assert(current,'Please sign in.');if(path==='/account')return manage(b);
    const lead=current.role!=='salesperson';
    if(path==='/users'){assert(lead,'Manager access required.');
      if(b){assert(b.role==='salesperson'||(current.role==='admin'&&['manager','admin'].includes(b.role)),'Role unavailable.');const user=await makeUser(b,b.role);
        await transaction(['users'],'readwrite',async s=>{await verify(s);assert(!await result(s('users').get(user.login)),'Username already exists.');s('users').add(user,user.login)})}
      return transaction(['users'],'readonly',async s=>{await verify(s);return (await result(s('users').getAll())).map(visible)})}
    const write=b!==undefined||path==='/state';
    return transaction(stores,write?'readwrite':'readonly',async s=>{
      await verify(s);const state=await result(s('ledger').get('station'));
      assert(state,'Set up this station first.');
      if(!state.profileSchema){upgradeRecords(state.rows);state.profileSchema=1;state.revision++;s('ledger').put(state,'station')}
      if(path==='/station-name'){assert(current.role==='admin','Administrator access required.');s('ledger').put(validName(b.name),'station-name');return}
      if(path==='/state')return {stationName:(await result(s('ledger').get('station-name')))||'Forecourt',revision:state.revision,user:current,rows:lead?state.rows:state.rows.filter(r=>r.type==='Nozzle'||r.owner===current.id).map(({cost,...r})=>r)};
      if(path.startsWith('/photo/')){const [, ,id,stage]=path.split('/'),r=state.rows.find(x=>x.id===id);
        assert(r&&(lead||r.owner===current.id),'Photo unavailable.');const photo=await result(s('photos').get(id+'/'+stage));assert(photo,'Photo unavailable.');return photo}
      if(path==='/edit-completed'||path==='/delete-completed'){
        assert(current.role==='admin','Administrator access required.');
        assert(b.revision===state.revision,'Station records changed. Refresh and reopen the shift.');
        const first=state.rows.find(r=>r.type==='Reading'&&r.id===b.id);
        assert(first,'Shift no longer exists.');
        const members=state.rows.filter(r=>r.type==='Reading'&&shiftGroupKey(r)===shiftGroupKey(first));
        assert(members.every(r=>r.close!==''),'Close every nozzle before managing this shift.');
        if(path==='/delete-completed'){
          const ids=new Set(members.map(r=>r.id));
          state.rows=state.rows.filter(r=>!ids.has(r.id));
          for(const id of ids)for(const stage of ['opening','closing'])s('photos').delete(id+'/'+stage);
        }else{
          const edits=new Map(b.entries.map(entry=>[entry.id,entry]));
          assert(edits.size===members.length&&b.entries.length===members.length&&members.every(r=>edits.has(r.id)),'Include every nozzle once.');
          assert((!first.startTime&&b.startTime==='')||/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime),'Enter a valid start time.');
          const batchId=first.batchId||crypto.randomUUID();
          for(const r of members){
            const update=edits.get(r.id);
            for(const key of ['open','close','rate','cost','returned']){
              assert(Number.isFinite(update[key])&&update[key]>=0,'Enter a nonnegative number for each reading and price.');
              r[key]=update[key];
            }
            assert(r.readingMode!=='remaining'||!r.returned,'Returns do not apply to remaining-litre readings.');
            Object.assign(r,{batchId,date:b.date,startTime:b.startTime,shift:b.shift});
          }
        }
        validate(state.rows);
      }else if(path==='/ledger'){
        assert(lead&&b.revision===state.revision,'Refresh the ledger before saving.');validate(b.rows);
        const old=new Map(state.rows.filter(r=>r.owner).map(r=>[r.id,JSON.stringify(r)]));
        const managed=b.rows.filter(r=>r.owner);
        assert(managed.length===old.size&&managed.every(r=>old.get(r.id)===JSON.stringify(r)),'Keep photo-recorded shifts in the ledger.');
        state.rows=b.rows;
      }else{
        assert(path==='/start'||path==='/close','Unknown operation.');
        const entries=b.entries||[b],opening=path==='/start';
        let attendant=current;
        if(opening&&b.assignee&&b.assignee!==current.id){
          assert(current.role==='admin','Only an administrator may assign another salesperson.');
          attendant=(await result(s('users').getAll())).find(u=>u.id===b.assignee&&u.role==='salesperson'&&u.active!==false&&!u.pending);
          assert(attendant,'Select an active salesperson and try again.')
        }
        const batchId=opening&&b.entries?crypto.randomUUID():null;
        assert(Array.isArray(entries)&&entries.length,'Include a reading for each nozzle.');
        if(opening&&b.entries){
          const active=state.rows.filter(n=>n.type==='Nozzle'&&n.status==='Active');
          assert(active.length===entries.length&&active.every(n=>entries.some(e=>e.nozzle===n.id)),'The active nozzle list changed. Reopen the shift form.');
        }
        if(!opening){
          const first=state.rows.find(r=>r.id===entries[0].id);
          if(first?.batchId||b.entries){
            const members=state.rows.filter(r=>r.batchId&&r.batchId===first?.batchId&&r.close==='');
            assert(members.length===entries.length&&members.every(r=>entries.some(e=>e.id===r.id)),'Close every nozzle in this shift together.');
          }
        }
        for(const item of entries){
          const entry=b.entries&&opening?{...item,date:b.date,shift:b.shift,startTime:b.startTime}:item;
        let photo=null;
        if(entry.photo){
          assert(/^data:image\/jpeg;base64,/.test(entry.photo),'Choose a valid meter photo.');
          const raw=atob(entry.photo.slice(23));photo=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/jpeg'});
        }
        let r,stage;if(path==='/start'){
          const n=state.rows.find(x=>x.id===entry.nozzle&&x.type==='Nozzle'&&x.status==='Active');assert(n,'Select an active nozzle.');
          assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime),'Enter a valid shift start time.');
          r={id:crypto.randomUUID(),batchId,tank:n.tank||'',startTime:entry.startTime,type:'Reading',readingMode:'remaining',owner:attendant.id,person:attendant.name,openedBy:current.name,openedById:current.id,fuel:n.fuel,nozzle:n.id,date:entry.date,shift:entry.shift,open:entry.open,close:'',rate:entry.rate,cost:n.cost||0,returned:0,started:new Date().toISOString()};
          state.rows.push(r);stage='opening';
        }else{
          r=state.rows.find(x=>x.id===entry.id&&x.type==='Reading'&&x.owner);
          assert(r&&(lead||r.owner===current.id)&&r.close==='','This shift cannot be closed.');if(!r.readingMode&&entry.readingMode==='remaining')r.readingMode='remaining';Object.assign(r,{close:entry.close,returned:r.readingMode==='remaining'?0:entry.returned,ended:new Date().toISOString(),closedBy:current.name,closedById:current.id});stage='closing'
        }
        r[stage+'Photo']=Boolean(photo);if(photo)s('photos').add(photo,r.id+'/'+stage)
        }
        validate(state.rows);
      }
      state.revision++;s('ledger').put(state,'station')
    })
  }
  async function backup(){
    assert(current?.role==='admin','Administrator access required.');
    const data=await transaction(stores,'readonly',async s=>{await verify(s);return {stationName:await result(s('ledger').get('station-name')),users:await result(s('users').getAll()),ledger:await result(s('ledger').get('station')),keys:await result(s('photos').getAllKeys()),blobs:await result(s('photos').getAll())}});
    const photos=await Promise.all(data.blobs.map((blob,i)=>new Promise((resolve,reject)=>{const f=new FileReader;f.onload=()=>resolve([data.keys[i],f.result]);f.onerror=reject;f.readAsDataURL(blob)})));
    return {format:'forecourt-device-1',stationName:data.stationName||'Forecourt',users:data.users,rows:data.ledger.rows,photos}
  }
  async function restore(b){
    assert(current?.role==='admin','Administrator access required.');assert(b.format==='forecourt-device-1'&&Array.isArray(b.users)&&Array.isArray(b.photos),'Select a full station backup.');upgradeRecords(b.rows);validate(b.rows);
    assert(b.users.some(u=>u.role==='admin'&&u.active!==false)&&b.users.every(u=>typeof u.id==='string'&&typeof u.login==='string'&&['admin','manager','salesperson'].includes(u.role)&&/^[a-f0-9]{64}$/.test(u.hash)&&/^[a-f0-9]{32}$/.test(u.salt)),'Invalid account backup.');
    const photos=new Map(b.photos.map(([k,v])=>{assert(typeof k==='string'&&v.startsWith('data:image/jpeg;base64,'),'Invalid photo backup.');return [k,new Blob([Uint8Array.from(atob(v.slice(23)),c=>c.charCodeAt(0))],{type:'image/jpeg'})]}));
    for(const r of b.rows.filter(r=>r.owner))assert(b.users.some(u=>u.id===r.owner)&&(r.openingPhoto===false||photos.has(r.id+'/opening'))&&(r.close===''||r.closingPhoto===false||photos.has(r.id+'/closing')),'Backup is missing staff or photos.');
    await transaction(stores,'readwrite',async s=>{await verify(s);const old=await result(s('ledger').get('station'));for(const n of stores)s(n).clear();s('ledger').put(validName(b.stationName??'Forecourt'),'station-name');for(const u of b.users)s('users').add(u,u.login);for(const [k,v] of photos)s('photos').add(v,k);s('ledger').put({revision:old.revision+1,profileSchema:1,rows:b.rows},'station')});current=null
  }
  async function resetStation(confirmation,revision){
    await transaction(stores,'readwrite',async s=>{
      const actor=await verify(s);
      assert(actor.role==='admin','Administrator access required.');
      assert(confirmation==='RESET STATION','Type RESET STATION to confirm.');
      const ledger=await result(s('ledger').get('station'));
      assert(ledger?.revision===revision,'Station records changed. Refresh and review before resetting.');
      for(const name of stores)s(name).clear();
    });
    current=null;
  }
  return {empty,stationName,setup,register,login,api,backup,restore,recover,resetStation}
})();
