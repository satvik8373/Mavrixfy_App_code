const baseUrl = process.env.YOUTUBE_MUSIC_API_URL || "http://localhost:8000";

const checks = [
  ["/healthz", "health"],
  ["/search?q=Kesariya&filter=songs&limit=3", "song search"],
  ["/search?q=Arijit%20Singh&filter=artists&limit=3", "artist search"],
];

for (const [path, label] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  const json = await response.json();
  const size = Array.isArray(json) ? json.length : Object.keys(json || {}).length;
  console.log(`${label}: ok (${size})`);
}
