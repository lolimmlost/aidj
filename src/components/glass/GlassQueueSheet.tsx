import { memo, useCallback, type ComponentType } from 'react';
import { useBeat } from '@/components/glass/beat-sync';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DndContext, closestCenter, type DragEndEvent, type SensorDescriptor, type SensorOptions } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Radio, RotateCcw, Shuffle, Sparkles, SkipForward, ThumbsDown, ThumbsUp, User, X } from 'lucide-react';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { Waveform } from '@/components/glass/Waveform';
import { useGlassSheetFlag, useSheetDrag } from '@/components/glass/GlassSheet';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types/song';
import type { UserQueued } from '@/lib/stores/audio';
import { queueSourceOf, type QueueSourceInfo } from '@/components/glass/queue-source';

type Feedback = 'thumbs_up' | 'thumbs_down' | null;

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

interface RowProps {
  song: Song;
  sortableId: string;
  actualIndex: number;
  auto: 'ai' | 'autoplay' | null;
  src: QueueSourceInfo | null;
  reason?: string;
  feedback: Feedback;
  onPlay: (index: number) => void;
  onRemove: (index: number) => void;
  onFeedback: (songId: string, title: string, artist: string, type: 'thumbs_up' | 'thumbs_down') => void;
  onSkipAutoplay?: (songId: string) => void;
}

const QueueRow = memo(function QueueRow({ song, sortableId, actualIndex, auto, src, reason, feedback, onPlay, onRemove, onFeedback, onSkipAutoplay }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const title = song.title || song.name || 'Unknown';
  const artist = song.artist || 'Unknown artist';
  const cover = song.albumId ? getCoverArtUrl(song.albumId, 96) : null;
  const iconBtn = 'grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground [-webkit-tap-highlight-color:transparent] active:bg-foreground/10';
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Entry highlight: a soft tint in the source's colour.
        ...(src ? { backgroundColor: `oklch(from ${src.color} l c h / 0.14)` } : {}),
      }}
      className={cn('my-0.5 flex min-h-[60px] items-center gap-2 rounded-xl pl-2', isDragging && 'relative z-10 rounded-xl bg-background/80 shadow-xl')}
    >
      <button
        type="button"
        onClick={() => onPlay(actualIndex)}
        className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left [-webkit-tap-highlight-color:transparent]"
        aria-label={`Play ${title} by ${artist}${src ? `, ${src.source === 'you' ? 'added by you' : `from ${src.label}`}` : ''}`}
      >
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="size-11 shrink-0 rounded-md bg-muted object-cover" />
        ) : (
          <span className="size-11 shrink-0 rounded-md bg-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-[13px] text-muted-foreground" title={reason}>
            {src && (
              <span className="mr-1 inline-flex items-center gap-0.5 font-medium" style={{ color: src.color }}>
                <SourceIcon src={src} /> {src.label} ·
              </span>
            )}
            {artist}
            {song.duration ? ` · ${fmt(song.duration)}` : ''}
          </span>
        </span>
      </button>
      {auto ? (
        <>
          <button
            type="button"
            aria-label={feedback === 'thumbs_up' ? 'Marked as a good pick' : 'Good pick'}
            aria-pressed={feedback === 'thumbs_up'}
            onClick={() => onFeedback(song.id, title, artist, 'thumbs_up')}
            className={cn(iconBtn, feedback === 'thumbs_up' && 'text-success')}
          >
            <ThumbsUp className={cn('size-4', feedback === 'thumbs_up' && 'fill-current')} />
          </button>
          <button
            type="button"
            aria-label={feedback === 'thumbs_down' ? 'Marked as a bad suggestion' : 'Bad suggestion'}
            aria-pressed={feedback === 'thumbs_down'}
            onClick={() => onFeedback(song.id, title, artist, 'thumbs_down')}
            className={cn(iconBtn, feedback === 'thumbs_down' && 'text-destructive')}
          >
            <ThumbsDown className={cn('size-4', feedback === 'thumbs_down' && 'fill-current')} />
          </button>
          {auto === 'autoplay' && onSkipAutoplay && (
            <button type="button" aria-label="Skip this autoplay pick" onClick={() => onSkipAutoplay(song.id)} className={iconBtn}>
              <SkipForward className="size-4" />
            </button>
          )}
        </>
      ) : (
        <button type="button" aria-label={`Remove ${title} from the queue`} onClick={() => onRemove(actualIndex)} className={iconBtn}>
          <X className="size-4" />
        </button>
      )}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        data-grip
        aria-label={`Reorder ${title}`}
        className="grid h-11 w-7 shrink-0 touch-none place-items-center text-foreground/35 [-webkit-tap-highlight-color:transparent]"
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
});

function SourceIcon({ src }: { src: QueueSourceInfo }) {
  const Icon = src.source === 'you' ? User : src.source === 'radio' ? Radio : Sparkles;
  return <Icon className="size-3" />;
}

