const allowedHosts = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
]);

export function parseXPostUrl(value: string): {
  postId: string;
  canonicalUrl: string;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_x_post_url");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    parts.length !== 3 ||
    parts[1] !== "status" ||
    !/^\d+$/.test(parts[2])
  ) {
    throw new Error("invalid_x_post_url");
  }
  return {
    postId: parts[2],
    canonicalUrl: `https://x.com/i/status/${parts[2]}`,
  };
}
