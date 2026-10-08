import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const password=JSON.parse(readFileSync('.private/interview/credentials.json')).password;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const base='http://127.0.0.1:4320';const ops=['start','stop','reconnect','pulse','audio','hint'];
try {
 for(const user of ['anonymous','preview_normal','preview_pro','preview_admin']) {
  const context=await browser.newContext();
  await context.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__interviewTracks=[];navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__interviewTracks.push(...stream.getTracks());return stream;};});
  const page=await context.newPage();
  if(user!=='anonymous') {
   await page.goto(base+'/login?next=/admin/interview');
   await page.locator('input[name="email"]').fill(user+'@skill-compass.invalid');
   await page.locator('input[name="password"]').fill(password);
   const loginResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/login'));
   await page.locator('button[type="submit"]').click();await loginResponse;
   await page.goto(base+'/admin/interview');
   await page.waitForURL(url => url.pathname === (user==='preview_admin'?'/admin/interview':'/settings'));
   if(user==='preview_admin') await page.getByRole('heading',{name:'面接サポート',exact:true}).waitFor();
  } else {await page.goto(base+'/admin/interview');assert.match(page.url(),/login/);}
  for(const op of ops) {
   const r=await context.request.post(base+'/api/admin/interview/'+op,{headers:{origin:base},data:{role:'admin',plan:'pro'}});
   if(user==='preview_admin' && r.status()!==200 && op==='start') console.log(await r.text());
   assert.equal(r.status(),user==='anonymous'?401:user==='preview_admin'?(op==='start'?200:410):403,`${user} ${op}`);
  }
  if(user==='preview_admin') {
   await page.getByRole('button',{name:'開始',exact:true}).click();
   await page.getByRole('button',{name:'サンプル質問を送信'}).click();
   await page.getByText('実際に経験した場面を一つ選ぶ',{exact:true}).waitFor();
   mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/interview-admin-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile horizontal overflow');
   await page.screenshot({path:'test-results/interview-admin-mobile.png',fullPage:true});
   await page.getByRole('button',{name:'停止・表示を消去'}).click();
   assert.equal(await page.getByText('実際に経験した場面を一つ選ぶ',{exact:true}).count(),0);
   await page.getByLabel('動作モード').selectOption('capture');
   await page.getByLabel('面接官の音声').selectOption('device');
   const audioAccepted=page.waitForResponse(r=>r.url().endsWith('/audio')&&r.status()===200);
   await page.getByRole('button',{name:'開始',exact:true}).click();
   await page.getByText('実行中 · 音声取得中',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('meter')?.value>0);await audioAccepted;
   await page.getByRole('button',{name:'停止・表示を消去'}).click();
   await page.waitForFunction(()=>window.__interviewTracks.length>0&&window.__interviewTracks.every(t=>t.readyState==='ended'));
   console.log('admin UI mock hint / fake audio / stop / desktop+mobile passed');
  }
  console.log(user+' page/API access passed');await context.close();
 }
} finally {await browser.close();}
