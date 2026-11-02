import type Artplayer from 'artplayer';
import type Hlsjs from 'hls.js';

import { usePlayerStore } from '@/store';

import type { IMediaInfoConfig } from '../../../utils/mediaInfo';
import {
  bufferedAhead,
  defaultMediaInfoConfig,
  formatBitrate,
  formatBuffer,
  formatResolution,
  qualityLabel,
  startFpsEstimate,
} from '../../../utils/mediaInfo';
import { language } from '../../../utils/static';
import type { PlayerAdapter } from '../types';

const tooltip = () => {
  switch (language()) {
    case 'zh-CN':
      return '媒体信息';
    case 'zh-TW':
      return '媒體資訊';
    default:
      return 'Media Info';
  }
};

const mediaInfoPlugin = {
  name: 'mediaInfo',
  position: 'right',
  index: 30,
  html: '',
  tooltip: tooltip(),
  mounted(this: Artplayer, $control: HTMLElement) {
    const art = this as unknown as PlayerAdapter;

    let bitrate = 0; // Mbps
    let codec = '';
    let fps = 0;
    let stopFps: (() => void) | null = null;
    let $topOverlay: HTMLElement | null = null;

    // 左上角覆盖层：纯文字、无背景，随控制栏显隐（CSS 依据 art-control-show）
    const $playerRoot = $control.closest('.art-video-player');
    if ($playerRoot) {
      $topOverlay = document.createElement('span');
      $topOverlay.className = 'art-media-info-top';
      $topOverlay.style.display = 'none';
      $playerRoot.appendChild($topOverlay);
    }

    // 读展示配置，缺失字段回退默认值（兼容旧存储）
    const getConfig = (): IMediaInfoConfig => {
      const config: IMediaInfoConfig = { ...defaultMediaInfoConfig, ...(usePlayerStore().mediaInfo ?? {}) };
      config.position = config.position ?? defaultMediaInfoConfig.position;
      return config;
    };

    const render = () => {
      const config = getConfig();
      const video = art.video;
      const height = video?.videoHeight ?? 0;
      const width = video?.videoWidth ?? 0;
      const bitrateText = config.bitrate ? formatBitrate(bitrate) : '';

      const parts = [
        config.quality ? qualityLabel(height) : '',
        config.resolution ? formatResolution(width, height) : '',
        config.codec ? codec : '',
        bitrateText,
        config.buffer ? formatBuffer(bufferedAhead(video)) : '',
        config.fps && fps ? `${Math.round(fps)}fps` : '',
      ].filter(Boolean);

      const text = parts.join(' · ');

      // position=topLeft：控制栏徽标隐藏，文字显示到左上角覆盖层
      const topLeft = config.position === 'topLeft' && !!$topOverlay;
      $control.style.display = topLeft ? 'none' : '';
      if ($topOverlay) {
        $topOverlay.textContent = topLeft ? text : '';
        $topOverlay.style.display = topLeft && parts.length ? '' : 'none';
      }
      $control.innerHTML = topLeft ? '' : text;
    };

    // hls.js：取当前 level 的声明码率与编码
    const attachHls = (rawHls: unknown) => {
      const hls = rawHls as Hlsjs | undefined;
      if (!hls?.levels) return;

      const target = hls as Hlsjs & { __mediaInfoAttached?: boolean };
      if (target.__mediaInfoAttached) return;
      target.__mediaInfoAttached = true;

      (
        hls as unknown as {
          on: (event: string, cb: (event: string, data: { level: number }) => void) => void;
        }
      ).on('hlsLevelSwitched', (_event, data) => {
        const level = hls.levels?.[data.level];
        bitrate = level?.bitrate ? level.bitrate / 1_000_000 : 0;
        codec = (level as unknown as { videoCodec?: string } | undefined)?.videoCodec?.toUpperCase() ?? '';
        render();
      });
    };

    // flv.js / mpegts.js：下载速度近似码率
    const attachSpeed = (instance: unknown) => {
      const target = instance as
        | (EventTarget & {
            on: (event: string, cb: (info: { speed?: number }) => void) => void;
            __mediaInfoAttached?: boolean;
          })
        | undefined;
      if (!target?.on || target.__mediaInfoAttached) return;
      target.__mediaInfoAttached = true;

      target.on('statistics_info', (info: { speed?: number }) => {
        // speed 单位 KB/s → Mbps
        bitrate = info?.speed ? (info.speed * 8) / 1024 : 0;
        render();
      });
    };

    // 切换清晰度/换源后 video 元素会重新触发 loadedmetadata，同时重建流实例
    art.on('video:loadedmetadata', () => {
      bitrate = 0;
      codec = '';
      stopFps?.();
      stopFps = art.video ? startFpsEstimate(art.video, (v) => (fps = v)) : null;
      attachHls(art.hls);
      attachSpeed(art.flv);
      attachSpeed(art.mpegts);
      render();
    });

    // 配置/缓冲/帧率变化时周期刷新
    const refreshTimer = window.setInterval(render, 1000);
    art.on('destroy', () => {
      window.clearInterval(refreshTimer);
      stopFps?.();
      stopFps = null;
      $topOverlay?.remove();
      $topOverlay = null;
    });

    $control.onclick = () => {
      try {
        // 展开 artplayer 内建信息面板（分辨率/码率/缓冲等明细）
        (art as unknown as { infoPanel?: { toggle: () => void } }).infoPanel?.toggle();
      } catch {}
    };

    render();
  },
};

export default mediaInfoPlugin;
