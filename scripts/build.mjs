import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
const run=promisify(execFile);
const ffmpeg=process.env.PORTFOLIO_FFMPEG||path.resolve('node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
const manifest=JSON.parse(await fs.readFile('portfolio-media.json','utf8'));
const cache=path.resolve('node_modules/.cache/portfolio-v1');
await fs.mkdir(cache,{recursive:true});await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/media',{recursive:true});
// Preserve the original static assets, including paths used by the particle canvas.
for(const entry of await fs.readdir('.',{withFileTypes:true})){
 if(entry.name==='index.html'||entry.isFile()&&/\.(webp|png|jpe?g|svg|ico|mp4|webm|woff2?|txt)$/i.test(entry.name))await fs.copyFile(entry.name,path.join('dist',entry.name));
 if(entry.isDirectory()&&['img','vid','logos','fonts'].includes(entry.name))await fs.cp(entry.name,path.join('dist',entry.name),{recursive:true});
}
const exists=async p=>{try{return (await fs.stat(p)).size>0;}catch{return false;}};
async function download(file,target){
 if(process.env.PORTFOLIO_RAW_DIR){const local=path.join(process.env.PORTFOLIO_RAW_DIR,file.id+(file.mime_type.startsWith('video')?'.mp4':'.img'));try{if((await fs.stat(local)).size===Number(file.size)){await fs.copyFile(local,target);return;}}catch{}}
 for(let attempt=1;attempt<=3;attempt++){
  try{
   let response=await fetch('https://drive.google.com/uc?export=download&id='+encodeURIComponent(file.id),{signal:AbortSignal.timeout(600000)});
   if((response.headers.get('content-type')||'').includes('text/html')){
    const html=await response.text();const form=html.match(/<form[^>]+action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/);
    if(!form)throw new Error('Drive download unavailable; check public link sharing');
    const url=new URL(form[1].replaceAll('&amp;','&'));if(url.hostname!=='drive.usercontent.google.com')throw new Error('Unexpected Drive download host');
    for(const match of form[2].matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g))url.searchParams.set(match[1],match[2].replaceAll('&amp;','&'));
    response=await fetch(url,{signal:AbortSignal.timeout(600000)});
   }
   if(!response.ok||(response.headers.get('content-type')||'').includes('text/html'))throw new Error('Drive HTTP '+response.status);
   await pipeline(Readable.fromWeb(response.body),createWriteStream(target));
   if((await fs.stat(target)).size!==Number(file.size))throw new Error('Incomplete source download');return;
  }catch(error){await fs.rm(target,{force:true});if(attempt===3)throw new Error(file.title+': '+error.message);}
 }
}
async function prepare(file){
 const video=file.mime_type.startsWith('video');const name=file.id+(video?'.mp4':'.webp');
 const fingerprint=file.id+'-'+file.size;const ready=path.join(cache,fingerprint+(video?'.mp4':'.webp'));const poster=path.join(cache,fingerprint+(Number.isFinite(file.poster_time)?'-at-'+file.poster_time:'')+'-poster.webp');
 if(video&&Number.isFinite(file.poster_time)&&await exists(ready)&&!await exists(poster)){
  await run(ffmpeg,['-v','error','-threads','1','-filter_threads','1','-ss',String(Math.max(0.1,file.poster_time)),'-i',ready,'-frames:v','1','-vf','scale=1280:-2','-y',poster]);
 }
 if(!await exists(ready)||video&&!await exists(poster)){
  const raw=path.join(cache,fingerprint+'.source');await download(file,raw);
  try{
   if(video){
    const temp=ready+'.tmp.mp4';
    await run(ffmpeg,['-v','error','-threads','2','-filter_threads','1','-i',raw,'-vf',"scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",'-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-threads','2','-y',temp],{maxBuffer:2*1024*1024});
    await fs.rename(temp,ready);
    let duration=0;try{await run(ffmpeg,['-i',ready]);}catch(e){const m=e.stderr?.match(/Duration: (\d+):(\d+):([\d.]+)/);if(m)duration=+m[1]*3600 + +m[2]*60 + +m[3];}
    await run(ffmpeg,['-v','error','-threads','1','-filter_threads','1','-ss',String(Math.max(0.1,file.poster_time??duration*.25)),'-i',ready,'-frames:v','1','-vf','scale=1280:-2','-y',poster]);
   }else await sharp(raw).rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(ready);
  }finally{await fs.rm(raw,{force:true});}
 }
 await fs.copyFile(ready,path.join('dist/media',name));if(video)await fs.copyFile(poster,path.join('dist/media',file.id+'-poster.webp'));
 console.log('Ready:',file.title);
}
const files=manifest.flatMap(p=>p.files);let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<files.length)await prepare(files[cursor++]);}));
console.log('Built',files.length,'portfolio media files.');

