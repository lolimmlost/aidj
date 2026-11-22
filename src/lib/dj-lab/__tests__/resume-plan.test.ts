import { describe, expect, it, vi } from 'vitest';
import { planResume, resumeBar, type ResumeDeps } from '../resume-plan';
import type { ResumePoint } from '../resume';
import type { LabSong } from '../crate';
import type { SavedSet } from '../sets';
import { track } from './fixtures';

const song = (id: string, artist: string, title: string): LabSong => ({ id, artist, title, duration: 240 });
const A = song('a1', 'Grupo Cañaveral de Humberto Pabón', 'Tiene espinas el rosal');
const B = song('b2', 'Fito Olivares', 'Juana la cubana');
// 128 BPM, 1.875 s bars, bar 0 at 0 s
const analysis = track([
  [64, -20],
  [64, -8],
]);

const point = (over: Partial<ResumePoint> = {}): ResumePoint => ({
  sid: 'n2t1sn',
  t: 0,
  status: 'paused',
  reason: 'died',
  savedAt: 0,
  song: `${A.artist} – ${A.title}`,
  songId: A.id,
  pos: 134,
  next: `locked ${B.artist} – ${B.title}`,
  nextId: B.id,
  setId: 'set1',
  setBpm: 128,
  mode: 'dropchain',
  ...over,
});

const savedSet: SavedSet = { id: 'set1', startedAt: '2026-11-19T03:44:31.000Z', updatedAt: '', setBpm: 84.6, mode: 'classic', tracks: [] };

function deps(over: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    // like the crate's findSongs: by id, else by title
    findSongs: vi.fn(async (tracks: { id: string; title: string }[]) => tracks.map((t) => [A, B].find((s) => s.id === t.id) ?? [A, B].find((s) => s.title === t.title) ?? null)),
    getCachedAnalysis: vi.fn(async () => analysis),
    loadSets: () => [savedSet],
    setWhen: (iso: string) => `when(${iso})`,
    ...over,
  };
}

describe('resumeBar', () => {
  it('is the bar that was playing, counted at the set tempo', () => {
    expect(resumeBar(analysis, 134, 128)).toBe(71); // 134 / 1.875 = 71.5
    // a set at half the tempo counts this track's bars twice as long
    expect(resumeBar(analysis, 134, 64)).toBe(35);
  });

  it('starts from the top before the first bar', () => {
    expect(resumeBar(analysis, undefined, 128)).toBeUndefined();
    expect(resumeBar(analysis, 0, 128)).toBeUndefined();
    expect(resumeBar(analysis, 1, 128)).toBeUndefined();
  });
});

describe('planResume (#439)', () => {
  it('resumes the playing song at its bar, then the song that was locked', async () => {
    const plan = await planResume(point(), [], deps());
    expect(plan).toEqual({
      song: A,
      fromBar: 71,
      entries: [{ song: B }],
      setBpm: 128,
      mode: 'dropchain',
      name: 'Resumed · when(2026-11-19T03:44:31.000Z)',
    });
  });

  it('works from labels and the saved set for heartbeats written before the ids were kept', async () => {
    const d = deps();
    const plan = await planResume(point({ songId: undefined, nextId: undefined, setBpm: undefined, mode: undefined }), [], d);
    expect(vi.mocked(d.findSongs).mock.calls[0][0]).toEqual([
      { id: '', artist: A.artist, title: A.title },
      { id: '', artist: B.artist, title: B.title },
    ]);
    // the saved set's tempo (84.6) counts this 128 BPM track at half: 3.75 s bars
    expect(plan).toMatchObject({ song: A, entries: [{ song: B }], setBpm: 84.6, mode: 'classic', fromBar: 35 });
  });

  it("doesn't come back to a song whose lock failed", async () => {
    const plan = await planResume(point({ next: `failed ${B.artist} – ${B.title}`, nextId: undefined }), [], deps());
    expect(plan?.entries).toEqual([]);
  });

  it('starts the song from the top without an analysis, and names an unknown set plainly', async () => {
    const plan = await planResume(point({ setId: undefined }), [], deps({ getCachedAnalysis: async () => null }));
    expect(plan).toMatchObject({ song: A, fromBar: undefined, name: 'Resumed set' });
  });

  it('gives up when the playing song is gone from the library', async () => {
    expect(await planResume(point(), [], deps({ findSongs: async () => [null, B] }))).toBeNull();
  });
});
