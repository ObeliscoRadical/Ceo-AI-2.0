function ensureMetaByName(name) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  return meta;
}

function ensureMetaByProperty(property) {
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  return meta;
}

function canonicalHrefOf(canonicalPath) {
  if (!canonicalPath) return window.location.origin + window.location.pathname;
  if (/^https?:\/\//i.test(canonicalPath)) return canonicalPath;
  const normalizedPath = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
  return `${window.location.origin}${normalizedPath}`;
}

export function applyPublicSeo({ title, description, canonicalPath, ogType = "website" }) {
  document.documentElement.lang = "pt-PT";
  if (title) document.title = title;

  const canonicalHref = canonicalHrefOf(canonicalPath || window.location.pathname);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", canonicalHref);

  ensureMetaByName("robots").setAttribute("content", "index, follow, max-image-preview:large");
  ensureMetaByProperty("og:site_name").setAttribute("content", "CEO AI 2.0");
  ensureMetaByProperty("og:type").setAttribute("content", ogType);
  ensureMetaByProperty("og:url").setAttribute("content", canonicalHref);
  ensureMetaByName("twitter:card").setAttribute("content", "summary_large_image");

  if (description) {
    ensureMetaByName("description").setAttribute("content", description);
    ensureMetaByProperty("og:description").setAttribute("content", description);
    ensureMetaByName("twitter:description").setAttribute("content", description);
  }

  if (title) {
    ensureMetaByProperty("og:title").setAttribute("content", title);
    ensureMetaByName("twitter:title").setAttribute("content", title);
  }

  const measurementId = process.env.REACT_APP_GA4_MEASUREMENT_ID;
  if (!measurementId || document.querySelector('script[data-testid="ga4-script"]')) return;
  const firstScript = document.createElement("script");
  firstScript.async = true;
  firstScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  firstScript.setAttribute("data-testid", "ga4-script");
  document.head.appendChild(firstScript);

  const secondScript = document.createElement("script");
  secondScript.setAttribute("data-testid", "ga4-config-script");
  secondScript.innerHTML = `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${measurementId}');`;
  document.head.appendChild(secondScript);
}