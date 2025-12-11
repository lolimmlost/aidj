export type Song = {
  id: string;
  name: string;
  title?: string; // Alternative name field from API
  albumId: string;
  album?: string; // Album name for display
  duration: number;
  track: number;
  url: string;
  artist?: string; // Optional for display
  genre?: string; // Optional genre for recommendations
};
