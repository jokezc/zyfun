import { language } from './static';

// 分辨率高度 → 清晰度标签
export function qualityLabel(height: number): string {
  if (height >= 4320) return '8K';
  if (height >= 2160) return '4K';
  if (height >= 1440) return '2K';
  if (height >= 1080) return '1080P';
  if (height >= 720) return '720P';
  if (height >= 480) return '480P';
  if (height >= 360) return '360P';
  return height > 0 ? `${height}P` : '';
}

// Mbps 数值 → 展示文本
export function formatBitrate(mbps: number): string {
  if (!Number.isFinite(mbps) || mbps <= 0) return '';
  return `${mbps >= 10 ? Math.round(mbps) : mbps.toFixed(1)}Mbps`;
}

// 宽高 → "1920×1080" 展示文本
export function formatResolution(width: number, height: number): string {
  if (!width || !height) return '';
  return `${width}×${height}`;
}

// 当前播放位置前方的缓冲秒数（卡顿时看这个）
export function bufferedAhead(video: HTMLVideoElement | undefined | null): number {
  try {
    if (!video?.buffered?.length) return 0;
    const t = video.currentTime;
    for (let i = 0; i < video.buffered.length; i++) {
      if (t >= video.buffered.start(i) && t <= video.buffered.end(i)) {
        return video.buffered.end(i) - t;
      }
    }
  } catch {}
  return 0;
}

// xgplayer hls/flv 插件 getStats() 关心的字段（kbps 计）
export interface IStreamStats {
  bitrate?: number;
  downloadSpeed?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
}

// 媒体信息徽标展示配置（与 ISetting['mediaInfo'] 一致，此处独立定义避免 shared 依赖）
export interface IMediaInfoConfig {
  position: 'topLeft' | 'controls';
  quality: boolean;
  resolution: boolean;
  bitrate: boolean;
  buffer: boolean;
  fps: boolean;
  codec: boolean;
}

export const defaultMediaInfoConfig: IMediaInfoConfig = {
  position: 'topLeft',
  quality: true,
  resolution: true,
  bitrate: true,
  buffer: true,
  fps: false,
  codec: false,
};

// 帧率估算：requestVideoFrameCallback 计数，不支持时返回停止函数且不产出数据
export function startFpsEstimate(video: HTMLVideoElement, onFps: (fps: number) => void): () => void {
  type RVFCVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, metadata: { presentedFrames: number }) => void) => number;
  };
  const target = video as RVFCVideo;
  if (typeof target.requestVideoFrameCallback !== 'function') return () => {};

  let stopped = false;
  let lastNow = 0;
  let lastFrames = 0;
  let accFrames = 0;
  let accStart = 0;

  const loop = (now: number, metadata: { presentedFrames: number }) => {
    if (stopped) return;
    if (lastNow) {
      accFrames += metadata.presentedFrames - lastFrames;
      const dt = (now - accStart) / 1000;
      // 满 1s 窗口结算一次，帧率取整
      if (dt >= 1) {
        onFps(accFrames > 0 ? Math.round(accFrames / dt) : 0);
        accFrames = 0;
        accStart = now;
      }
    } else {
      accStart = now;
    }
    lastNow = now;
    lastFrames = metadata.presentedFrames;
    target.requestVideoFrameCallback?.(loop);
  };

  target.requestVideoFrameCallback(loop);
  return () => {
    stopped = true;
  };
}

// 缓冲文本（带 i18n 前缀）
export function formatBuffer(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const prefix = language().startsWith('zh') ? '缓冲' : 'Buf ';
  return `${prefix}${seconds.toFixed(1)}s`;
}