function Action({ icon: Icon, label, onClick, active, disabled, tone }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="flex flex-col items-center gap-1 rounded-2xl py-1 [-webkit-tap-highlight-color:transparent] active:bg-foreground/5 disabled:opacity-35"
    >
      <span className={cn('grid size-11 place-items-center rounded-full', active ? 'bg-primary/20 text-primary' : cn('glass-flat', tone))}>
        <Icon className="size-[18px]" />
      </span>
      <span className={cn('text-[11px] font-medium leading-tight', active ? 'text-primary' : 'text-muted-foreground')}>{label}</span>
    </button>
  );
}

export interface GlassQueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSong: Song | null;
  upcoming: Song[];
  currentSongIndex: number;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (e: DragEndEvent) => void;
  onPlay: (index: number) => void;
  onRemove: (index: number) => void;
  aiIds: Set<string>;
  autoplayIds: Set<string>;
  userIds: Record<string, UserQueued>;
  radio: boolean;
  reasons: Record<string, string>;
  getFeedback: (songId: string) => Feedback;
  onFeedback: RowProps['onFeedback'];
  onSkipAutoplay: (songId: string) => void;
  onClear: () => void;
  undoRemainingMs: number | null;
  onUndoClear: () => void;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  onMoreLikeThis: () => void;
  onSave: () => void;
  onSaveRadio?: () => void;
}

/**
 * Glass UI (phones): the queue as a bottom sheet (canvas "Queue — glass
 * draft"). Same data and actions as QueuePanel: now playing, the upcoming
 * songs in order (drag the grip to reorder, × removes, AI DJ / Autoplay picks
 * get 👍 / 👎 and skip), Clear with undo, Shuffle, More like this, Save, Save
 * radio. QueuePanel owns the state and handlers and passes them in.
 */
