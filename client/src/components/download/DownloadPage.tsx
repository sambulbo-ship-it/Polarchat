import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Download,
  Monitor,
  Apple,
  ChevronRight,
  Lock,
  Eye,
  EyeOff,
  Zap,
  ExternalLink,
} from 'lucide-react';

// ─── OS Detection ────────────────────────────────────────────────────────────

type Platform = 'windows' | 'mac' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

function detectArch(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('arm64') || ua.includes('aarch64')) return 'arm64';
  return 'x64';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GITHUB_REPO = 'sambulbo-ship-it/Polarchat';
const GITHUB_RELEASES = `https://github.com/${GITHUB_REPO}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

// ─── Platform Config ─────────────────────────────────────────────────────────

const PLATFORMS = {
  windows: {
    label: 'Windows',
    icon: Monitor,
    color: 'from-blue-500 to-blue-600',
    formats: [
      { label: 'Installer (.exe)', pattern: /win-x64\.exe$/, arch: 'x64' },
      { label: 'Installer ARM (.exe)', pattern: /win-arm64\.exe$/, arch: 'arm64' },
      { label: 'Portable (.exe)', pattern: /portable.*\.exe$/, arch: 'x64' },
    ],
  },
  mac: {
    label: 'macOS',
    icon: Apple,
    color: 'from-gray-400 to-gray-500',
    formats: [
      { label: 'Intel (.dmg)', pattern: /mac-x64\.dmg$/, arch: 'x64' },
      { label: 'Apple Silicon (.dmg)', pattern: /mac-arm64\.dmg$/, arch: 'arm64' },
      { label: 'Intel (.zip)', pattern: /mac-x64\.zip$/, arch: 'x64' },
      { label: 'Apple Silicon (.zip)', pattern: /mac-arm64\.zip$/, arch: 'arm64' },
    ],
  },
  linux: {
    label: 'Linux',
    icon: Monitor,
    color: 'from-orange-500 to-yellow-500',
    formats: [
      { label: 'AppImage', pattern: /x64\.AppImage$/, arch: 'x64' },
      { label: 'AppImage ARM', pattern: /arm64\.AppImage$/, arch: 'arm64' },
      { label: 'Debian (.deb)', pattern: /x64\.deb$/, arch: 'x64' },
      { label: 'RPM (.rpm)', pattern: /x64\.rpm$/, arch: 'x64' },
    ],
  },
} as const;

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [arch, setArch] = useState('x64');
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPlatform(detectPlatform());
    setArch(detectArch());

    // Fetch latest release from GitHub
    fetch(LATEST_RELEASE_API)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRelease(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Find the best download for detected platform
  function getPrimaryDownload(): ReleaseAsset | null {
    if (!release || platform === 'unknown') return null;
    const config = PLATFORMS[platform];

    // Try to match architecture first
    for (const fmt of config.formats) {
      if (fmt.arch === arch) {
        const asset = release.assets.find((a) => fmt.pattern.test(a.name));
        if (asset) return asset;
      }
    }
    // Fallback to first available
    for (const fmt of config.formats) {
      const asset = release.assets.find((a) => fmt.pattern.test(a.name));
      if (asset) return asset;
    }
    return null;
  }

  function getAssetsForPlatform(p: Platform): { label: string; asset: ReleaseAsset }[] {
    if (!release || p === 'unknown') return [];
    const config = PLATFORMS[p];
    const results: { label: string; asset: ReleaseAsset }[] = [];

    for (const fmt of config.formats) {
      const asset = release.assets.find((a) => fmt.pattern.test(a.name));
      if (asset) results.push({ label: fmt.label, asset });
    }
    return results;
  }

  const primaryDownload = getPrimaryDownload();
  const version = release?.tag_name?.replace(/^v/, '') || '1.0.0';

  return (
    <div className="min-h-screen bg-polar-bg text-polar-text overflow-y-auto">
      {/* Header */}
      <header className="border-b border-polar-border bg-polar-sidebar/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-polar-accent to-polar-highlight flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">PolarChat</span>
          </Link>
          <Link to="/login" className="polar-btn-primary text-sm">
            Open in Browser
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-polar-highlight/20 text-polar-highlight border border-polar-highlight/30 text-sm mb-6">
            <Lock className="w-3.5 h-3.5" />
            End-to-end encrypted
          </div>

          <h1 className="text-5xl font-bold mb-4 leading-tight">
            Download PolarChat
          </h1>
          <p className="text-xl text-polar-text-muted mb-10 max-w-2xl mx-auto">
            Private messaging for your desktop. No tracking, no data collection,
            automatic updates — just secure conversations.
          </p>

          {/* Primary Download Button */}
          {platform !== 'unknown' && (
            <div className="mb-6">
              {loading ? (
                <div className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-polar-accent/50 text-lg">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading...
                </div>
              ) : primaryDownload ? (
                <a
                  href={primaryDownload.browser_download_url}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-polar-accent to-polar-highlight hover:from-polar-highlight hover:to-polar-accent text-white text-lg font-semibold transition-all duration-300 shadow-lg shadow-polar-accent/25 hover:shadow-polar-highlight/25 hover:scale-[1.02]"
                >
                  <Download className="w-6 h-6" />
                  Download for {PLATFORMS[platform].label}
                  <span className="text-sm opacity-70">
                    ({arch}) — v{version}
                  </span>
                </a>
              ) : (
                <a
                  href={GITHUB_RELEASES}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-polar-accent to-polar-highlight text-white text-lg font-semibold"
                >
                  <Download className="w-6 h-6" />
                  Download for {PLATFORMS[platform].label}
                  <ExternalLink className="w-4 h-4 opacity-70" />
                </a>
              )}
              {primaryDownload && (
                <p className="text-sm text-polar-text-dim mt-3">
                  {primaryDownload.name} — {formatSize(primaryDownload.size)}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-polar-text-dim">
            Also available for{' '}
            {(['windows', 'mac', 'linux'] as Platform[])
              .filter((p) => p !== platform)
              .map((p, i, arr) => (
                <React.Fragment key={p}>
                  <a href={`#${p}`} className="text-polar-highlight hover:underline">
                    {PLATFORMS[p].label}
                  </a>
                  {i < arr.length - 1 ? ' and ' : ''}
                </React.Fragment>
              ))}
          </p>
        </div>
      </section>

      {/* All Platforms */}
      <section className="py-12 px-6 border-t border-polar-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">All Downloads</h2>

          <div className="grid md:grid-cols-3 gap-6">
            {(['windows', 'mac', 'linux'] as Platform[]).map((p) => {
              const config = PLATFORMS[p];
              const Icon = config.icon;
              const assets = getAssetsForPlatform(p);
              const isDetected = p === platform;

              return (
                <div
                  key={p}
                  id={p}
                  className={`polar-card relative ${
                    isDetected ? 'ring-2 ring-polar-highlight' : ''
                  }`}
                >
                  {isDetected && (
                    <span className="absolute -top-3 left-4 px-2 py-0.5 bg-polar-highlight text-xs rounded-full font-medium">
                      Your system
                    </span>
                  )}

                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{config.label}</h3>
                      {release && (
                        <span className="text-xs text-polar-text-dim">v{version}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {loading ? (
                      <div className="py-4 text-center text-polar-text-dim text-sm">
                        Loading...
                      </div>
                    ) : assets.length > 0 ? (
                      assets.map(({ label, asset }) => (
                        <a
                          key={asset.name}
                          href={asset.browser_download_url}
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-polar-bg hover:bg-polar-hover border border-polar-border transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <Download className="w-4 h-4 text-polar-text-muted group-hover:text-polar-highlight transition-colors" />
                            <span className="text-sm">{label}</span>
                          </div>
                          <span className="text-xs text-polar-text-dim">
                            {formatSize(asset.size)}
                          </span>
                        </a>
                      ))
                    ) : (
                      <a
                        href={GITHUB_RELEASES}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-polar-bg hover:bg-polar-hover border border-polar-border transition-colors text-sm text-polar-text-muted"
                      >
                        View on GitHub
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Strip */}
      <section className="py-16 px-6 border-t border-polar-border bg-polar-sidebar/30">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-polar-accent/20 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-polar-highlight" />
              </div>
              <h3 className="font-semibold mb-2">Auto-Updates</h3>
              <p className="text-sm text-polar-text-muted">
                The app checks for updates automatically. When a new version is available,
                it downloads in the background and applies on restart.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-polar-accent/20 flex items-center justify-center mx-auto mb-4">
                <EyeOff className="w-6 h-6 text-polar-highlight" />
              </div>
              <h3 className="font-semibold mb-2">Zero Tracking</h3>
              <p className="text-sm text-polar-text-muted">
                No analytics, no telemetry. The desktop app blocks all external
                network requests — only your chat server is contacted.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-polar-accent/20 flex items-center justify-center mx-auto mb-4">
                <Eye className="w-6 h-6 text-polar-highlight" />
              </div>
              <h3 className="font-semibold mb-2">Open Source</h3>
              <p className="text-sm text-polar-text-muted">
                Every line of code is auditable. Build from source if you prefer —
                the app is fully reproducible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Installation Instructions */}
      <section className="py-16 px-6 border-t border-polar-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Installation</h2>

          <div className="space-y-6">
            {/* Windows */}
            <details className="polar-card group" open={platform === 'windows'}>
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-blue-400" />
                  <span className="font-semibold">Windows</span>
                </div>
                <ChevronRight className="w-4 h-4 text-polar-text-dim transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-4 text-sm text-polar-text-muted space-y-2">
                <p><strong className="text-polar-text">Installer (.exe):</strong> Double-click the downloaded file. Follow the install wizard. PolarChat will be added to your Start Menu.</p>
                <p><strong className="text-polar-text">Portable:</strong> No installation needed — just run the .exe directly from anywhere.</p>
                <p className="text-xs text-polar-text-dim">Requires Windows 10 or later. SmartScreen may warn you the first time — click "More info" then "Run anyway".</p>
              </div>
            </details>

            {/* macOS */}
            <details className="polar-card group" open={platform === 'mac'}>
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <Apple className="w-5 h-5 text-gray-400" />
                  <span className="font-semibold">macOS</span>
                </div>
                <ChevronRight className="w-4 h-4 text-polar-text-dim transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-4 text-sm text-polar-text-muted space-y-2">
                <p><strong className="text-polar-text">.dmg:</strong> Open the DMG, drag PolarChat to your Applications folder. Done.</p>
                <p><strong className="text-polar-text">Apple Silicon (M1/M2/M3):</strong> Download the arm64 version for best performance.</p>
                <p className="text-xs text-polar-text-dim">Requires macOS 11 (Big Sur) or later. If Gatekeeper blocks the app: System Preferences → Privacy & Security → "Open Anyway".</p>
              </div>
            </details>

            {/* Linux */}
            <details className="polar-card group" open={platform === 'linux'}>
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-orange-400" />
                  <span className="font-semibold">Linux</span>
                </div>
                <ChevronRight className="w-4 h-4 text-polar-text-dim transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-4 text-sm text-polar-text-muted space-y-3">
                <div>
                  <p><strong className="text-polar-text">AppImage (recommended):</strong></p>
                  <code className="block mt-1 px-3 py-2 rounded bg-polar-input text-xs font-mono">
                    chmod +x PolarChat-*.AppImage && ./PolarChat-*.AppImage
                  </code>
                </div>
                <div>
                  <p><strong className="text-polar-text">Debian/Ubuntu (.deb):</strong></p>
                  <code className="block mt-1 px-3 py-2 rounded bg-polar-input text-xs font-mono">
                    sudo dpkg -i polarchat-*.deb
                  </code>
                </div>
                <div>
                  <p><strong className="text-polar-text">Fedora/RHEL (.rpm):</strong></p>
                  <code className="block mt-1 px-3 py-2 rounded bg-polar-input text-xs font-mono">
                    sudo rpm -i polarchat-*.rpm
                  </code>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-polar-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-polar-text-dim">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>PolarChat — Your privacy, non-negotiable.</span>
          </div>
          <a
            href={GITHUB_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-polar-text transition-colors flex items-center gap-1"
          >
            All releases
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
