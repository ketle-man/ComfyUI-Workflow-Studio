/**
 * Video helper utilities shared across tabs that deal with generated mp4 output
 * (Lab tab's "use generated image for next" chaining, and the Video tab's future
 * batch features). Kept dependency-free (no comfyUI/comfyEditor imports) so it can
 * be reused from either tab without pulling in unrelated state.
 */

export function isVideoFilename(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename || "");
}

// Extracts the last frame of a video at `videoUrl` as a PNG Blob, by seeking a
// detached <video> element to just before its end and drawing that frame onto a
// canvas. Runs entirely client-side (no server round-trip / PyAV dependency).
//
// Seeks to (duration - 0.05s) rather than duration itself: seeking exactly to the
// end is unreliable across browsers (some clamp it back to the last keyframe's
// timestamp, which can fire a "seeked" event before the frame is actually decoded).
// The "seeked" listener also ignores events that don't land near that target time,
// since loading a video can fire an initial seeked-to-0 before the real seek lands.
export function extractLastFrameBlob(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";

        let target = null;
        let settled = false;

        const cleanup = () => {
            video.removeAttribute("src");
            video.load();
        };
        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn(arg);
        };

        video.addEventListener("error", () => {
            finish(reject, new Error("Failed to load video for last-frame extraction"));
        });

        video.addEventListener("loadedmetadata", () => {
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                finish(reject, new Error("Video has no readable duration"));
                return;
            }
            target = Math.max(0, video.duration - 0.05);
            video.currentTime = target;
        });

        video.addEventListener("seeked", () => {
            if (target == null || Math.abs(video.currentTime - target) > 0.5) return;
            try {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext("2d").drawImage(video, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) finish(resolve, blob);
                    else finish(reject, new Error("Failed to encode last frame"));
                }, "image/png");
            } catch (err) {
                finish(reject, err);
            }
        });

        video.src = videoUrl;
    });
}
