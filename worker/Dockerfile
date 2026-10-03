FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
# Videos for members (worker/video.mjs): ffmpeg joins and edits; the CJK fonts draw Korean, Japanese and Chinese scene text.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk fonts-noto-core && rm -rf /var/lib/apt/lists/*
# Claude Code, installed exactly as Anthropic publishes it (never modified) — runs users' own Claude subscriptions.
RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code@2.1.280
# OpenAI's Codex, also as published (never modified) — runs users' own ChatGPT Plus/Pro plans (worker/chatgpt.mjs).
RUN npm install -g --no-audit --no-fund @openai/codex@0.155.1
# Speech to text and YouTube captions (worker/media.mjs): faster-whisper (the «small» model, baked in) and yt-dlp.
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages faster-whisper==1.2.1 av==18.1.0 ctranslate2==4.8.2 yt-dlp \
 && WHISPER_DIR=/models python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8', download_root='/models')"
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY *.mjs stt.py ./
ENV NODE_ENV=production CLAUDE_HOME_ROOT=/data/claude CODEX_HOME_ROOT=/data/codex DISABLE_AUTOUPDATER=1
CMD ["node", "main.mjs"]
