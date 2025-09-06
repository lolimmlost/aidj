# Technical Requirements for API Integrations

## Ollama Integration

### Overview
Ollama is a local LLM server that will be used for generating music recommendations based on user preferences and listening history.

### API Endpoints
- **Base URL:** `http://[LAN_IP]:11434/api`
- **Generate Recommendations:** `POST /generate`
  - Request body should include the model name and prompt for recommendations
  - Response includes the generated text with recommendations

### Authentication
- No authentication required for local instances
- Access controlled through local network security

### Data Format
- **Request:**
  ```json
  {
    "model": "llama3",
    "prompt": "Recommend 5 songs similar to [song_name] by [artist]",
    "stream": false
  }
  ```
- **Response:**
  ```json
  {
    "model": "llama3",
    "response": "Here are 5 songs similar to...",
    "done": true
  }
  ```

### Implementation Considerations
- Need to determine which models work best for music recommendations
- Should implement error handling for model loading issues
- Consider caching recommendations to reduce API calls

## Navidrome Integration

### Overview
Navidrome is a music streaming server that will provide access to the local music collection.

### API Endpoints
- **Base URL:** `http://[LAN_IP]:4533/api`
- **Authentication:** `POST /auth/login`
- **Get Songs:** `GET /song`
- **Get Artists:** `GET /artist`
- **Get Albums:** `GET /album`
- **Stream Song:** `GET /stream/{id}`

### Authentication
- Token-based authentication
- Login endpoint returns a token that must be included in subsequent requests
- Tokens have expiration times

### Data Format
- **Login Request:**
  ```json
  {
    "username": "user",
    "password": "password"
  }
  ```
- **Login Response:**
  ```json
  {
    "token": "auth_token",
    "sub": "user_id",
    "name": "User Name"
  }
  ```

### Implementation Considerations
- Need to handle token refresh for long sessions
- Should implement search functionality for finding music
- Consider pagination for large music collections

## Lidarr Integration

### Overview
Lidarr is a music collection manager that will handle searching for and downloading requested songs.

### API Endpoints
- **Base URL:** `http://[LAN_IP]:8686/api/v1`
- **API Key Authentication:** Header `X-Api-Key: [API_KEY]`
- **Search for Albums:** `GET /album/lookup`
- **Add Album:** `POST /album`
- **Get Album Queue:** `GET /queue`

### Authentication
- API key-based authentication
- API key configured in Lidarr settings

### Data Format
- **Search Request:**
  ```
  GET /album/lookup?term=[search_term]
  ```
- **Search Response:**
  ```json
  [
    {
      "title": "Album Name",
      "artist": {
        "artistName": "Artist Name"
      },
      "releaseDate": "2023-01-01",
      "foreignAlbumId": "album_id"
    }
  ]
  ```

### Implementation Considerations
- Need to obtain API key from Lidarr configuration
- Should implement search result filtering and ranking
- Consider handling different quality profiles for downloads

## General Integration Requirements

### Error Handling
- Implement retry mechanisms for failed API calls
- Provide user-friendly error messages
- Log errors for debugging purposes

### Security
- Store API keys and tokens securely
- Use HTTPS where possible
- Implement proper input validation

### Performance
- Implement caching for frequently accessed data
- Use asynchronous requests to prevent UI blocking
- Optimize API calls to reduce latency

### Configuration
- Allow users to configure service URLs and credentials
- Provide default ports for common setups
- Support environment variables for configuration

## Data Flow

1. User requests music recommendations through the interface
2. Application sends prompt to Ollama for recommendations
3. Application displays recommendations to user
4. User selects a song to play
5. Application retrieves song information from Navidrome
6. Application streams the song from Navidrome
7. User requests a song download
8. Application searches for the song in Lidarr
9. Application adds the song to Lidarr's download queue
10. Application monitors download progress through Lidarr API