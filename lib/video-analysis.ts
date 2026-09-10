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

function motionScore(current: ImageData, previous: ImageData | null) {
  if (!previous) return 0;
  const a = current.data;
  const b = previous.data;
  let total = 0;
  // Compare a small luminance thumbnail rather than the full frame. This keeps
  // sampling cheap while still surfacing fast changes such as ball impact,
  // wicket/catch action, camera cuts and celebrations.
  for (let i = 0; i < a.length; i += 16) {
    const currentLuma = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const previousLuma = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    total += Math.abs(currentLuma - previousLuma);
  }
  return total / Math.max(1, Math.floor(a.length / 16));
}

function chooseInterestingTimes(times: number[], scores: number[], duration: number, count: number) {
  if (times.length <= count) return times;

  // Keep broad story coverage, then spend the remaining frame budget on moments
  // with unusually high visual change. A minimum spacing prevents one camera cut
  // from consuming the whole budget and makes short decisive events more likely
  // to reach the vision model.
  const chosen = new Set<number>();
  const anchorCount = Math.min(6, count);
  for (let i = 0; i < anchorCount; i++) {
    const index = Math.round((i * (times.length - 1)) / Math.max(1, anchorCount - 1));
    chosen.add(index);
  }

  const ranked = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score);
  const minSpacing = Math.max(0.65, duration / Math.max(12, count * 1.5));

  for (const candidate of ranked) {
    if (chosen.size >= count) break;
    const candidateTime = times[candidate.index];
    const tooClose = Array.from(chosen).some(index => Math.abs(times[index] - candidateTime) < minSpacing);
    if (!tooClose) chosen.add(candidate.index);
  }

  // If spacing rules left unused slots, fill them by score regardless of spacing.
  for (const candidate of ranked) {
    if (chosen.size >= count) break;
    chosen.add(candidate.index);
  }

  return Array.from(chosen)
    .sort((a, b) => a - b)
    .map(index => times[index]);
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

  // For very short clips, dense fixed sampling is enough. For longer clips we
  // first inspect 48 candidate moments, score visual change, and then keep 18
  // frames: broad anchors + the most active moments. This is deliberately
  // motion-aware because a cricket wicket/catch/impact can happen between two
  // uniform samples even when the surrounding frames look almost identical.
  const candidateCount = duration < 3 ? 6 : 48;
  const candidateTimes = duration < 3
    ? Array.from({ length: candidateCount }, (_, index) => duration * (0.08 + (0.84 * index) / (candidateCount - 1)))
    : Array.from({ length: candidateCount }, (_, index) => duration * (0.03 + (0.94 * index) / (candidateCount - 1)));

  const candidateScores: number[] = [];
  const previousCanvas = document.createElement("canvas");
  previousCanvas.width = 96;
  previousCanvas.height = 54;
  const previousContext = previousCanvas.getContext("2d");
  if (!previousContext) return [];

  let previousFrame: ImageData | null = null;
  for (const rawTime of candidateTimes) {
    const timestampSeconds = Math.min(Math.max(rawTime, 0), Math.max(duration - 0.05, 0));
    await seek(video, timestampSeconds);
    previousContext.drawImage(video, 0, 0, previousCanvas.width, previousCanvas.height);
    const currentFrame = previousContext.getImageData(0, 0, previousCanvas.width, previousCanvas.height);
    candidateScores.push(motionScore(currentFrame, previousFrame));
    previousFrame = currentFrame;
  }

  const sampleCount = duration < 3 ? Math.min(6, candidateTimes.length) : 18;
  const sampleTimes = chooseInterestingTimes(candidateTimes, candidateScores, duration, sampleCount);

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
