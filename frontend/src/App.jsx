import { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://10.0.0.4:4000';

function App() {
  const [playlistId, setPlaylistId] = useState('');
  const [results, setResults] = useState([]);

  async function runAiDj() {
    try {
      const res = await axios.post(`${API_BASE_URL}/api/ai-dj/expand`, { playlistId, maxAdds: 5 });
      setResults(res.data.added || []);
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>AI DJ Control</h2>
      <input
        value={playlistId}
        onChange={(e) => setPlaylistId(e.target.value)}
        placeholder="Navidrome Playlist ID"
        style={{ marginRight: 10 }}
      />
      <button onClick={runAiDj}>Run AI DJ</button>
      {results.length > 0 && (
        <ul>
          {results.map((t) => (
            <li key={t.id}>
              {t.artist} — {t.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
