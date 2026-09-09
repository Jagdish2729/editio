export type VideoFrame = {
  clipName: string;
  timestampSeconds: number;
  durationSeconds: number;
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
  const maxWidth = 420;
  const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 16 / 9;
  canvas.width = maxWidth;
  canvas.height = Math.max(236, Math.round(maxWidth * ratio));
  const context = canvas.getContext("2d");
  if (!context) return [];

  // Six samples give the vision model enough coverage to distinguish the opening,
  // action, reaction and ending without sending an unnecessarily huge payload.
  const sampleTimes = duration < 3
    ? [Math.max(0, duration * 0.35)]
    : [0.08, 0.24, 0.40, 0.58, 0.76, 0.92].map(position => duration * position);
  const frames: VideoFrame[] = [];

  for (const rawTime of sampleTimes) {
    const timestampSeconds = Math.min(Math.max(rawTime, 0), Math.max(duration - 0.05, 0));
    await seek(video, timestampSeconds);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
      clipName,
      timestampSeconds: Number(timestampSeconds.toFixed(2)),
      durationSeconds: Number(duration.toFixed(2)),
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.52),
    });
  }

  video.removeAttribute("src");
  video.load();
  return frames;
}
