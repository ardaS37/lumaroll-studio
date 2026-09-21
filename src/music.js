export function demoNotes() {
  const notes = [];
  const chords = [[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]];
  for (let bar = 0; bar < 24; bar++) {
    const chord = chords[bar % 4];
    notes.push({ midi: chord[0], time: bar * 2, duration: 1.8, velocity: .7 });
    for (let beat = 0; beat < 8; beat++) {
      notes.push({ midi: chord[1 + beat % 4] + (beat % 3 === 0 ? 12 : 0), time: bar * 2 + beat * .25, duration: .42 + (beat % 3) * .13, velocity: .45 + (beat % 3) * .12 });
    }
    if (bar % 2 === 0) notes.push({ midi: chord[4] + 12, time: bar * 2 + .5, duration: 1.3, velocity: .68 });
  }
  return notes.sort((a,b) => a.time-b.time);
}
export function keyLayout() {
  let white = 0;
  return Array.from({length:88}, (_,i) => {
    const midi = i+21, black = [1,3,6,8,10].includes(midi%12);
    const position = black ? white-.32 : white++;
    return { midi, black, position, width: black ? .64 : 1 };
  });
}
export function activeNotes(notes, time) { return notes.filter(n => n.time <= time && n.time+n.duration > time); }
export function formatTime(seconds) { return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`; }

export function songDuration(notes) {
  return notes.reduce((end, note) => Math.max(end, note.time + note.duration), 1) + .5;
}

// MIDI CC64 belongs to a channel, which may be split across several tracks.
export function pianoNotes(midi) {
  const channels = new Map();
  let end = midi.duration || 0;
  for (const track of midi.tracks) {
    const events = channels.get(track.channel) || [];
    for (const event of track.controlChanges[64] || []) {
      events.push({time: event.time, value: event.value});
      end = Math.max(end, event.time);
    }
    channels.set(track.channel, events);
  }
  const intervals = new Map();
  for (const [channel, events] of channels) {
    const spans = [];
    let start = null;
    for (const event of events.sort((a, b) => a.time - b.time)) {
      if (event.value >= 64 / 127 && start === null) start = event.time;
      if (event.value < 64 / 127 && start !== null) {
        spans.push([start, event.time]);
        start = null;
      }
    }
    if (start !== null) spans.push([start, end]);
    intervals.set(channel, spans);
  }
  return midi.tracks.filter(track => !track.instrument.percussion).flatMap(track =>
    track.notes.filter(note => note.midi >= 21 && note.midi <= 108).map(note => {
      const release = note.time + note.duration;
      const spans = intervals.get(track.channel) || [];
      const span = spans.find(([start, stop]) => start <= release && release < stop);
      return {midi: note.midi, time: note.time, velocity: note.velocity,
        duration: (span ? span[1] : release) - note.time};
    })
  ).sort((a, b) => a.time - b.time);
}
