import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const env=process.env;
const port=3100;
const origin='https://'+env.CODESPACE_NAME+'-'+port+'.'+env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const required=['CODESPACE_NAME','GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN','WA_TOKEN','WA_PHONE_ID','WA_TEMPLATE','WA_LANGUAGE','WA_GRAPH_VERSION'];
if(required.some(key=>!env[key])||!/^v\d+\.\d+$/.test(env.WA_GRAPH_VERSION)||!/^\d+$/.test(env.WA_PHONE_ID)){
  throw Error('Configure the Codespace and the WhatsApp settings listed in WHATSAPP.md first.');
}
const code=randomBytes(18).toString('hex');
const page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forecourt WhatsApp Business sender</title><style>body{max-width:36rem;margin:3rem auto;padding:1rem;font:16px/1.6 system-ui;color:#183b34}pre{white-space:pre-wrap;font:inherit}input,button{font:inherit;padding:.5rem}button{display:block;margin-top:1rem}</style><h1>WhatsApp Business sender</h1><pre id="preview"></pre><form hidden><label>Station sender code <input name="code" type="password" required autocomplete="off"></label><p><label><input type="checkbox" required> This customer agreed to receive account updates on WhatsApp.</label></p><button>Send credit update</button></form><p id="result" role="status"></p><script src="/sender.js"></script></html>';
function client(){
  const preview=document.querySelector('#preview'),form=document.querySelector('form'),status=document.querySelector('#result');
  let draft;
  try{
    draft=JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if(!Array.isArray(draft.values)||draft.values.length!==7||!/^[1-9]\d{7,14}$/.test(draft.to))throw Error();
    const [station,customer,date,opening,credit,paid,balance]=draft.values;
    preview.textContent=[station,'To '+customer+' · +'+draft.to,date,'Opening balance: PKR '+opening,'Credit added: PKR '+credit,'Payment received: PKR '+paid,'Closing balance: PKR '+balance].join('\n');
    form.hidden=false;
  }catch{preview.textContent='Open a credit update from the customer profile in Forecourt.'}
  history.replaceState(null,'','/');
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try{
      const response=await fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,code:form.elements.code.value})});
      const data=await response.json();status.textContent=data.message;
      if(response.ok){form.reset();form.hidden=true}else if(response.status<500){button.disabled=false}
    }catch{status.textContent='Could not confirm the send. Check your business message history before retrying.'}
  };
}
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  function reply(status,message){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({message}))}
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page)}
  if(req.method==='GET'&&req.url==='/sender.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end('('+client.toString()+')()')}
  if(req.method!=='POST'||req.url!=='/send')return reply(404,'Page unavailable.');
  if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return reply(403,'Open the station business sender to continue.');
  let body;
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>8192)return reply(413,'Update too large.');chunks.push(chunk)}
    body=JSON.parse(Buffer.concat(chunks).toString());
  }catch{return reply(400,'Invalid update.')}
  const supplied=Buffer.from(typeof body?.code==='string'?body.code:'');
  if(supplied.length!==code.length||!timingSafeEqual(supplied,Buffer.from(code)))return reply(403,'Enter the current sender code from the station Codespace terminal.');
  if(!/^[1-9]\d{7,14}$/.test(body.to)||!Array.isArray(body.values)||body.values.length!==7||body.values.some(s=>typeof s!=='string'||!s.trim()||s.length>500||/[\r\n\t]/.test(s)))return reply(400,'Check the phone number and statement fields.');
  try{
    const result=await fetch('https://graph.facebook.com/'+env.WA_GRAPH_VERSION+'/'+env.WA_PHONE_ID+'/messages',{
      method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.WA_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:body.to,type:'template',template:{name:env.WA_TEMPLATE,language:{code:env.WA_LANGUAGE},components:[{type:'body',parameters:body.values.map(text=>({type:'text',text}))}]}})
    });
    const info=await result.json();
    if(result.ok&&info.messages?.[0]?.id)return reply(200,'Meta accepted the credit update for sending.');
    return reply(502,'Meta did not confirm acceptance. Check the business account and template (code '+(Number(info.error?.code)||'unknown')+').');
  }catch{return reply(502,'Send status unknown. Check the business account before sending again.')}
}).listen(port,'127.0.0.1',()=>console.log('Private sender: '+origin+'\nStation sender code: '+code));
