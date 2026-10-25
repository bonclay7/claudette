const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const slugMatch = window.location.pathname.match(/^\/r\/([^/]+)/);
const slug = slugMatch?.[1];

function setStatus(
  msg: string,
  type: "idle" | "recording" | "loading" | "success" | "error",
): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
}

function showError(msg: string): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `<div class="error-page"><p>${msg}</p></div>`;
}

function buildRecorder(): void {
  const btn = document.getElementById("record-btn") as HTMLButtonElement;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let stream: MediaStream | null = null;

  async function ensureStream(): Promise<MediaStream> {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    return stream;
  }

  async function startRecording(): Promise<void> {
    try {
      const s = await ensureStream();
      audioChunks = [];
      mediaRecorder = new MediaRecorder(s);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.start();
      btn.classList.add("recording");
      setStatus("Listening...", "recording");
    } catch {
      showError(
        "Microphone access was denied. Please allow microphone access and reload the page.",
      );
    }
  }

  function stopRecording(): void {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    const mimeType = mediaRecorder.mimeType;
    const chunks = [...audioChunks];
    mediaRecorder.onstop = () => void sendAudio(mimeType, chunks);
    mediaRecorder.stop();
    btn.classList.remove("recording");
  }

  async function sendAudio(mimeType: string, chunks: Blob[]): Promise<void> {
    const blob = new Blob(chunks, { type: mimeType });

    if (blob.size < 500) {
      setStatus(
        "Recording too short. Hold the button longer and speak clearly.",
        "error",
      );
      return;
    }

    btn.setAttribute("disabled", "");
    setStatus("Sending your request...", "loading");

    try {
      const res = await fetch(`${API_URL}/r/${slug}/request`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Upload failed");
      }

      setStatus(
        "Your request has been received! Your family will be notified shortly.",
        "success",
      );
    } catch (err) {
      console.error("Upload failed:", err);
      setStatus("Could not send your request. Please try again.", "error");
    } finally {
      btn.removeAttribute("disabled");
    }
  }

  btn.addEventListener("mousedown", () => void startRecording());
  btn.addEventListener("mouseup", stopRecording);
  btn.addEventListener("mouseleave", stopRecording);
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    void startRecording();
  });
  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopRecording();
  });

  btn.removeAttribute("disabled");
  setStatus("Hold the button and speak your request", "idle");
}

async function main(): Promise<void> {
  if (!slug) {
    showError("Invalid link. Please contact your family for the correct link.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/r/${slug}`);
    if (!res.ok) throw new Error("Not found");
    const data = (await res.json()) as { name: string };
    const nameEl = document.getElementById("customer-name");
    if (nameEl) nameEl.textContent = data.name;
  } catch {
    showError(
      "Could not load your profile. Please check your link or try again later.",
    );
    return;
  }

  buildRecorder();
}

void main();
