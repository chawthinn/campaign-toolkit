import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#0f0e0d',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px 100px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Top-left accent dot */}
        <div
          style={{
            width: 48,
            height: 6,
            background: '#2563eb',
            borderRadius: 99,
            marginBottom: 36,
          }}
        />

        {/* App name */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: '#f0ede8',
            letterSpacing: '-3px',
            lineHeight: 1,
            marginBottom: 20,
          }}
        >
          campaign-toolkit
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 30,
            color: '#9c9890',
            marginBottom: 52,
            letterSpacing: '-0.5px',
          }}
        >
          Jinja / Jinja2 formatter · UTM builder · MoEngage tools
        </div>

        {/* Tag pills */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['Jinja2', 'MoEngage', 'Open Source'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '10px 20px',
                background: '#1e2d4a',
                color: '#60a5fa',
                borderRadius: 8,
                fontSize: 20,
                fontWeight: 500,
                border: '1px solid #2563eb44',
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* Bottom-right attribution */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 100,
            fontSize: 20,
            color: '#3b3f45',
            letterSpacing: '-0.3px',
          }}
        >
          chawthinn.github.io
        </div>
      </div>
    ),
    { ...size },
  );
}