export function GlassQueueSheet(p: GlassQueueSheetProps) {
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  // The rainbow laps every 2 bars and the ● pulses per beat, accented on the bar — on the real downbeat
  // when the Lab has analysed the song, else at the tagged tempo.
  const beat = useBeat(p.currentSong, isPlaying);
  const cover = p.currentSong?.albumId ? getCoverArtUrl(p.currentSong.albumId, 96) : null;
  const chip = 'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold [-webkit-tap-highlight-color:transparent]';
  const autoCount = p.upcoming.filter((s) => p.aiIds.has(s.id) || p.autoplayIds.has(s.id)).length;
  const sources = { userIds: p.userIds, aiIds: p.aiIds, autoplayIds: p.autoplayIds, radio: p.radio };
  const nowSrc = p.currentSong ? queueSourceOf(p.currentSong.id, sources) : null;
  const { onOpenChange } = p;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { sheetRef, listRef, headerHandlers } = useSheetDrag(close);

  // Lets the full-screen player recede behind the sheet (styles.css).
  useGlassSheetFlag(p.open);

  return (
    <DialogPrimitive.Root open={p.open} onOpenChange={p.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="glass-sheet-overlay fixed inset-0 z-[70] bg-black/50" />
        <DialogPrimitive.Content
          ref={sheetRef}
          className={cn(
            'glass-sheet glass-surface fixed inset-x-2 bottom-2 top-[calc(env(safe-area-inset-top)+3rem)] z-[71] flex flex-col rounded-[26px] px-4 pt-2',
            'bg-background/85 dark:bg-[rgb(22_20_32/0.88)]',
          )}
        >
          {/* Drag zone: grabber + title row + now-playing card. */}
          <div className="-mx-4 -mt-2 shrink-0 touch-none px-4 select-none" {...headerHandlers}>
          <button
            type="button"
            data-grabber
            // Pointer taps close through the drag handler (pointer capture
            // moves the click to the header); this is for keyboard / VoiceOver.
            onClick={(e) => { if (e.detail === 0) close(); }}
            aria-label="Close the queue"
            className="flex h-6 w-full items-center justify-center [-webkit-tap-highlight-color:transparent]"
          >
            <span aria-hidden className="block h-1.5 w-10 rounded-full bg-foreground/30" />
          </button>
          <div className="flex items-center justify-between gap-2">
            <DialogPrimitive.Title className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.03em]">Queue</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {p.upcoming.length} songs up next{autoCount ? `, ${autoCount} picked by AI DJ or Autoplay` : ''}
            </DialogPrimitive.Description>
            <div className="flex items-center gap-1.5">
              {p.undoRemainingMs !== null && p.undoRemainingMs > 0 ? (
                <button type="button" onClick={p.onUndoClear} className={cn(chip, 'glass-flat h-8 text-info')}>
                  <RotateCcw className="size-3.5" /> Undo
                  <span className="font-mono text-[11px] opacity-70">
                    {p.undoRemainingMs >= 60000 ? `${Math.floor(p.undoRemainingMs / 60000)}m` : `${Math.floor(p.undoRemainingMs / 1000)}s`}
                  </span>
                </button>
              ) : (
                p.upcoming.length > 0 && (
                  <button type="button" onClick={p.onClear} className={cn(chip, 'glass-flat h-8')}>
                    Clear
                  </button>
                )
              )}
              <DialogPrimitive.Close aria-label="Close the queue" className="grid size-9 place-items-center rounded-full text-muted-foreground">
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {p.currentSong && (
            <div
              className="glass-surface rainbow-border mt-3 flex shrink-0 flex-col gap-2 rounded-2xl px-3 py-2.5"
              data-playing={isPlaying ? '' : undefined}
              style={nowSrc ? { backgroundImage: `linear-gradient(oklch(from ${nowSrc.color} l c h / 0.14), oklch(from ${nowSrc.color} l c h / 0.14))` } : undefined}
            >
              <span aria-hidden key={beat?.key} className="rainbow-ring" style={beat?.loop(8)} />
              <div className="flex items-center gap-3">
                {cover ? <img src={cover} alt="" className="size-11 rounded-md bg-muted object-cover" /> : <span className="size-11 rounded-md bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em]">
                    <span className="text-success">
                      <span key={beat?.key} className="beat-dot inline-block" data-beat={beat ? '' : undefined} style={beat?.loop(4)}>●</span> NOW PLAYING
                    </span>
                    {beat && <span className="text-muted-foreground">· {Math.round(beat.bpm)} BPM{beat.onGrid ? ' · ON GRID' : ''}</span>}
                    {nowSrc && (
                      <span className="inline-flex items-center gap-0.5 uppercase" style={{ color: nowSrc.color }}>
                        · <SourceIcon src={nowSrc} /> {nowSrc.label}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[15px] font-semibold text-primary">{p.currentSong.title || p.currentSong.name}</div>
                  <div className="truncate text-[13px] text-muted-foreground">{p.currentSong.artist}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{fmt(currentTime || 0)}</span>
                <Waveform seed={p.currentSong.id} current={currentTime || 0} duration={duration || 0} className="h-4 flex-1" label="Position" disabled />
                <span className="w-9 font-mono text-[10px] text-muted-foreground">-{fmt(Math.max(0, (duration || 0) - (currentTime || 0)))}</span>
              </div>
            </div>
          )}
          </div>

          <div className="mt-4 flex shrink-0 items-baseline justify-between">
            <h2 className="font-display text-[17px] font-bold">Next up</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground [&_label]:text-muted-foreground">
              <span className="font-mono text-[10px] tracking-[0.1em]">{p.upcoming.length} SONGS</span>
              <AIDJToggle compact />
            </div>
          </div>

          <div ref={listRef} className="-mx-1 mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            {p.upcoming.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing queued. Add songs with ⋯ → Play next or Add to queue.</p>
            ) : (
              <DndContext sensors={p.sensors} collisionDetection={closestCenter} onDragEnd={p.onDragEnd}>
                <SortableContext items={p.upcoming.map((s, i) => `${s.id}-${i}`)} strategy={verticalListSortingStrategy}>
                  {p.upcoming.map((song, index) => {
                    const actualIndex = p.currentSongIndex === -1 ? index : p.currentSongIndex + 1 + index;
                    const src = queueSourceOf(song.id, sources);
                    const auto = src?.source === 'autoplay' ? 'autoplay' : src?.source === 'ai' ? 'ai' : null;
                    return (
                      <QueueRow
                        key={`${song.id}-${index}`}
                        sortableId={`${song.id}-${index}`}
                        song={song}
                        actualIndex={actualIndex}
                        auto={auto}
                        src={src}
                        reason={auto === 'ai' ? p.reasons[song.id] : undefined}
                        feedback={auto ? p.getFeedback(song.id) : null}
                        onPlay={p.onPlay}
                        onRemove={p.onRemove}
                        onFeedback={p.onFeedback}
                        onSkipAutoplay={p.onSkipAutoplay}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Actions: a grid, not a scroller, so they're all in view and
              there's room for more (a fifth tile wraps to a second row). */}
          <div className="-mx-4 grid shrink-0 grid-cols-4 gap-1 border-t border-foreground/10 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5">
            <Action icon={Shuffle} label={p.isShuffled ? 'Shuffled' : 'Shuffle'} active={p.isShuffled} onClick={p.onToggleShuffle} />
            <Action icon={Sparkles} label="More like this" onClick={p.onMoreLikeThis} disabled={!p.currentSong} />
            <Action icon={Plus} label="Save playlist" onClick={p.onSave} disabled={!p.currentSong && p.upcoming.length === 0} />
            {p.onSaveRadio && <Action icon={Radio} label="Save radio" onClick={p.onSaveRadio} tone="text-warning" />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
