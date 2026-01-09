"use client";

import React, { useState, useEffect, useRef, memo } from "react";
import {
  X,
  Clock,
  ExternalLink,
  Volume2,
  Maximize,
  Keyboard,
} from "lucide-react";
import { Button } from "./ui/button";

// YouTube IFrame API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface VideoPlayerProps {
  videoId: string;
  videoTitle: string;
  channelName: string;
  channelId?: string;
  channelThumbnail?: string;
  videoUrl: string;
  onClose: () => void;
  onMarkWatched?: () => void;
  onChannelClick?: (channelName: string) => void;
  quality?: "360p" | "480p" | "720p" | "1080p";
  onQualityChange?: (quality: string) => void;
  onProgress?: (progress: number, duration: number) => void;
  initialProgress?: number;
}

const VideoPlayerComponent = ({
  videoId,
  videoTitle,
  channelName,
  channelId,
  channelThumbnail,
  videoUrl,
  onClose,
  onMarkWatched,
  onChannelClick,
  quality = "720p",
  onQualityChange,
  onProgress,
  initialProgress = 0,
}: VideoPlayerProps) => {
  const [startTime, setStartTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Extract video ID from YouTube URL
  const getYouTubeVideoId = (url: string) => {
    const match =
      url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/) ||
      url.match(/^([a-zA-Z0-9_-]{11})$/);
    return match ? match[1] : videoId;
  };

  const ytVideoId = getYouTubeVideoId(videoUrl);

  // Load YouTube IFrame API
  useEffect(() => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      initializePlayer();
      return;
    }

    // Load the API
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // API calls this when ready
    window.onYouTubeIframeAPIReady = () => {
      initializePlayer();
    };

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  const initializePlayer = () => {
    if (!playerContainerRef.current) return;

    const startSeconds = initialProgress > 0 ? Math.floor(initialProgress) : 0;

    playerRef.current = new window.YT.Player(playerContainerRef.current, {
      videoId: ytVideoId,
      playerVars: {
        autoplay: 1,
        start: startSeconds,
        modestbranding: 1,
        rel: 0, // Only show related videos from same channel
        fs: 1,
        iv_load_policy: 3, // Hide video annotations
        disablekb: 0, // Enable keyboard controls (we handle them ourselves)
        playsinline: 1, // Play inline on mobile
      },
      events: {
        onReady: () => {
          setPlayerReady(true);
          onMarkWatched?.();
        },
      },
    });
  };

  useEffect(() => {
    // Convert progress percentage to seconds if initialProgress is provided
    if (initialProgress > 0) {
      setStartTime(Math.floor(initialProgress));
    }
  }, [initialProgress]);

  // Track playback progress and report to parent
  useEffect(() => {
    if (!playerReady || !playerRef.current || !onProgress) return;

    const interval = setInterval(() => {
      try {
        const player = playerRef.current;
        if (player && player.getCurrentTime && player.getDuration) {
          const currentTime = player.getCurrentTime();
          const duration = player.getDuration();
          if (duration > 0) {
            onProgress(currentTime, duration);
          }
        }
      } catch (err) {
        // Player might not be ready yet
      }
    }, 5000); // Report every 5 seconds

    return () => clearInterval(interval);
  }, [playerReady, onProgress]);

  // YouTube keyboard shortcuts - works even when iframe isn't focused
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const player = playerRef.current;

      try {
        switch (e.key.toLowerCase()) {
          case "escape":
            e.preventDefault();
            onClose();
            break;

          case " ":
          case "k":
            // Play/Pause
            e.preventDefault();
            if (player.getPlayerState() === 1) {
              player.pauseVideo();
            } else {
              player.playVideo();
            }
            break;

          case "arrowleft":
            // Seek backward 5s
            e.preventDefault();
            player.seekTo(Math.max(0, player.getCurrentTime() - 5), true);
            break;

          case "arrowright":
            // Seek forward 5s
            e.preventDefault();
            player.seekTo(
              Math.min(player.getDuration(), player.getCurrentTime() + 5),
              true
            );
            break;

          case "j":
            // Seek backward 10s
            e.preventDefault();
            player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
            break;

          case "l":
            // Seek forward 10s
            e.preventDefault();
            player.seekTo(
              Math.min(player.getDuration(), player.getCurrentTime() + 10),
              true
            );
            break;

          case "arrowup":
            // Volume up 5%
            e.preventDefault();
            player.setVolume(Math.min(100, player.getVolume() + 5));
            break;

          case "arrowdown":
            // Volume down 5%
            e.preventDefault();
            player.setVolume(Math.max(0, player.getVolume() - 5));
            break;

          case "m":
            // Mute/Unmute
            e.preventDefault();
            if (player.isMuted()) {
              player.unMute();
            } else {
              player.mute();
            }
            break;

          case "f":
            // Fullscreen
            e.preventDefault();
            try {
              const iframe = player.getIframe();
              if (iframe && iframe.requestFullscreen) {
                iframe.requestFullscreen();
              } else if (containerRef.current?.requestFullscreen) {
                // Fallback to container fullscreen
                containerRef.current.requestFullscreen();
              }
            } catch (err) {
              console.error("Fullscreen error:", err);
            }
            break;

          case "home":
            // Jump to beginning
            e.preventDefault();
            player.seekTo(0, true);
            break;

          case "end":
            // Jump to end
            e.preventDefault();
            player.seekTo(player.getDuration(), true);
            break;

          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            // Jump to 0-90% of video
            e.preventDefault();
            const percent = parseInt(e.key) / 10;
            player.seekTo(player.getDuration() * percent, true);
            break;

          case ",":
          case "<":
          case ";":
            // Decrease playback speed (< or ; depending on keyboard layout)
            e.preventDefault();
            try {
              const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
              const currentRate = player.getPlaybackRate();
              let currentIndex = rates.findIndex(
                (r) => Math.abs(r - currentRate) < 0.01
              );
              if (currentIndex === -1) currentIndex = rates.indexOf(1);
              if (currentIndex > 0) {
                player.setPlaybackRate(rates[currentIndex - 1]);
              }
            } catch (err) {
              console.error("Error changing playback speed:", err);
            }
            break;

          case ".":
          case ">":
          case ":":
            // Increase playback speed (> or : depending on keyboard layout)
            e.preventDefault();
            try {
              const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
              const currentRate = player.getPlaybackRate();
              let currentIndex = rates.findIndex(
                (r) => Math.abs(r - currentRate) < 0.01
              );
              if (currentIndex === -1) currentIndex = rates.indexOf(1);
              if (currentIndex < rates.length - 1) {
                player.setPlaybackRate(rates[currentIndex + 1]);
              }
            } catch (err) {
              console.error("Error changing playback speed:", err);
            }
            break;

          case "c":
            // Toggle captions
            e.preventDefault();
            const options = player.getOptions();
            if (options && options.includes("cc")) {
              const currentModule = player.getOption("cc", "track");
              if (currentModule && currentModule.displayName) {
                player.unloadModule("cc");
              } else {
                player.loadModule("cc");
              }
            }
            break;
        }
      } catch (err) {
        console.error("Error handling keyboard shortcut:", err);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, playerReady]);

  // Close shortcuts dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showShortcuts &&
        shortcutsRef.current &&
        !shortcutsRef.current.contains(e.target as Node)
      ) {
        setShowShortcuts(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShortcuts]);

  // Track fullscreen state and auto-hide cursor on macOS
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFS);
      
      // Add/remove global style to hide cursor in fullscreen
      if (isFS) {
        // Add style to body and fullscreen element
        document.body.style.cursor = 'none';
        const styleId = 'fullscreen-cursor-hide';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            :fullscreen, :-webkit-full-screen, :-moz-full-screen, :-ms-fullscreen {
              cursor: none !important;
            }
            :fullscreen *, :-webkit-full-screen *, :-moz-full-screen *, :-ms-fullscreen * {
              cursor: none !important;
            }
          `;
          document.head.appendChild(style);
        }
      } else {
        // Remove cursor hiding
        document.body.style.cursor = '';
        const styleElement = document.getElementById('fullscreen-cursor-hide');
        if (styleElement) {
          styleElement.remove();
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      
      // Cleanup
      document.body.style.cursor = '';
      const styleElement = document.getElementById('fullscreen-cursor-hide');
      if (styleElement) {
        styleElement.remove();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col"
      style={isFullscreen ? { cursor: 'none' } : undefined}
    >
      {/* Header */}
      <div className="border-b border-white/10 bg-gradient-to-b from-black via-black to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 line-clamp-2">
                {videoTitle}
              </h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Keyboard Shortcuts */}
              <div className="relative" ref={shortcutsRef}>
                <button
                  onClick={() => setShowShortcuts(!showShortcuts)}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Keyboard shortcuts"
                >
                  <Keyboard className="w-5 h-5" />
                </button>

                {showShortcuts && (
                  <div className="absolute right-0 mt-2 w-96 bg-gray-900 border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        <Keyboard className="w-4 h-4" />
                        Keyboard Shortcuts
                      </h3>
                    </div>
                    <div className="p-4 max-h-96 overflow-y-auto">
                      <div className="space-y-4">
                        {/* Playback */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                            Playback
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">Play/Pause</span>
                              <div className="flex gap-1">
                                <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                  Space
                                </kbd>
                                <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                  K
                                </kbd>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">Mute/Unmute</span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                M
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Increase speed
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                Shift + &gt;
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Decrease speed
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                Shift + &lt;
                              </kbd>
                            </div>
                          </div>
                        </div>

                        {/* Seeking */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                            Seeking
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Forward 5 seconds
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                →
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Backward 5 seconds
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                ←
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Forward 10 seconds
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                L
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Backward 10 seconds
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                J
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Jump to beginning
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                Home
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">Jump to end</span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                End
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">Jump to %</span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                0-9
                              </kbd>
                            </div>
                          </div>
                        </div>

                        {/* Volume */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                            Volume
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Increase volume
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                ↑
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Decrease volume
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                ↓
                              </kbd>
                            </div>
                          </div>
                        </div>

                        {/* Display */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                            Display
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">Fullscreen</span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                F
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Toggle captions
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                C
                              </kbd>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">
                                Close player
                              </span>
                              <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">
                                Esc
                              </kbd>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Open on YouTube"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Close player (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-4 py-6 overflow-hidden">
        <div className="w-full h-full max-w-7xl relative rounded-xl overflow-hidden shadow-2xl">
          {/* YouTube IFrame API player */}
          <div ref={playerContainerRef} className="w-full h-full" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 bg-gradient-to-t from-black via-black to-transparent px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            {/* Channel Info */}
            <button
              onClick={() => {
                onChannelClick?.(channelName);
                onClose();
              }}
              className="flex items-center gap-3 hover:bg-white/10 rounded-lg p-2 -m-2 transition-colors group cursor-pointer"
            >
              {channelThumbnail ? (
                <img
                  src={channelThumbnail}
                  alt={channelName}
                  className="w-10 h-10 rounded-full ring-2 ring-white/10 group-hover:ring-white/30 transition-all"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center ring-2 ring-white/10 group-hover:ring-white/30 transition-all">
                  <span className="text-white font-semibold text-sm">
                    {channelName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex flex-col items-start">
                <span className="text-white font-medium group-hover:text-gray-100 transition-colors">
                  {channelName}
                </span>
                <span className="text-xs text-gray-500">
                  Click to view channel videos
                </span>
              </div>
            </button>

            {/* Auto-watched indicator */}
            <span className="text-xs text-gray-500">
              Auto-marked as watched
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders that cause iframe stuttering
export const VideoPlayer = memo(
  VideoPlayerComponent,
  (prevProps, nextProps) => {
    // Only re-render if videoId changes
    return prevProps.videoId === nextProps.videoId;
  }
);
