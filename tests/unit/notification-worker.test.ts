// @vitest-environment node
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
function worker(windows: unknown[] = []) {
 const listeners:Record<string,(event:unknown)=>void>={};
 const showNotification=vi.fn().mockResolvedValue(undefined),openWindow=vi.fn().mockResolvedValue(undefined);
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://example.com'},addEventListener:(type:string,handler:(event:unknown)=>void)=>{listeners[type]=handler;},registration:{showNotification},clients:{matchAll:async()=>windows,openWindow}}});
 return {listeners,showNotification,openWindow};
}
describe('notification service worker',()=>{
 it('displays a visible notification even with no payload',async()=>{
  const app=worker();let work:Promise<unknown>|undefined;
  app.listeners.push({waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;
  expect(app.showNotification).toHaveBeenCalledWith('Skill Compass',expect.objectContaining({data:{url:'/today'}}));
 });
 it('navigates and focuses an existing same-origin window, ignoring injected URLs',async()=>{
  const client={url:'https://example.com/settings',navigate:vi.fn().mockResolvedValue(undefined),focus:vi.fn().mockResolvedValue(undefined)};
  const app=worker([client]);let work:Promise<unknown>|undefined;
  const close=vi.fn();app.listeners.notificationclick({notification:{close,data:{url:'https://evil.test'}},waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;
  expect(close).toHaveBeenCalled();expect(client.navigate).toHaveBeenCalledWith('https://example.com/today');expect(client.focus).toHaveBeenCalled();expect(app.openWindow).not.toHaveBeenCalled();
 });
 it('opens Today when no app window exists',async()=>{
  const app=worker();let work:Promise<unknown>|undefined;
  app.listeners.notificationclick({notification:{close:vi.fn()},waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;
  expect(app.openWindow).toHaveBeenCalledWith('https://example.com/today');
 });
});
