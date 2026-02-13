# AIDJ Download Flow

This document explains how music downloads work in AIDJ, including the integration with Lidarr and qBittorrent.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AIDJ DOWNLOAD ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────────────┐ │
│  │  AIDJ    │────▶│  Lidarr  │────▶│  Prowlarr/  │────▶│   Torrent        │ │
│  │  (UI)    │     │  (Mgr)   │     │  Jackett    │     │   Indexers       │ │
│  └──────────┘     └──────────┘     └─────────────┘     └──────────────────┘ │
│       │                │                                                     │
│       │                │                                                     │
│       │                ▼                                                     │
│       │          ┌──────────┐                                               │
│       │          │qBittorrent│──────▶ Downloads files                       │
│       │          │(Download) │                                               │
│       │          └──────────┘                                               │
│       │                │                                                     │
│       │                ▼                                                     │
│       │          ┌──────────┐                                               │
│       │          │ Lidarr   │──────▶ Imports to music library               │
│       │          │ (Import) │                                               │
│       │          └──────────┘                                               │
│       │                │                                                     │
│       │                ▼                                                     │
│       │          ┌──────────┐                                               │
│       └─────────▶│Navidrome │◀─────── Music available for streaming         │
│                  │(Library) │                                               │
│                  └──────────┘                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Download States

### Queue States (from Lidarr `/queue` API)

| Status | Icon in Lidarr | Description |
|--------|----------------|-------------|
| `queued` | Gray cloud | Lidarr is searching for a release but hasn't found one yet |
| `downloading` | Blue/animated | Release found, download in progress via qBittorrent |
| `downloaded` | Green | Download complete, waiting for import |
| `failed` | Orange/Red | Error occurred (stalled, no connections, import failed) |

### History States (from Lidarr `/history` API)

| Status | Event Type | Description |
|--------|------------|-------------|
| `grabbed` | `grabbed` | Lidarr sent the torrent to qBittorrent. Download is starting. |
| `completed` | `downloadFolderImported`, `trackFileImported` | Files successfully imported to library |
| `failed` | `downloadFailed`, `albumImportIncomplete` | Download or import failed |

## Step-by-Step Download Flow

### 1. User Initiates Download

```
User clicks "Add to Queue" in AIDJ
    │
    ▼
POST /api/lidarr/add
    │
    ▼
Lidarr adds artist/album with monitoring enabled
```

**What happens:**
- AIDJ sends request to Lidarr API
- Lidarr creates artist/album entry in its database
- Album is marked as "monitored" and "wanted"

### 2. Lidarr Searches for Releases

```
Lidarr queries indexers (Prowlarr/Jackett)
    │
    ▼
Indexers return available torrents matching criteria
    │
    ▼
Lidarr evaluates releases against quality profile
```

**Status at this point:** `queued` (gray cloud in Lidarr)

**Common issues:**
- No releases found (indexers don't have the album)
- Releases don't match quality profile
- Releases are blocklisted

### 3. Lidarr Grabs a Release

```
Lidarr selects best matching release
    │
    ▼
Sends .torrent file to qBittorrent
    │
    ▼
History event: "grabbed" is logged
```

**Status at this point:** `grabbed` (in history), `downloading` (in queue)

### 4. qBittorrent Downloads

```
qBittorrent connects to peers/seeds
    │
    ▼
Downloads file pieces
    │
    ▼
Reports progress back to Lidarr
```

**Status at this point:** `downloading` with progress %

**Common issues:**
- "Stalled with no connections" - No peers available
- "Downloading metadata" - Can't find torrent metadata
- Slow speeds - Few seeds available

### 5. Lidarr Imports Completed Download

```
qBittorrent completes download
    │
    ▼
Lidarr detects completed download
    │
    ▼
Lidarr processes/renames files
    │
    ▼
Moves files to music library folder
    │
    ▼
History event: "trackFileImported" or "downloadFolderImported"
```

**Status at this point:** `completed`

### 6. Music Available in Library

```
Navidrome scans library folder
    │
    ▼
New music appears in AIDJ Browse page
```

## Troubleshooting

### Downloads Stuck at "Queued" (Gray Cloud)

**Problem:** Lidarr can't find any releases for the album.

**Solutions:**
1. Check your indexers in Prowlarr/Jackett
2. Verify quality profile allows available formats
3. Try "Search Album" button to trigger manual search
4. Check Lidarr's "Wanted" page for more details

### Downloads Show "Stalled" or "No Connections"

**Problem:** qBittorrent grabbed the torrent but can't download.

**Solutions:**
1. Check qBittorrent connection settings
2. Verify port forwarding is configured
3. The release may have no active seeders
4. Try removing and searching for a different release

### Status Mismatch Between Pages

**Problem:** History shows "completed" but Queue shows "downloading"

**Explanation:**
- History shows Lidarr events (grabbed, imported)
- Queue shows real-time download client status
- A download can be "grabbed" (sent to client) but still downloading

**The fix in this codebase:**
- `grabbed` now correctly shows as orange "grabbed" status, not green "completed"
- Only `trackFileImported` and `downloadFolderImported` events show as "completed"

## API Endpoints

### AIDJ API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lidarr/status` | GET | Get queue, history, wanted, and stats |
| `/api/lidarr/add` | POST | Add artist/album to Lidarr |
| `/api/lidarr/cancel` | POST | Cancel a queued download |
| `/api/lidarr/retry` | POST | Retry a failed download |
| `/api/lidarr/search-album` | POST | Trigger manual album search |
| `/api/lidarr/unmonitor` | POST | Stop monitoring an album |
| `/api/lidarr/history` | GET | Get download history |

### Lidarr API (Internal)

| Endpoint | Description |
|----------|-------------|
| `/api/v1/queue` | Current download queue |
| `/api/v1/history` | Historical events |
| `/api/v1/wanted/missing` | Albums Lidarr is searching for |
| `/api/v1/command` | Trigger actions (search, etc.) |

## Status Color Reference

| Status | Color | Meaning |
|--------|-------|---------|
| `queued` | Yellow | Waiting in queue |
| `downloading` | Blue | Actively downloading |
| `grabbed` | Orange | Sent to download client |
| `importing` | Purple | Being processed by Lidarr |
| `completed` | Green | Successfully imported |
| `failed` | Red | Error occurred |

## Related Files

- `src/lib/services/lidarr.ts` - Lidarr API integration
- `src/lib/utils/downloads.ts` - Download utilities and types
- `src/routes/downloads/status.tsx` - Queue status page
- `src/routes/downloads/history.tsx` - History page
- `src/routes/api/lidarr/*.ts` - API route handlers
