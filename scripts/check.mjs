import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())await walk(p);else if(/\.(mjs|js)$/.test(p))execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}}
await walk('.');console.log('JavaScript syntax OK');
