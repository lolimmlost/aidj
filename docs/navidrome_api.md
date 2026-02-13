```markdown
# Navidrome API Documentation

> **Note**: Navidrome currently does not have official API documentation. The following content is obtained through packet capture.

> **Warning**: Version 0.55.0 has undergone significant refactoring of the native API. Some of the following content may be outdated.

**Base URL**: `music.aqzscn.cn`

---

## Authentication

### Login

**Endpoint**: `POST /auth/login`

**Content-Type**: `application/json`

**Request Body**:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `username` | Yes | - | Username |
| `password` | Yes | - | Password |

**Response**:
```json
{
    "id": "34c4xxxx-xxxx-xxxx-xxxx-6442b9a3xxxx",
    "isAdmin": true,
    "lastFMApiKey": "xxx",
    "name": "username",
    "subsonicSalt": "xxx",
    "subsonicToken": "xxxxx",
    "token": "xxxx",
    "username": "username"
}
```

**Subsequent Requests**: Include the following headers:
- `x-nd-authorization: 'Bearer token'`
- `x-nd-client-unique-id: id`

### Keepalive

**Endpoint**: `GET /api/keepalive/keepalive`

---

## Endpoints

### Get Album List

**Endpoint**: `GET /api/album`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `_start` | Starting row number (0-based) |
| `_end` | Ending row number |
| `_order` | Sort order: `ASC`, `DESC` |
| `_sort` | Sort by: `random`, `createdAt`, `min_year`, `play_count`, `play_date`, `name`, `albumArtist`, `rating`. Multiple sort methods can be separated by commas, e.g., `min_year asc,date asc` |
| `artist_id` | Artist ID (optional) |
| `rating` | Rating (optional) |
| `starred` | Starred status: `true`/`false` (optional) |
| `name` | Album name (LIKE query) (optional) |

**To be supplemented**:
- How to query albums within a specific year range (min_year and max_year only support equality checks)
- How to query albums with song count greater than a certain value
- Whether multiple keywords can be used for album name filtering

**Response**:
```json
[
    {
        "playCount": 14,
        "playDate": "2024-04-18T07:37:46.658+08:00",
        "rating": 0,
        "starred": false,
        "starredAt": null,
        "id": "2e7e41725443fa5e8a637a4668e63e98",
        "name": "放下",
        "embedArtPath": "/volume1/music/胡夏/放下/胡夏-放下.flac",
        "artistId": "6d095fad618e04185bd66998450041da",
        "artist": "胡夏",
        "albumArtistId": "6d095fad618e04185bd66998450041da",
        "albumArtist": "胡夏",
        "allArtistIds": "6d095fad618e04185bd66998450041da",
        "maxYear": 2013,
        "minYear": 2013,
        "date": "2013",
        "maxOriginalYear": 0,
        "minOriginalYear": 0,
        "releases": 1,
        "compilation": false,
        "songCount": 1,
        "duration": 337.08,
        "size": 35163552,
        "genre": "",
        "genres": null,
        "fullText": " 放下 胡夏",
        "orderAlbumName": "放下",
        "orderAlbumArtistName": "胡夏",
        "paths": "/volume1/music/胡夏/放下",
        "externalInfoUpdatedAt": null,
        "createdAt": "2024-03-02T01:04:46.424670828+08:00",
        "updatedAt": "2024-03-21T20:41:28.340360006+08:00"
    }
]
```

**Response Header**: `x-total-count`: Total number of rows

### Get Album Information

**Endpoint**: `GET /api/album/[id]`

**Response**: Same structure as album list response

### Get Artist Information

**Endpoint**: `GET /api/artist/[id]`

**Response**:
```json
{
    "playCount": 42,
    "playDate": "2024-04-18T08:27:04.036+08:00",
    "rating": 0,
    "starred": false,
    "starredAt": null,
    "id": "6d095fad618e04185bd66998450041da",
    "name": "胡夏",
    "albumCount": 19,
    "songCount": 60,
    "genres": null,
    "fullText": " 胡夏",
    "orderArtistName": "胡夏",
    "size": 1714942860,
    "externalUrl": "https://www.last.fm/music/%E8%83%A1%E5%A4%8F",
    "externalInfoUpdatedAt": "0001-01-01T00:00:00Z"
}
```

### Get Artist Info (Bio & Similar Artists)

Refer to Subsonic's `getArtistInfo` interface.

### Get Artist List

**Endpoint**: `GET /api/artist`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `_start` | Starting row number (0-based) |
| `_end` | Ending row number (set both to 0 to query all) |
| `_order` | Sort order: `ASC`, `DESC` |
| `_sort` | Sort by: `random`, `play_count`, `play_date`, `name`, `rating`. Multiple sort methods can be separated by commas |
| `rating` | Rating (optional) |
| `starred` | Starred status: `true`/`false` (optional) |
| `name` | Artist name (LIKE query) (optional) |
| `role` | Role (available in version 0.55.0+, causes errors in earlier versions) |

**Response**:
```json
[
    {
        "playCount": 42,
        "playDate": "2024-04-18T08:27:04.036+08:00",
        "rating": 0,
        "starred": false,
        "starredAt": null,
        "id": "6d095fad618e04185bd66998450041da",
        "name": "胡夏",
        "albumCount": 19,
        "songCount": 60,
        "genres": null,
        "fullText": " 胡夏",
        "orderArtistName": "胡夏",
        "size": 1714942860,
        "mbzArtistId": "2ccbc670-5fe9-450a-a4ab-4d87131214b3",
        "smallImageUrl": "https://i.scdn.co/image/ab67616d0000485129c9ac0b10fb4f016de87b11",
        "mediumImageUrl": "https://i.scdn.co/image/ab67616d00001e0229c9ac0b10fb4f016de87b11",
        "largeImageUrl": "https://i.scdn.co/image/ab67616d0000b27329c9ac0b10fb4f016de87b11",
        "externalUrl": "https://www.last.fm/music/%E8%83%A1%E5%A4%8F",
        "externalInfoUpdatedAt": "2024-04-18T16:10:03.997920721+08:00"
    }
]
```

**Response Header**: `x-total-count`: Total number of rows

### Get Cover Art

Refer to Subsonic's `getCoverArt` interface.

### Create Playlist

**Endpoint**: `POST /api/playlist`

**Content-Type**: `application/json`

**Request Body**:

| Parameter | Description |
|-----------|-------------|
| `name` | Playlist name |
| `comment` | Comment |
| `public` | Whether visible to others |

**Response**:
```json
{
    "id": "775cca70-cd09-4029-9858-583098bef519"
}
```

### Delete Playlist

**Endpoint**: `DELETE /api/playlist/[id]`

**Response**: `{}`

### Get Song Information

**Endpoint**: `GET /api/song/[id]`

### Get Playlist List

**Endpoint**: `GET /api/playlist`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `_start` | Starting row number (0-based) |
| `_end` | Ending row number (set both to 0 to query all) |
| `_order` | Sort order: `ASC`, `DESC` |
| `_sort` | Sort by: `random`, `name`. Multiple sort methods can be separated by commas |

**Response**:
```json
[
    {
        "id": "355c94bd-4bef-485a-8945-d6d9d02191cd",
        "name": "1999年老歌by慕星人",
        "comment": "",
        "duration": 8280.36,
        "size": 951975104,
        "songCount": 31,
        "ownerName": "userA",
        "ownerId": "34c42e25-70f8-42d3-83ff-6442b9a341a4",
        "public": false,
        "path": "",
        "sync": false,
        "createdAt": "2024-04-09T15:28:28.917434949+08:00",
        "updatedAt": "2024-04-17T22:32:12.507824702+08:00",
        "rules": null,
        "evaluatedAt": null
    }
]
```

**Response Header**: `x-total-count`: Total number of rows

### Set Rating

Refer to Subsonic's `setRating` interface.

### Get Scan Status

Refer to Subsonic's `getScanStatus` interface.

> **Tip**: The song count obtained from this interface may not match the actual count. It's recommended to get the total song count from the response header of the song list interface.

### Scrobble

Refer to Subsonic's `scrobble` interface.

### Search (Songs/Albums/Artists)

Refer to Subsonic's `search2` interface.

### Get Similar Songs

Refer to Subsonic's `getSimilarSongs` interface.

### Get Song List

**Endpoint**: `GET /api/song`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `_start` | Starting row number (0-based) |
| `_end` | Ending row number (set both to 0 to query all artists) |
| `_order` | Sort order: `ASC`, `DESC` |
| `_sort` | Sort by: `random`, `createdAt`, `max_year`, `play_count`, `play_date`, `title`, `album`, `rating`. Multiple sort methods can be separated by commas |
| `album_id` | Album ID |
| `starred` | Starred status |
| `title` | Title |

**Response**:
```json
[
    {
        "playCount": 14,
        "playDate": "2024-04-18T07:37:46.658+08:00",
        "rating": 4,
        "starred": true,
        "starredAt": "2024-03-02T01:06:30.37479538+08:00",
        "bookmarkPosition": 0,
        "id": "be7daa6fc04bbbed2e0aaf15fc0b48df",
        "path": "/volume1/music/胡夏/放下/胡夏-放下.flac",
        "title": "放下",
        "album": "放下",
        "artistId": "6d095fad618e04185bd66998450041da",
        "artist": "胡夏",
        "albumArtistId": "6d095fad618e04185bd66998450041da",
        "albumArtist": "胡夏",
        "albumId": "2e7e41725443fa5e8a637a4668e63e98",
        "hasCoverArt": true,
        "trackNumber": 1,
        "discNumber": 0,
        "year": 2013,
        "date": "2013",
        "originalYear": 0,
        "releaseYear": 0,
        "size": 35163552,
        "suffix": "flac",
        "duration": 337.08,
        "bitRate": 822,
        "channels": 2,
        "genre": "",
        "genres": null,
        "fullText": " 放下 胡夏",
        "orderTitle": "放下",
        "orderAlbumName": "放下",
        "orderArtistName": "胡夏",
        "orderAlbumArtistName": "胡夏",
        "compilation": false,
        "lyrics": "[...]",
        "rgAlbumGain": -6.4,
        "rgAlbumPeak": 0.810242,
        "rgTrackGain": -6.4,
        "rgTrackPeak": 0.810242,
        "createdAt": "2024-03-02T01:04:46.424670828+08:00",
        "updatedAt": "2024-03-21T20:41:28.340360006+08:00"
    }
]
```

**Response Header**: `x-total-count`: Total number of rows

> **Warning**: When `_sort = createdAt`, a maximum of 50,000 records can be retrieved. Beyond this, the server will report an error.

### Get Top Songs (Artist's Popular Songs)

Refer to Subsonic's `getTopSongs` interface.

### Get Playlist Tracks

**Endpoint**: `GET /api/playlist/[id]/tracks`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `_start` | Starting row number (0-based) |
| `_end` | Ending row number (set both to 0 to query all) |
| `_order` | Sort order: `ASC`, `DESC` |
| `_sort` | Sort by: `id`, `createdAt`. Multiple sort methods can be separated by commas |
| `playlist_id` | Playlist ID |

**Response**: Similar to song list response

**Response Header**: `x-total-count`: Total number of rows

> **Tip**: The `id` is used to remove songs from the playlist, starting from 1.

### Star (Song/Album/Artist)

Refer to Subsonic's `star` interface.

### Stream (Song Playback URL)

Refer to Subsonic's `stream` interface.

### Unstar

Refer to Subsonic's `unstar` interface.

### Update Playlist

**Endpoint**: `PUT /api/playlist/[id]`

**Content-Type**: `application/json`

**Request Body**:

| Parameter | Description |
|-----------|-------------|
| `name` | Playlist name |
| `comment` | Comment |
| `public` | Whether visible to others |

### Add Tracks to Playlist

**Endpoint**: `POST /api/playlist/[id]/tracks`

**Content-Type**: `application/json`

**Request Body**:

| Parameter | Description |
|-----------|-------------|
| `ids` | List of song IDs to add, separated by commas |

### Remove Tracks from Playlist

**Endpoint**: `DELETE /api/playlist/[id]/tracks`

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `id` | Song ID to remove (multiple IDs can be sent as `id=2&id=3`) |
```