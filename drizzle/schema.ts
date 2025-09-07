// Minimal placeholder schema to satisfy drizzle-kit without the drizzle-orm dependency.
// Replace with a real drizzle-orm based schema when dependencies are installed.

export const config = {
  name: "config",
  columns: {
    id: { name: "id", type: "boolean", primaryKey: true },
    ollama_url: { name: "ollama_url", type: "text" },
    navidrome_url: { name: "navidrome_url", type: "text" },
    lidarr_url: { name: "lidarr_url", type: "text" },
  },
};

export default config;