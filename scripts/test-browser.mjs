import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const templateResourceProbes=[];
const server=createServer(async(req,res)=>{
  const endpoint=new URL(req.url,'http://localhost').pathname;
  if(endpoint==='/__lorestate_template_probe__'){templateResourceProbes.push(endpoint);res.writeHead(200,{'Content-Type':'text/plain'}).end('probe');return;}
  if(endpoint==='/__lorestate_template_probe_results__'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(templateResourceProbes));return;}
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(path);res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function browserConnection(url){
  const socket=new WebSocket(url),pending=new Map();let id=0;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.close();reject(new Error('DevTools connection timeout'));},5000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('DevTools connection failed'));},{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data),call=pending.get(message.id);if(!call)return;
    pending.delete(message.id);clearTimeout(call.timer);
    if(message.error)call.reject(new Error(message.error.message));else call.resolve(message.result);
  });
  socket.addEventListener('close',()=>{for(const call of pending.values()){clearTimeout(call.timer);call.reject(new Error('DevTools closed'));}pending.clear();});
  return {close:()=>socket.close(),call(method,params={}){return new Promise((resolve,reject)=>{
    const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('DevTools timeout: '+method));},5000);
    pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));
  });}};
}
async function runBrowserPage(page){
  const profile=await mkdtemp(join(tmpdir(),'lorestate-browser-'));
  const browser=spawn(process.env.LORESTATE_BROWSER??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
    '--headless','--disable-gpu','--force-prefers-reduced-motion','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir='+profile,'about:blank',
  ],{windowsHide:true,stdio:'ignore'});
  let launchError,client;browser.on('error',error=>{launchError=error;});
  try{
    let port;const start=Date.now();
    while(Date.now()-start<10000){
      if(launchError)throw launchError;
      try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}
    }
    if(!port)throw new Error('Browser startup timeout');
    const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)})).json();
    client=await browserConnection(pages.find(item=>item.type==='page').webSocketDebuggerUrl);
    await client.call('Page.enable');
    await client.call('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.call('Page.bringToFront');
    await client.call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/tests/'+page});
    // Use wall-clock completion: virtual-time timers can outrun an opaque srcdoc's load event.
    let result='';const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      try{const value=await client.call('Runtime.evaluate',{expression:'document.getElementById("result")?.textContent??""',returnByValue:true});result=value.result.value??'';}catch{}
      if(result.includes('PASS ')&&!result.includes('正在运行'))break;
      await sleep(100);
    }
    console.log(page+'\n'+result);
    if(!result.includes('PASS ')||result.includes('FAIL ')||result.includes('正在运行'))throw new Error('Browser regression failed or timed out');
  }finally{
    if(client){await client.call('Browser.close').catch(()=>{});client.close();}
    if(browser.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{browser.kill();resolve();},1500);browser.once('exit',()=>{clearTimeout(timer);resolve();});});}
  }
}

try{
  for(const page of ['template-browser.html','runtime-browser.html?bundle=1'])await runBrowserPage(page);
}finally{server.close();}
