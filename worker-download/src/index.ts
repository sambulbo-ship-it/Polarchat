const GITHUB_REPO = 'sambulbo-ship-it/Polarchat';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
  published_at: string;
}

function detectPlatform(ua: string): 'windows' | 'mac' | 'linux' {
  const lower = ua.toLowerCase();
  if (lower.includes('win')) return 'windows';
  if (lower.includes('mac')) return 'mac';
  return 'linux';
}

function detectArch(ua: string): string {
  const lower = ua.toLowerCase();
  if (lower.includes('arm64') || lower.includes('aarch64')) return 'arm64';
  return 'x64';
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

interface PlatformDownload {
  label: string;
  url: string;
  size: string;
  filename: string;
}

interface PlatformInfo {
  primary: PlatformDownload | null;
  all: PlatformDownload[];
}

function proxyDownloadUrl(filename: string): string {
  return `/download/${encodeURIComponent(filename)}`;
}

function getDownloadsForPlatform(assets: ReleaseAsset[], platform: string, arch: string): PlatformInfo {
  const patterns: Record<string, { label: string; pattern: RegExp; priority: number }[]> = {
    windows: [
      { label: 'Windows Installer (.exe)', pattern: /win-x64\.exe$/i, priority: 1 },
      { label: 'Windows ARM Installer', pattern: /win-arm64\.exe$/i, priority: 2 },
      { label: 'Windows Portable', pattern: /portable.*\.exe$/i, priority: 3 },
    ],
    mac: [
      { label: 'macOS Intel (.dmg)', pattern: /mac-x64\.dmg$/i, priority: 2 },
      { label: 'macOS Apple Silicon (.dmg)', pattern: /mac-arm64\.dmg$/i, priority: 1 },
      { label: 'macOS Intel (.zip)', pattern: /mac-x64\.zip$/i, priority: 4 },
      { label: 'macOS Apple Silicon (.zip)', pattern: /mac-arm64\.zip$/i, priority: 3 },
    ],
    linux: [
      { label: 'Linux AppImage', pattern: /x64\.AppImage$/i, priority: 1 },
      { label: 'Linux ARM AppImage', pattern: /arm64\.AppImage$/i, priority: 2 },
      { label: 'Debian/Ubuntu (.deb)', pattern: /x64\.deb$/i, priority: 3 },
      { label: 'Fedora/RHEL (.rpm)', pattern: /x64\.rpm$/i, priority: 4 },
    ],
  };

  const platformPatterns = patterns[platform] || patterns.linux;
  const all: PlatformDownload[] = [];

  for (const p of platformPatterns) {
    const asset = assets.find(a => p.pattern.test(a.name));
    if (asset) {
      all.push({
        label: p.label,
        url: proxyDownloadUrl(asset.name),
        size: formatSize(asset.size),
        filename: asset.name,
      });
    }
  }

  // Primary: prefer matching arch
  let primary = all[0] || null;
  if (arch === 'arm64') {
    const armMatch = all.find(d => d.label.toLowerCase().includes('arm') || d.label.toLowerCase().includes('silicon'));
    if (armMatch) primary = armMatch;
  }

  return { primary, all };
}

function renderPage(release: GitHubRelease | null, userAgent: string): string {
  const platform = detectPlatform(userAgent);
  const arch = detectArch(userAgent);
  const version = release?.tag_name?.replace(/^v/, '') || '—';

  const platformLabels: Record<string, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  const platformIcons: Record<string, string> = {
    windows: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    mac: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`,
    linux: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const downloads = release ? getDownloadsForPlatform(release.assets, platform, arch) : { primary: null, all: [] };
  const otherPlatforms = ['windows', 'mac', 'linux'].filter(p => p !== platform);

  // Build download cards for all platforms
  const allPlatformCards = ['windows', 'mac', 'linux'].map(p => {
    const dl = release ? getDownloadsForPlatform(release.assets, p, arch) : { primary: null, all: [] };
    const isDetected = p === platform;
    return `
      <div class="platform-card ${isDetected ? 'detected' : ''}">
        ${isDetected ? '<span class="badge">Your system</span>' : ''}
        <div class="platform-header">
          <span class="platform-icon">${platformIcons[p]}</span>
          <div>
            <h3>${platformLabels[p]}</h3>
            ${release ? `<span class="version-small">v${version}</span>` : ''}
          </div>
        </div>
        <div class="download-list">
          ${dl.all.length > 0 ? dl.all.map(d => `
            <a href="${d.url}" class="download-item">
              <span class="download-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </span>
              <span class="download-label">${d.label}</span>
              <span class="download-size">${d.size}</span>
            </a>
          `).join('') : `
            <a href="/get/${p}" class="download-item">
              <span class="download-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </span>
              <span class="download-label">Download for ${platformLabels[p]}</span>
              <span class="download-size">↗</span>
            </a>
          `}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download PolarChat - Private & Secure Messaging</title>
  <meta name="description" content="Download PolarChat for Windows, macOS, and Linux. End-to-end encrypted messaging with zero tracking.">
  <meta name="theme-color" content="#1a1a2e">
  <meta property="og:title" content="Download PolarChat">
  <meta property="og:description" content="Private & secure messaging. End-to-end encrypted. No tracking. No compromise.">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #1a1a2e;
      --bg-dark: #12122a;
      --sidebar: #16213e;
      --accent: #0f3460;
      --highlight: #533483;
      --text: #e4e4e7;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --border: #2a2a4a;
      --hover: #1e2a4a;
      --success: #22c55e;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Animated background ─────────────────────────────────── */
    .bg-glow {
      position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none;
    }
    .bg-glow::before, .bg-glow::after {
      content: ''; position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.15;
    }
    .bg-glow::before {
      width: 600px; height: 600px; background: var(--highlight);
      top: -200px; right: -100px; animation: float 8s ease-in-out infinite;
    }
    .bg-glow::after {
      width: 500px; height: 500px; background: var(--accent);
      bottom: -150px; left: -100px; animation: float 10s ease-in-out infinite reverse;
    }
    @keyframes float {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(30px, -40px); }
    }

    /* ── Layout ──────────────────────────────────────────────── */
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; position: relative; z-index: 1; }

    /* ── Nav ─────────────────────────────────────────────────── */
    nav {
      padding: 20px 0; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }
    .logo { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); }
    .logo-icon {
      width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--accent), var(--highlight));
    }
    .logo-icon svg { width: 22px; height: 22px; color: white; }
    .logo-text { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .nav-links { display: flex; gap: 24px; align-items: center; }
    .nav-links a {
      color: var(--text-muted); text-decoration: none; font-size: 14px; font-weight: 500;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--text); }
    .nav-btn {
      padding: 8px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;
      background: var(--accent); color: white; transition: all 0.2s;
    }
    .nav-btn:hover { background: var(--highlight); }

    /* ── Hero ────────────────────────────────────────────────── */
    .hero { text-align: center; padding: 80px 0 60px; }
    .e2ee-badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px;
      border-radius: 100px; background: rgba(83, 52, 131, 0.2); border: 1px solid rgba(83, 52, 131, 0.4);
      color: #a78bfa; font-size: 13px; font-weight: 600; margin-bottom: 28px;
    }
    .e2ee-badge svg { width: 14px; height: 14px; }
    h1 {
      font-size: clamp(40px, 6vw, 64px); font-weight: 800; letter-spacing: -1.5px;
      line-height: 1.1; margin-bottom: 16px;
      background: linear-gradient(135deg, var(--text) 0%, #a78bfa 50%, var(--text) 100%);
      background-size: 200% auto;
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 4s ease-in-out infinite;
    }
    @keyframes shimmer {
      0%, 100% { background-position: 0% center; }
      50% { background-position: 200% center; }
    }
    .subtitle {
      font-size: 20px; color: var(--text-muted); max-width: 560px; margin: 0 auto 40px;
      line-height: 1.5;
    }

    /* ── Primary CTA ────────────────────────────────────────── */
    .cta-wrapper { margin-bottom: 16px; }
    .cta-btn {
      display: inline-flex; align-items: center; gap: 12px; padding: 16px 36px;
      border-radius: 14px; font-size: 18px; font-weight: 700; text-decoration: none; color: white;
      background: linear-gradient(135deg, var(--accent), var(--highlight));
      box-shadow: 0 8px 32px rgba(83, 52, 131, 0.3);
      transition: all 0.3s ease; position: relative; overflow: hidden;
    }
    .cta-btn:hover {
      transform: translateY(-2px); box-shadow: 0 12px 40px rgba(83, 52, 131, 0.45);
    }
    .cta-btn::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, transparent, rgba(255,255,255,0.1));
      opacity: 0; transition: opacity 0.3s;
    }
    .cta-btn:hover::after { opacity: 1; }
    .cta-btn svg { width: 22px; height: 22px; }
    .cta-meta { font-size: 13px; color: var(--text-dim); margin-top: 8px; }
    .other-platforms { font-size: 14px; color: var(--text-dim); margin-top: 20px; }
    .other-platforms a { color: #a78bfa; text-decoration: none; }
    .other-platforms a:hover { text-decoration: underline; }

    /* ── Platform Cards ─────────────────────────────────────── */
    .platforms { padding: 60px 0; }
    .platforms h2 { text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 40px; }
    .platform-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .platform-card {
      background: var(--sidebar); border: 1px solid var(--border); border-radius: 16px;
      padding: 24px; position: relative; transition: border-color 0.2s;
    }
    .platform-card:hover { border-color: rgba(83, 52, 131, 0.5); }
    .platform-card.detected { border-color: var(--highlight); box-shadow: 0 0 20px rgba(83, 52, 131, 0.15); }
    .badge {
      position: absolute; top: -10px; left: 16px; padding: 2px 10px; border-radius: 100px;
      background: var(--highlight); font-size: 11px; font-weight: 700; color: white;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .platform-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .platform-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: var(--hover); color: var(--text-muted);
    }
    .platform-header h3 { font-size: 18px; font-weight: 700; }
    .version-small { font-size: 12px; color: var(--text-dim); }
    .download-list { display: flex; flex-direction: column; gap: 8px; }
    .download-item {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px;
      background: var(--bg); border: 1px solid var(--border); text-decoration: none; color: var(--text);
      transition: all 0.2s; font-size: 14px;
    }
    .download-item:hover { background: var(--hover); border-color: var(--highlight); }
    .download-icon { color: var(--text-dim); display: flex; flex-shrink: 0; }
    .download-item:hover .download-icon { color: #a78bfa; }
    .download-label { flex: 1; font-weight: 500; }
    .download-size { font-size: 12px; color: var(--text-dim); }

    /* ── Features ────────────────────────────────────────────── */
    .features {
      padding: 60px 0; border-top: 1px solid var(--border);
    }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 32px; }
    .feature { text-align: center; }
    .feature-icon {
      width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px; background: rgba(15, 52, 96, 0.3); color: #a78bfa;
    }
    .feature-icon svg { width: 24px; height: 24px; }
    .feature h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    .feature p { font-size: 14px; color: var(--text-muted); line-height: 1.6; }

    /* ── Install Guide ───────────────────────────────────────── */
    .install { padding: 60px 0; border-top: 1px solid var(--border); }
    .install h2 { text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 40px; }
    .install-steps { max-width: 700px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    details {
      background: var(--sidebar); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px 20px; cursor: pointer;
    }
    details[open] { padding-bottom: 20px; }
    summary {
      display: flex; align-items: center; justify-content: space-between; list-style: none;
      font-weight: 600; font-size: 15px;
    }
    summary::-webkit-details-marker { display: none; }
    summary .arrow { transition: transform 0.2s; color: var(--text-dim); }
    details[open] summary .arrow { transform: rotate(90deg); }
    .install-content { margin-top: 16px; font-size: 14px; color: var(--text-muted); line-height: 1.7; }
    .install-content strong { color: var(--text); }
    .install-content code {
      display: block; margin: 8px 0; padding: 10px 14px; border-radius: 8px;
      background: var(--bg-dark); font-family: 'JetBrains Mono', monospace; font-size: 13px;
      color: #a78bfa; overflow-x: auto;
    }
    .install-content .note { font-size: 12px; color: var(--text-dim); margin-top: 8px; }

    /* ── Footer ──────────────────────────────────────────────── */
    footer {
      padding: 24px 0; border-top: 1px solid var(--border); margin-top: 40px;
      display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--text-dim);
    }
    footer a { color: var(--text-muted); text-decoration: none; }
    footer a:hover { color: var(--text); }
    .footer-left { display: flex; align-items: center; gap: 8px; }
    .footer-left svg { width: 16px; height: 16px; color: var(--text-dim); }

    /* ── Responsive ──────────────────────────────────────────── */
    @media (max-width: 768px) {
      .hero { padding: 50px 0 40px; }
      .subtitle { font-size: 17px; }
      .cta-btn { padding: 14px 28px; font-size: 16px; }
      .platform-grid { grid-template-columns: 1fr; }
      .nav-links { gap: 12px; }
      footer { flex-direction: column; gap: 12px; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>

  <div class="container">
    <!-- Nav -->
    <nav>
      <a href="/" class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <span class="logo-text">PolarChat</span>
      </a>
      <div class="nav-links">
        <a href="https://github.com/${GITHUB_REPO}" target="_blank" rel="noopener">GitHub</a>
        <a href="https://github.com/${GITHUB_REPO}/releases" target="_blank" rel="noopener">Releases</a>
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="e2ee-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        End-to-end encrypted
      </div>

      <h1>Download PolarChat</h1>
      <p class="subtitle">
        Private messaging for your desktop. No tracking, no data collection,
        automatic updates — just secure conversations.
      </p>

      <div class="cta-wrapper">
        ${downloads.primary ? `
          <a href="${downloads.primary.url}" class="cta-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download for ${platformLabels[platform]}
          </a>
          <p class="cta-meta">${downloads.primary.filename} — ${downloads.primary.size} — v${version}</p>
        ` : `
          <a href="/get/${platform}" class="cta-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download for ${platformLabels[platform]}
          </a>
          <p class="cta-meta">v${version} — Auto-detects your system</p>
        `}
      </div>

      <p class="other-platforms">
        Also available for
        ${otherPlatforms.map(p => `<a href="#platforms">${platformLabels[p]}</a>`).join(' and ')}
      </p>
    </section>

    <!-- All Platforms -->
    <section class="platforms" id="platforms">
      <h2>All Downloads</h2>
      <div class="platform-grid">
        ${allPlatformCards}
      </div>
    </section>

    <!-- Features -->
    <section class="features">
      <div class="features-grid">
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h3>Auto-Updates</h3>
          <p>The app checks for updates automatically. New versions download in the background and apply on restart.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>
          <h3>Zero Tracking</h3>
          <p>No analytics, no telemetry. The desktop app blocks all external network requests — only your chat server is contacted.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3>Open Source</h3>
          <p>Every line of code is auditable. Build from source if you prefer — the app is fully reproducible.</p>
        </div>
      </div>
    </section>

    <!-- Install Guide -->
    <section class="install">
      <h2>Installation</h2>
      <div class="install-steps">
        <details ${platform === 'windows' ? 'open' : ''}>
          <summary>
            <span>🪟 Windows</span>
            <span class="arrow">›</span>
          </summary>
          <div class="install-content">
            <p><strong>Installer (.exe):</strong> Double-click the downloaded file. Follow the install wizard. PolarChat will be added to your Start Menu and Desktop.</p>
            <p><strong>Portable:</strong> No installation needed — just run the .exe directly from anywhere.</p>
            <p class="note">Requires Windows 10 or later. SmartScreen may warn you the first time — click "More info" then "Run anyway".</p>
          </div>
        </details>

        <details ${platform === 'mac' ? 'open' : ''}>
          <summary>
            <span>🍎 macOS</span>
            <span class="arrow">›</span>
          </summary>
          <div class="install-content">
            <p><strong>.dmg:</strong> Open the DMG file, drag PolarChat to your Applications folder. Done.</p>
            <p><strong>Apple Silicon (M1/M2/M3/M4):</strong> Download the arm64 version for best performance.</p>
            <p class="note">Requires macOS 11 (Big Sur) or later. If Gatekeeper blocks the app: System Settings → Privacy & Security → "Open Anyway".</p>
          </div>
        </details>

        <details ${platform === 'linux' ? 'open' : ''}>
          <summary>
            <span>🐧 Linux</span>
            <span class="arrow">›</span>
          </summary>
          <div class="install-content">
            <p><strong>AppImage (recommended):</strong></p>
            <code>chmod +x PolarChat-*.AppImage && ./PolarChat-*.AppImage</code>
            <p><strong>Debian / Ubuntu:</strong></p>
            <code>sudo dpkg -i polarchat-*.deb</code>
            <p><strong>Fedora / RHEL:</strong></p>
            <code>sudo rpm -i polarchat-*.rpm</code>
          </div>
        </details>
      </div>
    </section>

    <!-- Footer -->
    <footer>
      <div class="footer-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>PolarChat — Your privacy, non-negotiable.</span>
      </div>
      <a href="https://github.com/${GITHUB_REPO}/releases" target="_blank" rel="noopener">All releases ↗</a>
    </footer>
  </div>
</body>
</html>`;
}

async function fetchRelease(): Promise<GitHubRelease | null> {
  try {
    const ghRes = await fetch(GITHUB_API, {
      headers: {
        'User-Agent': 'PolarChat-Download-Worker',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (ghRes.ok) {
      return await ghRes.json() as GitHubRelease;
    }
  } catch {
    // Silently fail
  }
  return null;
}

async function handlePlatformDownload(platform: string, userAgent: string): Promise<Response> {
  const release = await fetchRelease();
  const arch = detectArch(userAgent);

  if (release && release.assets.length > 0) {
    const dl = getDownloadsForPlatform(release.assets, platform, arch);
    if (dl.primary) {
      // Redirect to the proxy download route with the actual filename
      return Response.redirect(new URL(`/download/${encodeURIComponent(dl.primary.filename)}`, 'https://polarchat.animalcoat.com').toString(), 302);
    }
  }

  // No assets available — redirect to GitHub releases
  return Response.redirect(`https://github.com/${GITHUB_REPO}/releases`, 302);
}

async function handleDownload(filename: string): Promise<Response> {
  const release = await fetchRelease();
  if (!release) {
    return new Response('Release not found', { status: 404 });
  }

  const asset = release.assets.find(a => a.name === filename);
  if (!asset) {
    return new Response('File not found', { status: 404 });
  }

  // Proxy the file from GitHub — stream it through the worker
  const ghRes = await fetch(asset.browser_download_url, {
    headers: {
      'User-Agent': 'PolarChat-Download-Worker',
    },
    redirect: 'follow',
  });

  if (!ghRes.ok) {
    return new Response('Download failed', { status: 502 });
  }

  // Determine content type from extension
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    exe: 'application/vnd.microsoft.portable-executable',
    dmg: 'application/x-apple-diskimage',
    zip: 'application/zip',
    appimage: 'application/octet-stream',
    deb: 'application/vnd.debian.binary-package',
    rpm: 'application/x-rpm',
  };

  return new Response(ghRes.body, {
    headers: {
      'Content-Type': contentTypes[ext || ''] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': asset.size.toString(),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle /get/:os — auto-resolve best download for platform
    if (url.pathname.startsWith('/get/')) {
      const os = url.pathname.replace('/get/', '').toLowerCase();
      const validOs = ['windows', 'mac', 'linux'];
      if (!validOs.includes(os)) {
        return new Response('Invalid platform', { status: 400 });
      }
      const userAgent = request.headers.get('user-agent') || '';
      return handlePlatformDownload(os, userAgent);
    }

    // Handle /download/:filename — proxy file from GitHub
    if (url.pathname.startsWith('/download/')) {
      const filename = decodeURIComponent(url.pathname.replace('/download/', ''));
      if (!filename || filename.includes('/') || filename.includes('..')) {
        return new Response('Invalid filename', { status: 400 });
      }
      return handleDownload(filename);
    }

    // Serve download page
    const userAgent = request.headers.get('user-agent') || '';
    const release = await fetchRelease();
    const html = renderPage(release, userAgent);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    });
  },
};
