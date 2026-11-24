import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const derive=promisify(scrypt), data=process.env.DATA_DIR || './private-data';
mkdirSync(data,{recursive:true,mode:0o700});
const db=new DatabaseSync(join(data,'station.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE,name TEXT,role TEXT,salt TEXT,hash TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,body TEXT);
CREATE TABLE IF NOT EXISTS photos(id TEXT,stage TEXT,bytes BLOB,PRIMARY KEY(id,stage));
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,revision INTEGER);
INSERT OR IGNORE INTO settings VALUES(1,0);`);
const one=(sql,...a)=>db.prepare(sql).get(...a), all=(sql,...a)=>db.prepare(sql).all(...a), run=(sql,...a)=>db.prepare(sql).run(...a);
const records=()=>all('SELECT body FROM records').map(r=>JSON.parse(r.body));
const put=r=>run('INSERT OR REPLACE INTO records VALUES (?,?)',r.id,JSON.stringify(r));
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}
const revision=()=>one('SELECT revision FROM settings').revision, bump=()=>run('UPDATE settings SET revision=revision+1');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const clean=(v,max=100)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('Check the text fields.');
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12?v:fail('Enter a valid meter reading or rate.');
const loginName=v=>{const name=clean(v,60).toLowerCase();return /^[a-z0-9._-]{3,60}$/.test(name)?name:fail('Use 3–60 letters, numbers, dots, underscores or hyphens for the username.')};
const hash=(pw,salt)=>derive(pw,salt,64,{N:32768,maxmem:64*1024*1024});
async function createUser(b,role){let name=clean(b.name),login=loginName(b.login);
if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)fail('Use a password between 12 and 128 characters.');
let salt=randomBytes(16).toString('hex'),h=await hash(b.password,salt);
if(one('SELECT id FROM users WHERE login=?',login))fail('Username already exists.',409);
run('INSERT INTO users(id,login,name,role,salt,hash) VALUES(?,?,?,?,?,?)',randomUUID(),login,name,role,salt,h.toString('hex'))}
if(!one('SELECT id FROM users LIMIT 1')){if(!process.env.ADMIN_PASSWORD)throw Error('Set ADMIN_PASSWORD securely on the server to initialize the first administrator.');
await createUser({login:process.env.ADMIN_LOGIN||'admin',name:'Station administrator',password:process.env.ADMIN_PASSWORD},'admin');
transaction(()=>['Petrol','High speed diesel'].forEach((fuel,i)=>['A','B'].forEach((letter,j)=>put({id:'n'+i+j,type:'Nozzle',name:(i?'Diesel ':'Petrol ')+letter,fuel,status:'Active'}))))}
const digest=s=>createHash('sha256').update(s).digest('hex');
const orders=['Morning','Evening','Night'], order=r=>r.date+orders.indexOf(r.shift);
const profile=u=>({id:u.id,name:u.name,role:u.role,login:u.login});
const isLead=u=>['admin','manager'].includes(u.role);
function image(value){if(typeof value!=='string'||value.length>2100000||!/^data:image\/jpeg;base64,/.test(value))fail('Attach a meter photo.');
let bytes=Buffer.from(value.slice(23),'base64');if(bytes.length<4||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)fail('Invalid JPEG photo.');return bytes}
function validateMeter(timeline){let prev;for(const r of timeline.sort((a,b)=>order(a).localeCompare(order(b)))){if(prev&&(order(prev)===order(r)||prev.close===''||prev.close>r.open))fail('This shift conflicts with an existing meter reading.',409);prev=r}}
const attempts=new Map();setInterval(()=>{for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);run('DELETE FROM sessions WHERE expires<?',Date.now())},60000).unref();
const origins=new Set((process.env.ALLOWED_ORIGIN||'https://iemfaraz.github.io').split(',').map(v=>v.trim()));
async function read(req){let n=0,parts=[];for await(const part of req){n+=part.length;if(n>8e6)fail('Request too large.',413);parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString()||'{}')}catch{fail('Invalid request.')}}
const server=http.createServer(async(req,res)=>{function send(obj,code=200){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))}
try{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
if(req.headers.origin){if(!origins.has(req.headers.origin))fail('Origin is not configured.',403);res.setHeader('Access-Control-Allow-Origin',req.headers.origin)}
if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.writeHead(204);res.end();return}
const path=new URL(req.url,'http://localhost').pathname,action=req.method+' '+path;
if(action==='GET /health')return send({ok:true});
if(action==='POST /login'){let b=await read(req),login=loginName(b.login),key=login,now=Date.now(),a=attempts.get(key);if(!a||a.until<=now){a={n:0,until:now+900000};attempts.set(key,a)}if(++a.n>12)fail('Too many attempts. Try again in 15 minutes.',429);
const u=one('SELECT * FROM users WHERE login=?',login);let h=await hash(String(b.password||'').slice(0,128),u?.salt||'unused-login-salt');
if(!u?.active||!timingSafeEqual(h,Buffer.from(u.hash,'hex')))fail('Incorrect username or password.',401);attempts.delete(key);
const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',digest(token),u.id,now+12*3600000);return send({token,user:profile(u)})}
const token=digest((req.headers.authorization||'').replace(/^Bearer /,'')),u=one('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user WHERE token=? AND expires>? AND active=1',token,Date.now());
if(!u)fail('Please sign in.',401);
if(action==='POST /logout'){run('DELETE FROM sessions WHERE token=?',token);return send({ok:true})}
if(action==='GET /state'){const list=records();return send({user:profile(u),revision:revision(),rows:isLead(u)?list:list.filter(r=>r.type==='Nozzle'||(r.type==='Reading'&&r.owner===u.id)).map(r=>{let {cost,...allowed}=r;return allowed})})}
if(action==='GET /users'||action==='POST /users'){if(!isLead(u))fail('Manager access required.',403);
if(req.method==='POST'){const b=await read(req);if(b.role!=='salesperson'&&!(u.role==='admin'&&['manager','admin'].includes(b.role)))fail('Account role is restricted.',403);await createUser(b,b.role)}
return send(all('SELECT id,name,login,role,active FROM users ORDER BY name'))}
if(action==='POST /ledger'){if(!isLead(u))fail('Manager access required.',403);const b=await read(req);
transaction(()=>{if(b.revision!==revision())fail('Another user saved a change. Refresh before saving.',409);
if(!Array.isArray(b.rows))fail('Invalid ledger.');let ids=new Set(),old=records(),map=new Map(old.map(r=>[r.id,r]));
for(const r of b.rows){if(!r||typeof r.id!=='string'||ids.has(r.id)||!['Reading','Nozzle','Delivery','Cash entry','Customer debit','Mart'].includes(r.type))fail('Invalid ledger row.');ids.add(r.id);
if(r.owner||map.get(r.id)?.owner){if(JSON.stringify(map.get(r.id))!==JSON.stringify(r))fail('Photo-recorded shifts must be changed through the shift screen.')} }
for(const r of old)if(r.owner&&!ids.has(r.id))fail('Photo-recorded shifts cannot be removed.');
for(const r of b.rows.filter(x=>x.type==='Reading'))if(!b.rows.some(n=>n.id===r.nozzle&&n.type==='Nozzle'&&n.fuel===r.fuel))fail('A reading needs its original nozzle.');
for(const n of b.rows.filter(x=>x.type==='Nozzle'))validateMeter(b.rows.filter(r=>r.nozzle===n.id));
run('DELETE FROM records');b.rows.forEach(put);bump()});return send({revision:revision()})}
if(action==='POST /start'||action==='POST /close'){let b=await read(req),bytes=image(b.photo);transaction(()=>{let list=records(),r,stage;
if(path==='/start'){let n=list.find(n=>n.type==='Nozzle'&&n.status==='Active'&&n.id===b.nozzle);if(!n||!orders.includes(b.shift)||!/^\d{4}-\d\d-\d\d$/.test(b.date))fail('Select a nozzle, business date and shift.');
r={type:'Reading',id:randomUUID(),owner:u.id,person:u.name,fuel:n.fuel,nozzle:n.id,date:b.date,shift:b.shift,open:number(b.open),close:'',returned:0,rate:number(b.rate),cost:number(n.cost??0),started:new Date().toISOString()};stage='opening'}
else{r=list.find(x=>x.type==='Reading'&&x.id===b.id);if(!r||!r.owner||(!isLead(u)&&r.owner!==u.id))fail('Shift unavailable.',403);if(r.close!=='')fail('Shift already closed.',409);
r.close=number(b.close);r.returned=number(b.returned??0);if(r.close-r.open<r.returned)fail('Closing meter must cover the opening meter and returned litres.');r.ended=new Date().toISOString();r.closedBy=u.name;stage='closing'}
validateMeter([...list.filter(x=>x.nozzle===r.nozzle&&x.id!==r.id),r]);put(r);run('INSERT INTO photos VALUES(?,?,?)',r.id,stage,bytes);bump()});return send({ok:true})}
const match=path.match(/^\/photo\/([a-f\d-]+)\/(opening|closing)$/);if(req.method==='GET'&&match){const r=one('SELECT body FROM records WHERE id=?',match[1]);if(!r||(!isLead(u)&&JSON.parse(r.body).owner!==u.id))fail('Photo unavailable.',403);const photo=one('SELECT bytes FROM photos WHERE id=? AND stage=?',match[1],match[2]);if(!photo)fail('Photo unavailable.',404);res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(Buffer.from(photo.bytes));return}
fail('Unknown endpoint.',404)}catch(e){if(!e.status)console.error(e.message);send({error:e.status?e.message:'Station service error.'},e.status||500)}});
server.listen(Number(process.env.PORT||3000),process.env.BIND_HOST||'127.0.0.1');
