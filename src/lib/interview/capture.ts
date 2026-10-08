type Source = 'interviewer' | 'self';
export type Capture={close:()=>void};
export async function capture(source:Source,input:string,deviceId:string,onChunk:(source:Source,buffer:ArrayBuffer,level:number)=>void,onEnded:()=>void,signal:AbortSignal):Promise<Capture>{
 let stream:MediaStream|undefined,context:AudioContext|undefined,node:AudioWorkletNode|undefined;
 const close=()=>{node?.disconnect();stream?.getTracks().forEach(t=>t.stop());void context?.close().catch(()=>{});};
 signal.addEventListener('abort',close,{once:true});
 try{
  if(input==='display')stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
  else stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:source==='self',noiseSuppression:source==='self',autoGainControl:false}});
  if(signal.aborted){close();throw new DOMException('Cancelled','AbortError');}
  if(!stream.getAudioTracks().length)throw new Error('共有元に音声がありません。音声共有をオンにしたタブを選び直してください。');
  // Video is never read, recorded, rendered, or transmitted. Retain the display
  // track only because stopping it may terminate audio in some browsers.
  for(const track of stream.getTracks())track.addEventListener('ended',onEnded,{once:true});
  context=new AudioContext();await context.audioWorklet.addModule('/interview-pcm-worklet.js');
  if(signal.aborted){close();throw new DOMException('Cancelled','AbortError');}
  node=new AudioWorkletNode(context,'pcm');
  node.port.onmessage=event=>{if(!signal.aborted)onChunk(source,event.data.buffer,event.data.level);};
  const audioOnly=new MediaStream(stream.getAudioTracks());
  const media=context.createMediaStreamSource(audioOnly);
  const mute=context.createGain();mute.gain.value=0;
  media.connect(node);node.connect(mute);mute.connect(context.destination);await context.resume();
  if(signal.aborted){close();throw new DOMException('Cancelled','AbortError');}
  return {close};
 }catch(error){close();throw error;}
}
