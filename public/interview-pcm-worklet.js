// Audio stays in volatile memory. 100 ms / 3,200-byte, mono 16 kHz PCM chunks.
class PCM extends AudioWorkletProcessor {
 constructor(){super();this.acc=0;this.count=0;this.phase=0;this.out=[];}
 process(inputs){
  const channels=inputs[0];if(!channels?.length)return true;
  for(let i=0;i<channels[0].length;i++){
   let value=0;for(const ch of channels)value+=ch[i]/channels.length;
   this.acc+=value;this.count++;this.phase+=16000;
   if(this.phase>=sampleRate){this.phase-=sampleRate;const s=Math.max(-1,Math.min(1,this.acc/this.count));this.out.push(Math.round(s*(s<0?32768:32767)));this.acc=0;this.count=0;}
   if(this.out.length===1600){const buffer=new ArrayBuffer(3200),view=new DataView(buffer);let sum=0;for(let j=0;j<1600;j++){view.setInt16(j*2,this.out[j],true);sum+=(this.out[j]/32768)**2;}this.port.postMessage({buffer,level:Math.sqrt(sum/1600)},[buffer]);this.out=[];}
  }
  return true;
 }
}
registerProcessor('pcm',PCM);
