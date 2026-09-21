import test from 'node:test';
import assert from 'node:assert/strict';
import {demoNotes,keyLayout,activeNotes,formatTime,pianoNotes,songDuration} from '../src/music.js';
test('88-key layout covers exactly 52 white keys and keeps black keys within bounds',()=>{const keys=keyLayout();assert.equal(keys.length,88);assert.equal(keys.filter(k=>!k.black).length,52);assert.equal(keys[0].midi,21);assert.equal(keys.at(-1).midi,108);assert.ok(keys.every(k=>k.position>=0&&k.position+k.width<=52));});
test('demo notes are ordered and in piano range',()=>{const notes=demoNotes();assert.ok(notes.length>200);assert.ok(notes.every((n,i)=>n.midi>=21&&n.midi<=108&&n.duration>0&&(i===0||n.time>=notes[i-1].time)));});
test('active note ends precisely at its release boundary',()=>{const notes=[{time:1,duration:2}];assert.equal(activeNotes(notes,.99).length,0);assert.equal(activeNotes(notes,1).length,1);assert.equal(activeNotes(notes,3).length,0);assert.equal(formatTime(125),'2:05');});

test('sustain follows the MIDI channel, release boundary, and pedal threshold',()=>{
  const note=(midi,time,duration)=>({midi,time,duration,velocity:.7});
  const source=[note(60,0,1),note(62,0,2),note(64,2,1)];
  const track=(channel,notes,events=[],percussion=false)=>({channel,notes,controlChanges:{64:events},instrument:{percussion}});
  const result=pianoNotes({duration:4,tracks:[
    track(0,source),
    track(0,[],[{time:.5,value:1},{time:2,value:0},{time:2.5,value:.5}]),
    track(1,[note(65,0,1)]),
    track(9,[note(60,0,1)],[],true),
    track(2,[note(10,0,1)])
  ]});
  assert.equal(result.length,4);
  assert.equal(result.find(n=>n.midi===60).duration,2);
  assert.equal(result.find(n=>n.midi===62).duration,2);
  assert.equal(result.find(n=>n.midi===64).duration,1);
  assert.equal(result.find(n=>n.midi===65).duration,1);
  assert.equal(source[0].duration,1);
});

test('unreleased pedal ends at song end and large scores do not overflow arguments',()=>{
  const notes=pianoNotes({duration:10,tracks:[{channel:0,instrument:{percussion:false},
    controlChanges:{64:[{time:0,value:1}]},notes:[{midi:60,time:0,duration:1,velocity:1}]}]});
  assert.equal(notes[0].duration,10);
  assert.equal(songDuration(notes),10.5);
  assert.equal(songDuration(Array.from({length:200000},()=>({time:2,duration:3}))),5.5);
  assert.ok(songDuration(demoNotes())>48);
});
