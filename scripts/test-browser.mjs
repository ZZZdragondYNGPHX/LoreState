import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(path);res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  for(const page of ['template-browser.html','runtime-browser.html?bundle=1']){
    const profile=await mkdtemp(join(tmpdir(),'lorestate-browser-'));
    const {stdout}=await promisify(execFile)(process.env.LORESTATE_BROWSER??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
      '--headless','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--dump-dom','--virtual-time-budget=15000',`http://127.0.0.1:${server.address().port}/tests/${page}`,
    ],{windowsHide:true,timeout:30000,maxBuffer:2000000});
    const result=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]??'missing results';
    console.log(page+'\n'+result);
    if(!result.includes('PASS ')||result.includes('FAIL ')||result.includes('正在运行'))throw new Error('Browser regression failed');
  }
}finally{server.close();}
