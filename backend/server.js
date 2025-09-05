// backend/server.js
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOrigins = (process.env.CORS_ORIGINS || '');
const allowedOrigins = corsOrigins ? corsOrigins.split(',').map(o => o.trim()).filter(Boolean) : true;
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS']
}));

app.use(bodyParser.json());

const {
  PORT = 4000,
  NAVIDROME_URL,
  NAVIDROME_USER,
  NAVIDROME_PASS,
  LIDARR_URL,
  LIDARR_API_KEY,
} = process.env;

async function navRequest(path, params = {}) {
  const url = `${NAVIDROME_URL}${path}`;
  const qp = new URLSearchParams({
    u: NAVIDROME_USER,
    p: NAVIDROME_PASS,
    v: '1.16.1',
    c: 'ai-dj',
    ...params,
  });
  const res = await axios.get(`${url}?${qp.toString()}`, { timeout: 10000 });
  return res.data;
}

async function searchSimilarByMetadata(trackMeta, limit = 20) {
  const queries = [];
  if (trackMeta.artist) queries.push(trackMeta.artist);
  if (trackMeta.albumArtist) queries.push(trackMeta.albumArtist);
  if (trackMeta.genre) queries.push(trackMeta.genre);

  const results = new Map();
  for (const q of queries) {
    if (!q) continue;
    const r = await navRequest('/rest/search2.view', { query: q, count: 50, f: 'json' });
    const songs = r?.searchResult2?.song || [];
    for (const s of songs) {
      results.set(s.id, s);
      if (results.size >= limit) break;
    }
    if (results.size >= limit) break;
  }
  return Array.from(results.values()).slice(0, limit);
}

app.post('/api/ai-dj/expand', async (req, res) => {
  const { playlistId, trackId, maxAdds = 10 } = req.body;
  try {
    let seedTracks = [];
    if (playlistId) {
      const pl = await navRequest('/rest/getPlaylist.view', { id: playlistId, f: 'json' });
      seedTracks = pl?.playlist?.entry || [];
    } else if (trackId) {
      const r = await navRequest('/rest/getSong.view', { id: trackId, f: 'json' });
      seedTracks = [r?.song || r?.song?.[0]].filter(Boolean);
    } else {
      return res.status(400).json({ error: 'playlistId or trackId required' });
    }

    const seed = seedTracks[0];
    const candidates = await searchSimilarByMetadata(seed, 50);
    const existingIds = new Set(seedTracks.map(t => t.id));
    const toAdd = candidates.filter(c => !existingIds.has(c.id)).slice(0, maxAdds);

    if (playlistId) {
      const songIds = toAdd.map(t => t.id).join(',');
      await navRequest('/rest/updatePlaylist.view', {
        playlistId,
        songIdToAdd: songIds,
        action: 'add',
        f: 'json',
      });
    } else {
      const name = `AI-DJ - ${seed.artist || 'mix'}`;
      const songIds = toAdd.map(t => t.id).join(',');
      await navRequest('/rest/createPlaylist.view', { name, songIds, f: 'json' });
    }

    res.json({ added: toAdd.map(t => ({ id: t.id, title: t.title, artist: t.artist })) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lidarr/add', async (req, res) => {
  const { artistName } = req.body;
  if (!LIDARR_API_KEY) return res.status(400).json({ error: 'No Lidarr API key configured' });

  try {
    const search = await axios.get(`${LIDARR_URL}/api/v1/artist/lookup`, {
      params: { term: artistName },
      headers: { 'X-Api-Key': LIDARR_API_KEY },
    });
    const found = search.data?.[0];
    if (!found) return res.status(404).json({ error: 'Artist not found in Lidarr index' });

    const payload = {
      foreignArtistId: found.foreignArtistId || found.id,
      artistName: found.artistName || artistName,
      qualityProfileId: 1,
      rootFolderPath: '/music',
      monitor: 'future',
    };

    const add = await axios.post(`${LIDARR_URL}/api/v1/artist`, payload, {
      headers: { 'X-Api-Key': LIDARR_API_KEY },
    });
    res.json({ created: add.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`AI DJ backend running on port ${PORT}`));

