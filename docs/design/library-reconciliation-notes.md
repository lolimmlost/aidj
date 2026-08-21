# Library Reconciliation: Lessons Learned

## The Problem
When Picard retags MeTube downloads and Lidarr moves them to proper artist folders,
Navidrome creates new song IDs for the files at their new paths. The old IDs become
"metadata ghosts" — `getSong` still returns data (Navidrome's DB hasn't been cleaned),
but the actual file is gone and streaming returns an XML error instead of audio.

## Key Insight: Metadata Check Is Not Enough
`getSongsByIds` will succeed for ghost entries — Navidrome keeps the metadata row even
after the file is deleted/moved. The ONLY reliable check is a HEAD request on the
`/rest/stream` endpoint: if `Content-Type` is `application/xml` instead of `audio/*`,
the file is gone.

## Duplicate Key Handling
When remapping old ID → new ID, the new ID may already exist in `liked_songs_sync`,
`playlist_songs`, or `recommendation_feedback` (if the user re-liked the song after
Picard retagged it). The correct action is to DELETE the old ghost row rather than
failing on the unique constraint.

## MeTube Download Patterns
MeTube downloads have distinctive patterns:
- Path: `Artist/[Unknown Album]/Artist - Title.mp3`
- Title field often contains `Artist - Title` (the full YouTube title)
- Artist field may contain the YouTube channel name, not the actual artist
- After Picard: path becomes `Artist/Album/## - Title.flac`

## Channel Name Pollution
Some broken entries had YouTube channel names as the artist:
- "Chill Nation", "Majestic Casual", "Music Disc Lyrics", "DEEP OBELISK",
  "Toolroom Records", "MUTATE", "SUBSIDIA"
These won't match the real artist in a search. The 11 songs that couldn't be
auto-remapped were mostly this pattern.

## Stats from 2026-07-30 Manual Run
- 3641 total song IDs checked across liked_songs_sync + playlist_songs
- 57 broken (stream returns XML, not audio)
- 46 successfully remapped to new IDs
- 11 truly missing (channel name as artist, not in library)
