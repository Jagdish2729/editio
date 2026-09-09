export type VideoFrame = {
  clipName: string;
  timestampSeconds: number;
  imageDataUrl: string;
};

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Could not read video metadata."));
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      reject(new Error("Could not seek video."));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
  });
}

export async function extractVideoFrames(clipName: string, url: string): Promise<VideoFrame[]> {
  const video = await loadVideo(url);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) return [];

  const canvas = document.createElement("canvas");
  const maxWidth = 360;
  const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 16 / 9;
  canvas.width = maxWidth;
  canvas.height = Math.max(200, Math.round(maxWidth * ratio));
  const context = canvas.getContext("2d");
  if (!context) return [];

  const sampleTimes = duration < 3 ? [0] : [duration * 0.15, duration * 0.5, duration * 0.85];
  const frames: VideoFrame[] = [];

  for (const timestampSeconds of sampleTimes) {
    await seek(video, Math.min(Math.max(timestampSeconds, 0), Math.max(duration - 0.05, 0)));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
      clipName,
      timestampSeconds: Number(timestampSeconds.toFixed(2)),
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.58),
    });
  }

  video.removeAttribute("src");
  video.load();
  return frames;
}
