import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Gauge,
  ExternalLink,
  Music,
  Video,
  Loader2,
  AlertCircle,
  FileAudio,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { mediaExternalUrl, mediaStreamUrl, isRemoteGateway } from '@/lib/media'

interface MediaViewerProps {
  filePath: string
  mediaType: 'audio' | 'video'
  onOpenExternal?: () => void
  ingestResultId?: string
  ingestStatus?: 'idle' | 'queued' | 'parsing' | 'parsed' | 'failed'
}

type IngestStatus = 'idle' | 'processing' | 'completed' | 'failed'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function MediaViewer({ filePath, mediaType, onOpenExternal, ingestResultId, ingestStatus: externalIngestStatus }: MediaViewerProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [fileSize, setFileSize] = useState<number>(0)
  const [ingestStatus, setIngestStatus] = useState<IngestStatus>('idle')
  const mediaRef = useRef<HTMLMediaElement>(null)

  const fileName = getFileName(filePath)
  const MediaIcon = mediaType === 'video' ? Video : Music

  useEffect(() => {
    let cancelled = false

    async function loadMedia() {
      setLoading(true)
      setError(null)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)

      try {
        const url = isRemoteGateway() ? mediaExternalUrl(filePath) : mediaStreamUrl(filePath)

        if (!cancelled) {
          setDataUrl(url)
          try {
            const stat = await (window as any).hermesDesktop?.stat?.(filePath)
            if (stat?.size) setFileSize(stat.size)
          } catch {
            setFileSize(0)
          }
          setIngestStatus('idle')
        }
      } catch {
        if (!cancelled) {
          setError('无法加载媒体文件')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadMedia()

    return () => {
      cancelled = true
    }
  }, [filePath])

  useEffect(() => {
    if (externalIngestStatus === 'queued' || externalIngestStatus === 'parsing') setIngestStatus('processing')
    else if (externalIngestStatus === 'parsed') setIngestStatus('completed')
    else if (externalIngestStatus === 'failed') setIngestStatus('failed')
    else setIngestStatus('idle')
  }, [externalIngestStatus])

  const handleTimeUpdate = useCallback(() => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration)
    }
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (mediaRef.current) {
      mediaRef.current.currentTime = 0
    }
  }, [])

  const togglePlay = useCallback(() => {
    if (!mediaRef.current) return
    if (isPlaying) {
      mediaRef.current.pause()
    } else {
      void mediaRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    if (mediaRef.current) {
      mediaRef.current.currentTime = time
    }
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value)
    setVolume(vol)
    setIsMuted(vol === 0)
    if (mediaRef.current) {
      mediaRef.current.volume = vol
      mediaRef.current.muted = vol === 0
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (!mediaRef.current) return
    const newMuted = !isMuted
    setIsMuted(newMuted)
    mediaRef.current.muted = newMuted
  }, [isMuted])

  const handlePlaybackRateChange = useCallback(() => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate)
    const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length
    const nextRate = PLAYBACK_RATES[nextIndex]
    setPlaybackRate(nextRate)
    if (mediaRef.current) {
      mediaRef.current.playbackRate = nextRate
    }
  }, [playbackRate])

  const handleSkipBack = useCallback(() => {
    if (!mediaRef.current) return
    const newTime = Math.max(0, mediaRef.current.currentTime - 10)
    mediaRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }, [])

  const handleSkipForward = useCallback(() => {
    if (!mediaRef.current) return
    const newTime = Math.min(duration, mediaRef.current.currentTime + 10)
    mediaRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  const handleOpenExternal = useCallback(() => {
    if (onOpenExternal) {
      onOpenExternal()
      return
    }
    const normalized = filePath.replace(/\\/g, '/')
    const fileUrl = `file:///${normalized.replace(/^\//, '')}`
    void window.hermesDesktop?.openExternal?.(fileUrl)
  }, [filePath, onOpenExternal])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const ingestStatusConfig = {
    idle: { label: '', color: '', icon: null },
    processing: { label: '语音转写中...', color: 'text-blue-400', icon: RefreshCw },
    completed: { label: '转写完成', color: 'text-green-400', icon: CheckCircle2 },
    failed: { label: '转写失败', color: 'text-red-400', icon: AlertCircle }
  }

  const currentIngestStatus = ingestStatusConfig[ingestStatus]
  const StatusIcon = currentIngestStatus.icon

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <MediaIcon className="size-4 text-(--ui-text-secondary)" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 text-(--ui-text-quaternary)">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <MediaIcon className="size-4 text-(--ui-text-secondary)" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-(--ui-text-quaternary)">
          <AlertCircle className="size-12 text-red-400" />
          <span className="text-sm">{error}</span>
          <Button onClick={handleOpenExternal} size="sm" variant="secondary">
            <ExternalLink className="size-3.5" />
            尝试用外部程序打开
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-(--ui-editor-surface-background)">
      <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MediaIcon className="size-4 text-(--ui-text-secondary)" />
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">{fileName}</span>
              <span className="text-[11px] text-(--ui-text-quaternary)">
                {duration > 0 && `${formatTime(duration)} | `}
                {formatFileSize(fileSize)}
              </span>
            </div>
          </div>

          {ingestResultId && StatusIcon && (
            <div className={`flex items-center gap-1 rounded-full bg-(--ui-surface-tertiary) px-2 py-0.5 ${currentIngestStatus.color}`}>
              <StatusIcon className={`size-3 ${ingestStatus === 'processing' ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">{currentIngestStatus.label}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <Button onClick={handleOpenExternal} size="icon-xs" title="外部打开" variant="ghost">
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black p-4">
        {dataUrl && mediaType === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            className="max-h-full max-w-full rounded-lg shadow-lg"
            src={dataUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
        ) : dataUrl && mediaType === 'audio' ? (
          <div className="flex flex-col items-center gap-6">
            <div className="flex size-48 items-center justify-center rounded-full bg-(--ui-surface-secondary)">
              <FileAudio size={72} className="text-(--ui-text-quaternary)" />
            </div>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={dataUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="w-12 text-xs text-(--ui-text-quaternary)">{formatTime(currentTime)}</span>
          <div className="relative flex-1">
            <div className="h-1 rounded-full bg-(--ui-surface-tertiary)">
              <div
                className="h-full rounded-full bg-(--ui-text-secondary)"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <span className="w-12 text-right text-xs text-(--ui-text-quaternary)">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <Button onClick={handleSkipBack} size="icon-xs" variant="ghost" title="后退10秒">
              <SkipBack size={16} />
            </Button>
            <Button onClick={togglePlay} size="icon-sm" variant="secondary" title={isPlaying ? '暂停' : '播放'}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </Button>
            <Button onClick={handleSkipForward} size="icon-xs" variant="ghost" title="前进10秒">
              <SkipForward size={16} />
            </Button>
            <Button onClick={handlePlaybackRateChange} size="xs" variant="ghost" title="播放速度" className="gap-1">
              <Gauge size={12} />
              <span className="text-[11px] font-medium">{playbackRate}x</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={toggleMute} size="icon-xs" variant="ghost" title={isMuted ? '取消静音' : '静音'}>
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
            <div className="relative w-24">
              <div className="h-1 rounded-full bg-(--ui-surface-tertiary)">
                <div
                  className="h-full rounded-full bg-(--ui-text-secondary)"
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
