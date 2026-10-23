import { describe, it, expect } from 'vitest';
import { parseMixTracklist, mixDisplayTitle } from '../mix-tracklist';

// Shape of the comment tag publish_mix.sh writes (TBP "Five-Star Peak Time", first lines)
const COMMENT = [
  '0:00   1. Sharam – August Dub (Extended Mix)',
  '2:15   2. Sonny Jack – Take It Slow',
  '9:19   6. Tiësto & KSHMR feat. Vassy – Secrets',
  '11:10   7. KSHMR – Sleepwalk',
].join('\n');

describe('parseMixTracklist', () => {
  it('parses timestamp, position, artist and title', () => {
    const tracks = parseMixTracklist(COMMENT);
    expect(tracks).toHaveLength(4);
    expect(tracks[0]).toEqual({ start: 0, time: '0:00', position: 1, artist: 'Sharam', title: 'August Dub (Extended Mix)' });
    expect(tracks[2]).toMatchObject({ start: 559, artist: 'Tiësto & KSHMR feat. Vassy', title: 'Secrets' });
    expect(tracks[3].start).toBe(670);
  });

  it('reads hour-long timestamps', () => {
    expect(parseMixTracklist('1:02:03  14. Coldwave – Last')[0].start).toBe(3723);
  });

  it('splits on a spaced hyphen when there is no en dash', () => {
    expect(parseMixTracklist('3:00  2. Artist - Title - Remix')[0]).toMatchObject({ artist: 'Artist', title: 'Title - Remix' });
  });

  it('keeps a line without a separator as the title', () => {
    expect(parseMixTracklist('3:00  2. Untitled')[0]).toMatchObject({ artist: '', title: 'Untitled' });
  });

  it('ignores other comment text and empty input', () => {
    expect(parseMixTracklist('Rendered by AIDJ\n\n0:00   1. A – B\nnotes')).toHaveLength(1);
    expect(parseMixTracklist(undefined)).toEqual([]);
    expect(parseMixTracklist('')).toEqual([]);
  });
});

describe('mixDisplayTitle', () => {
  it('drops a trailing version note', () => {
    expect(mixDisplayTitle('Five-Star Peak Time (bar-fix test)')).toBe('Five-Star Peak Time');
  });

  it('leaves plain titles alone', () => {
    expect(mixDisplayTitle('Jungle Set 1')).toBe('Jungle Set 1');
  });
});
