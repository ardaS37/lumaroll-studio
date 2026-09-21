import { Midi } from '@tonejs/midi';
import { demoNotes, keyLayout, activeNotes, formatTime, pianoNotes, songDuration } from './music.js';

const $ = id => document.getElementById(id);
const canvas = $('visualizer'), ctx = canvas.getContext('2d', {alpha:false});
const palettes = { aurora: ['#62f3d0','#61baff'], ember:['#ffb459','#ff6a45'], violet:['#c285ff','#739dff'] };
const options = {glow:.75,particles:.65,smoke:.5,speed:1,keyboard:true,trails:true,stars:true};
const keys = keyLayout();
let notes = demoNotes(), duration = songDuration(notes), time = 0, playing = false, lastFrame = 0, palette = palettes.aurora;
let particles = [], clouds = [], triggered = new Set(), audioContext, master, destination;
let recorder, recording = false, recordingStream, toastTimer, trackName = 'Midnight Motion';
const voices = new Set();
const stars = Array.from({length:85}, (_,i) => ({ x: ((i*7919)%997)/997, y: ((i*3571)%991)/991, r:.4+(i%3)*.3 }));
function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4000); }
async function ensureAudio() {
  if (!audioContext) { audioContext = new AudioContext(); master=audioContext.createGain(); master.gain.value=.38; master.connect(audioContext.destination); destination=audioContext.createMediaStreamDestination(); master.connect(destination); }
  await audioContext.resume();
}
function sound(note, remaining = note.duration) {
  if (!audioContext || !$('audio').checked) return;
  const now=audioContext.currentTime, length=Math.max(.01,remaining), frequency=440*Math.pow(2,(note.midi-69)/12);
  const gain=audioContext.createGain(); gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(note.velocity*.25,now+.008); gain.gain.exponentialRampToValueAtTime(.001,now+length+.4); gain.connect(master);
  const oscs = [1,2,3].map((harmonic,index)=>{ const osc=audioContext.createOscillator(), level=audioContext.createGain(); osc.type='sine'; osc.frequency.value=frequency*harmonic; level.gain.value=[1,.28,.09][index]; osc.connect(level); level.connect(gain); osc.start(now); osc.stop(now+length+.45); return osc; });
  const voice={oscs,gain}; voices.add(voice); oscs[0].onended=()=>{ voices.delete(voice);gain.disconnect(); };
}
function silence(){ for(const voice of voices){voice.gain.gain.cancelScheduledValues(audioContext.currentTime);voice.gain.gain.setTargetAtTime(.0001,audioContext.currentTime,.012);for(const osc of voice.oscs){try{osc.stop(audioContext.currentTime+.05);}catch{}}} voices.clear(); }
function resetAt(value) { silence(); time=Math.max(0,Math.min(value,duration)); particles=[];clouds=[];triggered=new Set(notes.map((n,i)=>n.time<time?i:-1));if(playing)for(const n of activeNotes(notes,time))sound(n,n.time+n.duration-time); updateTransport(); }
function updateTransport(){ $('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Duraklat':'Oynat');$('seek').value=time;$('time').textContent=`${formatTime(time)} / ${formatTime(duration)}`; }
async function togglePlay(){try{await ensureAudio();if(time>=duration)resetAt(0);playing=!playing;if(playing){lastFrame=performance.now();for(const n of activeNotes(notes,time))if(n.time<time)sound(n,n.time+n.duration-time);}else{silence();if(recording)stopRecording();} updateTransport();}catch{toast('Ses sistemi açılamadı.');} }
$('play').onclick=togglePlay;
$('restart').onclick=()=>{if(recording)stopRecording();resetAt(0);};
$('seek').oninput=e=>{if(recording)stopRecording();resetAt(Number(e.target.value));};
$('audio').onchange=()=>{if(!$('audio').checked)silence();else if(playing)for(const n of activeNotes(notes,time))sound(n,n.time+n.duration-time);};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();togglePlay();}});
for(const id of ['glow','particles','smoke','speed']) $(id).oninput=e=>{options[id]=Number(e.target.value)/(id==='speed'?1:100);$(id+'-value').textContent=id==='speed'?options[id].toFixed(1)+'×':e.target.value+'%';};
for(const id of ['keyboard','trails','stars']) $(id).onchange=e=>options[id]=e.target.checked;
document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{palette=palettes[button.dataset.preset];document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b===button));});
$('clean').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{toast('Tam ekran bu ortamda kullanılamıyor.');}};
function loadNotes(newNotes,name,detail){if(recording)stopRecording();playing=false;notes=newNotes;duration=songDuration(notes);trackName=name;$('track-title').textContent=name;$('track-detail').textContent=detail;$('seek').max=duration;resetAt(0);}
async function loadFile(file){if(!file)return;try{if(file.size>20*1024*1024)throw new Error('MIDI dosyası 20 MB sınırını aşıyor.');const midi=new Midi(await file.arrayBuffer());const parsed=pianoNotes(midi);if(!parsed.length)throw new Error('Bu dosyada piyano aralığında nota bulunamadı.');loadNotes(parsed,file.name.replace(/\.midi?$/i,''),`${parsed.length} nota · ${midi.tracks.length} kanal`);toast('MIDI hazır. Oynat düğmesine bas.');}catch(error){toast('Dosya açılamadı: '+error.message);}}
$('upload').onclick=()=>$('file').click();$('file').onchange=e=>{loadFile(e.target.files[0]);e.target.value='';};
window.addEventListener('dragover',e=>{e.preventDefault();$('stage').classList.add('dragging');});window.addEventListener('dragleave',()=>$('stage').classList.remove('dragging'));window.addEventListener('drop',e=>{e.preventDefault();$('stage').classList.remove('dragging');loadFile(e.dataTransfer.files[0]);});
$('demo').onclick=()=>loadNotes(demoNotes(),'Midnight Motion','Demo beste · 88 tuş piyano');
function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop();recording=false;$('export').textContent='↗ Video kaydet';}
$('export').onclick=async()=>{
  if(recording){stopRecording();return;}
  try{
    await ensureAudio();
    if(!window.MediaRecorder)throw new Error('Bu ortam video kaydını desteklemiyor.');
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('WebM kodlayıcı bulunamadı.');
    playing=false;resetAt(0);canvas.width=1920;canvas.height=1080;
    const stream=canvas.captureStream(60);recordingStream=stream;const chunks=[];
    const capture=new MediaRecorder(new MediaStream([...stream.getVideoTracks(),...destination.stream.getAudioTracks()]),{mimeType:mime,videoBitsPerSecond:14000000});recorder=capture;
    capture.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    capture.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=trackName.replace(/[^\p{L}\p{N} _-]/gu,'')+'-luma.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Video kaydı hazır · WebM');};
    capture.onerror=()=>{stopRecording();toast('Video kaydı sırasında bir hata oluştu.');};
    capture.start(1000);recording=true;playing=true;lastFrame=performance.now();updateTransport();$('export').textContent='■ Kaydı bitir';toast('1920 × 1080 kayıt başladı. Parça sonunda otomatik kaydedilir.');
  }catch(error){recordingStream?.getTracks().forEach(t=>t.stop());toast(error.message);}
};
function keyColor(midi){return midi<60?palette[0]:palette[1];}
function emit(note,width,hitY){const key=keys[note.midi-21];if(!key)return;const x=(key.position+key.width/2)*width/52,color=keyColor(note.midi);for(let i=0;i<Math.round(options.particles*28);i++)particles.push({x,y:hitY,vx:(Math.random()-.5)*width*.13,vy:-(.025+Math.random()*.15)*width,life:.4+Math.random()*1.1,total:1.5,size:.5+Math.random()*1.6,color});if(options.smoke>0)for(let i=0;i<3;i++)clouds.push({x,y:hitY-5,vx:(Math.random()-.5)*18,vy:-14-Math.random()*18,life:1.5+Math.random(),size:10+Math.random()*20,color});}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function render(now){
  const dt=Math.min((now-lastFrame)/1000||0, .1);lastFrame=now;
  if(!recording){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
  const w=canvas.width,h=canvas.height,scale=w/1200,hitY=h*(options.keyboard?.79:.9),keyW=w/52;
  if(playing){const old=time;time+=dt;notes.forEach((n,i)=>{if(n.time<=time&&n.time+n.duration>=old&&!triggered.has(i)){triggered.add(i);sound(n,n.time+n.duration-time);emit(n,w,hitY);}});if(time>=duration){time=duration;playing=false;silence();if(recording)stopRecording();}updateTransport();}
  ctx.fillStyle='#040810';ctx.fillRect(0,0,w,h);
  const bg=ctx.createRadialGradient(w*.5,hitY,w*.02,w*.5,hitY,w*.7);bg.addColorStop(0,'#101e2a');bg.addColorStop(1,'#04070d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  if(options.stars){ctx.fillStyle='#839fae';for(const star of stars){ctx.globalAlpha=.12+.2*(.5+.5*Math.sin(now*.0005+star.x*22));ctx.beginPath();ctx.arc(star.x*w,star.y*hitY,star.r*scale,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  ctx.strokeStyle='#90baca06';ctx.lineWidth=1;for(const key of keys.filter(k=>k.midi%12===0)){ctx.beginPath();ctx.moveTo(key.position*keyW,0);ctx.lineTo(key.position*keyW,hitY);ctx.stroke();}
  const active=activeNotes(notes,time),pps=h*.25*options.speed;
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,hitY);ctx.clip();
  for(const n of notes){const bottom=hitY-(n.time-time)*pps,top=bottom-n.duration*pps;if(bottom<0||top>hitY)continue;const key=keys[n.midi-21],x=(key.position+.07)*keyW,nw=(key.width-.14)*keyW,color=keyColor(n.midi),nh=Math.max(4,bottom-top-2);
    if(options.trails){const tail=ctx.createLinearGradient(0,Math.max(0,top-h*.15),0,top+nh);tail.addColorStop(0,color+'00');tail.addColorStop(1,color+'16');ctx.fillStyle=tail;ctx.fillRect(x,top-h*.15,nw,nh+h*.15);}
    ctx.shadowColor=color;ctx.shadowBlur=options.glow*22*scale;const fill=ctx.createLinearGradient(x,0,x+nw,0);fill.addColorStop(0,color+'a0');fill.addColorStop(.5,color);fill.addColorStop(1,color+'ac');ctx.fillStyle=fill;rounded(x,top,nw,nh,Math.min(3*scale,nw/2));ctx.shadowBlur=0;ctx.fillStyle='#ffffff65';ctx.fillRect(x+1,top+3,Math.max(1,scale),Math.max(0,nh-6));
  }
  ctx.globalCompositeOperation='lighter';
  for(const cloud of clouds){if(playing){cloud.x+=cloud.vx*dt;cloud.y+=cloud.vy*dt;cloud.life-=dt;cloud.size+=dt*20;}const radius=cloud.size*scale;const fog=ctx.createRadialGradient(cloud.x,cloud.y,0,cloud.x,cloud.y,radius);fog.addColorStop(0,cloud.color+'20');fog.addColorStop(1,cloud.color+'00');ctx.globalAlpha=Math.max(0,cloud.life/2.5)*options.smoke;ctx.fillStyle=fog;ctx.fillRect(cloud.x-radius,cloud.y-radius,radius*2,radius*2);}
  ctx.globalAlpha=1;
  for(const n of active){const key=keys[n.midi-21],x=(key.position+key.width/2)*keyW,color=keyColor(n.midi);const radius=(28+options.glow*45)*scale;const light=ctx.createRadialGradient(x,hitY,0,x,hitY,radius);light.addColorStop(0,color+'b0');light.addColorStop(.2,color+'45');light.addColorStop(1,color+'00');ctx.fillStyle=light;ctx.fillRect(x-radius,hitY-radius,2*radius,2*radius);if(playing&&Math.random()<options.particles*.4)particles.push({x,y:hitY,vx:(Math.random()-.5)*w*.05,vy:-Math.random()*w*.1,life:.65,total:.65,size:Math.random()*1.3+.4,color});}
  for(const p of particles){if(playing){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=22*dt;p.life-=dt;}ctx.globalAlpha=Math.max(0,p.life/p.total);ctx.strokeStyle=p.color;ctx.lineWidth=p.size*scale;ctx.shadowColor=p.color;ctx.shadowBlur=options.glow*8;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.017,p.y-p.vy*.017);ctx.stroke();}
  ctx.restore();particles=particles.filter(p=>p.life>0).slice(-2200);clouds=clouds.filter(c=>c.life>0).slice(-120);
  ctx.shadowBlur=options.glow*15;ctx.shadowColor=palette[0];ctx.fillStyle=palette[0]+'90';ctx.fillRect(0,hitY,w,1.5*scale);ctx.shadowBlur=0;
  if(options.keyboard){const keyH=h*.15;for(const black of [false,true])for(const key of keys.filter(k=>k.black===black)){const on=active.some(n=>n.midi===key.midi),x=key.position*keyW,y=hitY+3*scale,kh=keyH*(black?.63:1),kw=key.width*keyW-1*scale;const grad=ctx.createLinearGradient(0,y,0,y+kh);grad.addColorStop(0,on?keyColor(key.midi):black?'#080e17':'#c3cbd1');grad.addColorStop(1,on?keyColor(key.midi)+'a0':black?'#182330':'#f0f0ec');ctx.fillStyle=grad;ctx.shadowBlur=black?3*scale:0;ctx.shadowColor='#000';rounded(x,y,kw,kh,2*scale);ctx.shadowBlur=0;if(!black&&key.midi%12===0){ctx.fillStyle='#596772';ctx.font=`${7*scale}px sans-serif`;ctx.fillText('C'+(Math.floor(key.midi/12)-1),x+2*scale,y+kh-7*scale);}}}
  if(Math.floor(now/1000)!==Math.floor((now-dt*1000)/1000))$('fps').textContent=Math.round(1/(dt||.016))+' FPS';requestAnimationFrame(render);
}
$('seek').max=duration;restoreSettings();updateTransport();requestAnimationFrame(render);

function saveSettings(){
  try{localStorage.setItem('luma-settings',JSON.stringify({options,preset:document.querySelector('[data-preset].active').dataset.preset,audio:$('audio').checked}));}catch{}
}
function restoreSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem('luma-settings')||'null');
    if(!saved)return;
    for(const id of ['glow','particles','smoke','speed']){
      const value=saved.options?.[id], input=$(id), multiplier=id==='speed'?1:100;
      if(typeof value==='number'&&Number.isFinite(value)){
        input.value=Math.max(Number(input.min),Math.min(Number(input.max),value*multiplier));
        input.oninput({target:input});
      }
    }
    for(const id of ['keyboard','trails','stars'])if(typeof saved.options?.[id]==='boolean'){$(id).checked=saved.options[id];options[id]=saved.options[id];}
    if(typeof saved.audio==='boolean')$('audio').checked=saved.audio;
    if(Object.hasOwn(palettes,saved.preset))document.querySelector(`[data-preset="${saved.preset}"]`).click();
  }catch{}
}
for(const id of ['glow','particles','smoke','speed','keyboard','trails','stars','audio'])$(id).addEventListener('change',saveSettings);
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',saveSettings));
