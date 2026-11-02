import { Plugin } from 'xgplayer';

import { usePlayerStore } from '@/store';

import type { IMediaInfoConfig, IStreamStats } from '../../../utils/mediaInfo';
import {
  bufferedAhead,
  defaultMediaInfoConfig,
  formatBitrate,
  formatBuffer,
  formatResolution,
  qualityLabel,
  startFpsEstimate,
} from '../../../utils/mediaInfo';

const { POSITIONS } = Plugin;

// 从 hls/flv/mp4 流插件取统计信息（kbps 计）
function getStreamStats(player: any): (IStreamStats & { fps?: number }) | null {
  for (const name of ['hls', 'flv', 'mp4plugin']) {
    const plugin = player.getPlugin?.(name) ?? player.plugins?.[name];
    const stats = plugin?.getStats?.();
    if (stats) return stats as IStreamStats & { fps?: number };
  }
  return null;
}

export default class MediaInfoIcon extends Plugin {
  static get pluginName() {
    return 'mediaInfo';
  }

  static get defaultConfig() {
    return {
      position: POSITIONS.CONTROLS_RIGHT,
      index: 50,
    };
  }

  private refreshTimer: number | null = null;
  private stopFps: (() => void) | null = null;
  private fps = 0;
  private $topOverlay: HTMLElement | null = null;

  // 读展示配置，缺失字段回退默认值（兼容旧存储）
  private getConfig(): IMediaInfoConfig {
    const config: IMediaInfoConfig = { ...defaultMediaInfoConfig, ...(usePlayerStore().mediaInfo ?? {}) };
    config.position = config.position ?? defaultMediaInfoConfig.position;
    return config;
  }

  afterCreate() {
    const video = this.player.video as HTMLVideoElement | undefined;
    if (video) this.stopFps = startFpsEstimate(video, (fps) => (this.fps = fps));

    // 左上角覆盖层：纯文字、无背景，随控制栏显隐（CSS 控制）
    const root = (this.player.root ?? this.player.controls) as HTMLElement | undefined;
    if (root) {
      this.$topOverlay = document.createElement('span');
      this.$topOverlay.className = 'xg-mediainfo-top';
      root.appendChild(this.$topOverlay);
    }

    this.renderInfo();
    // getStats 为瞬时值，1s 轮询刷新码率/缓冲等
    this.refreshTimer = window.setInterval(() => this.renderInfo(), 1000);
  }

  destroy() {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.stopFps?.();
    this.stopFps = null;
    this.$topOverlay?.remove();
    this.$topOverlay = null;
  }

  renderInfo() {
    const media = this.player.video as (HTMLVideoElement & { videoWidth?: number; videoHeight?: number }) | undefined;
    const stats = getStreamStats(this.player);
    const config = this.getConfig();

    const height = stats?.height || media?.videoHeight || 0;
    const width = stats?.width || media?.videoWidth || 0;

    // 优先声明码率，缺失时用下载速度近似（kbps → Mbps）
    const kbps = stats?.bitrate || stats?.downloadSpeed || 0;
    const bitrateText = config.bitrate ? formatBitrate(kbps / 1000) : '';
    const codec = config.codec && stats?.videoCodec ? String(stats.videoCodec).toUpperCase() : '';
    const fps = config.fps ? Math.round(stats?.fps || this.fps || 0) : 0;

    const parts = [
      config.quality ? qualityLabel(height) : '',
      config.resolution ? formatResolution(width, height) : '',
      codec,
      bitrateText,
      config.buffer ? formatBuffer(bufferedAhead(media)) : '',
      fps ? `${fps}fps` : '',
    ].filter(Boolean);

    const text = parts.join(' · ');

    // position=topLeft：控制栏徽标隐藏，文字显示到左上角覆盖层
    const topLeft = config.position === 'topLeft' && !!this.$topOverlay;
    (this.root as HTMLElement | undefined)?.classList?.toggle('xg-media-info-empty', !parts.length || topLeft);
    if (this.$topOverlay) {
      this.$topOverlay.textContent = topLeft ? text : '';
      this.$topOverlay.style.display = topLeft && parts.length ? '' : 'none';
    }

    const $label = this.find('.xg-media-info-label');
    if ($label) {
      $label.innerHTML = topLeft ? '' : text;
    }
  }

  render() {
    return `
      <xg-icon class="xgplayer-mediainfo">
        <span class="xg-media-info-label"></span>
      </xg-icon>
    `;
  }
}
