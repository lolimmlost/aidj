import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { EnrichedArtistMetadata } from '@/lib/services/aurral';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Globe,
  Calendar,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArtistMetadataHeroProps {
  metadata: EnrichedArtistMetadata;
  artistImageUrl?: string;
}

/** Country code to flag emoji */
function countryFlag(code: string): string {
  if (code.length !== 2) return code;
  const chars = [...code.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  );
  return chars.join('');
}

/** Extract a readable bio string from the bio object */
function extractBio(bio: Record<string, unknown> | null): string | null {
  if (!bio) return null;
  // Aurral stores bio as { content: string } or { summary: string } or plain text keyed by language
  if (typeof bio.content === 'string') return bio.content;
  if (typeof bio.summary === 'string') return bio.summary;
  if (typeof bio.en === 'string') return bio.en;
  // Try first string value
  for (const val of Object.values(bio)) {
    if (typeof val === 'string' && val.length > 20) return val;
  }
  return null;
}

/** Get icon for social link type */
function getLinkIcon(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes('wiki')) return '📖';
  if (lower.includes('discogs')) return '💿';
  if (lower.includes('allmusic')) return '🎵';
  if (lower.includes('bandcamp')) return '🎸';
  if (lower.includes('soundcloud')) return '🔊';
  if (lower.includes('youtube')) return '▶️';
  if (lower.includes('spotify')) return '🎧';
  if (lower.includes('twitter') || lower.includes('x.com')) return '🐦';
  if (lower.includes('instagram')) return '📷';
  if (lower.includes('facebook')) return '👥';
  if (lower.includes('official') || lower.includes('homepage')) return '🌐';
  return '🔗';
}

export function ArtistMetadataHero({ metadata, artistImageUrl }: ArtistMetadataHeroProps) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const bio = extractBio(metadata.bio);
  const topTags = metadata.tags?.slice(0, 8) ?? [];
  const topGenres = metadata.genres?.slice(0, 5) ?? [];
  const socialLinks = metadata.relations?.filter((r) => r.url) ?? [];

  return (
    <div className="space-y-4">
      {/* Hero card with gradient background */}
      <div className="relative rounded-xl overflow-hidden border bg-card">
        {/* Background image with overlay */}
        {(metadata.coverImageUrl || artistImageUrl) && (
          <div className="absolute inset-0">
            <img
              src={metadata.coverImageUrl || artistImageUrl}
              alt=""
              className="w-full h-full object-cover opacity-15 blur-sm"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/40" />
          </div>
        )}

        <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Artist image */}
          {(metadata.coverImageUrl || artistImageUrl) && (
            <div className="flex-shrink-0">
              <img
                src={metadata.coverImageUrl || artistImageUrl}
                alt={metadata.artistName}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover shadow-lg"
              />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Type & Country */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {metadata.artistType && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {metadata.artistType}
                </span>
              )}
              {metadata.country && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  {countryFlag(metadata.country)} {metadata.country}
                </span>
              )}
              {metadata.formedYear && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {metadata.formedYear}{metadata.ended ? ' (disbanded)' : ''}
                </span>
              )}
            </div>

            {metadata.disambiguation && (
              <p className="text-sm text-muted-foreground italic">
                {metadata.disambiguation}
              </p>
            )}

            {/* Genre badges */}
            {topGenres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topGenres.map((genre) => (
                  <Badge
                    key={genre}
                    variant="secondary"
                    className="text-xs bg-primary/10 text-primary border-0"
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag badges */}
            {topTags.length > 0 && topGenres.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topTags.map((tag) => (
                  <Badge
                    key={tag.name}
                    variant="outline"
                    className="text-xs"
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Bio */}
            {bio && (
              <div>
                <p
                  className={cn(
                    'text-sm text-muted-foreground leading-relaxed',
                    !bioExpanded && 'line-clamp-3'
                  )}
                >
                  {bio}
                </p>
                {bio.length > 200 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 mt-1 text-xs text-primary hover:text-primary/80"
                    onClick={() => setBioExpanded(!bioExpanded)}
                  >
                    {bioExpanded ? (
                      <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
                    ) : (
                      <>Read more <ChevronDown className="h-3 w-3 ml-1" /></>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Social links */}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {socialLinks.slice(0, 5).map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>{getLinkIcon(link.type)}</span>
                    <span className="capitalize">{link.type.replace(/-/g, ' ')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Similar Artists */}
      {metadata.similarArtists && metadata.similarArtists.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Music className="h-4 w-4" />
            Similar Artists
          </h3>
          <div className="flex flex-wrap gap-2">
            {metadata.similarArtists.slice(0, 8).map((similar) => (
              <Badge
                key={similar.mbid || similar.name}
                variant="outline"
                className="cursor-default text-xs hover:bg-accent transition-colors"
              >
                {similar.name}
                {similar.score > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    {Math.round(similar.score)}%
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
