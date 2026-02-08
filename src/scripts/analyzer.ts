import * as csstree from 'css-tree';
import bcd from '@mdn/browser-compat-data';

type BrowserKey = 'chrome' | 'firefox' | 'safari';

type FeatureType = 'property' | 'property-value' | 'selector';

interface FeatureUsage {
  key: string;
  type: FeatureType;
  property?: string;
  value?: string;
  valueKind?: 'identifier' | 'function';
  label: string;
}

interface AnalysisResult {
  features: FeatureUsage[];
  minimumVersions: Record<BrowserKey, string | null>;
  latestVersions: Record<BrowserKey, string | null>;
  unsupported: Partial<Record<BrowserKey, string[]>>;
  reasons: Record<BrowserKey, string>;
}

type CompatStatement = {
  version_added: string | boolean | null;
  version_removed?: string | boolean | null;
  flags?: unknown;
  prefix?: string;
  alternative_name?: string;
};

type CompatData = {
  __compat?: {
    support: Partial<Record<BrowserKey, CompatStatement | CompatStatement[]>>;
  };
} & Record<string, unknown>;

type BrowserRelease = {
  status?: string;
  release_date?: string;
};

const SUPPORTED_BROWSERS: BrowserKey[] = ['chrome', 'firefox', 'safari'];

export function analyzeCssSupport(css: string): AnalysisResult {
  const latestVersions = getLatestVersions();

  if (!css.trim()) {
    return {
      features: [],
      minimumVersions: { chrome: null, firefox: null, safari: null },
      latestVersions,
      unsupported: {},
      reasons: {
        chrome: 'Добавьте CSS-код для анализа',
        firefox: 'Добавьте CSS-код для анализа',
        safari: 'Добавьте CSS-код для анализа'
      }
    };
  }

  const featureMap = collectFeatures(css);

  const minimum: Record<BrowserKey, number> = {
    chrome: 0,
    firefox: 0,
    safari: 0
  };

  const unsupported: Partial<Record<BrowserKey, string[]>> = {};
  const limitingFeature: Partial<Record<BrowserKey, string>> = {};
  const limitingVersion: Partial<Record<BrowserKey, number>> = {};

  featureMap.forEach((feature) => {
    const compat = resolveFeatureCompat(feature);

    if (!compat?.__compat?.support) {
      return;
    }

    SUPPORTED_BROWSERS.forEach((browser) => {
      const supportInfo = compat.__compat?.support[browser];
      const statement = pickSupportStatement(supportInfo);

      if (!statement) {
        return;
      }

      const version = normalizeVersion(statement.version_added);

      if (version === null) {
        unsupported[browser] ??= [];
        unsupported[browser]?.push(feature.label);
        return;
      }

      if (version >= minimum[browser]) {
        minimum[browser] = version;
        limitingFeature[browser] = feature.label;
        limitingVersion[browser] = version;
      }
    });
  });

  const reasons: Record<BrowserKey, string> = {
    chrome: buildReason('chrome', unsupported, limitingFeature, limitingVersion),
    firefox: buildReason('firefox', unsupported, limitingFeature, limitingVersion),
    safari: buildReason('safari', unsupported, limitingFeature, limitingVersion)
  };

  return {
    features: Array.from(featureMap.values()),
    minimumVersions: {
      chrome: formatVersion(minimum.chrome, unsupported.chrome),
      firefox: formatVersion(minimum.firefox, unsupported.firefox),
      safari: formatVersion(minimum.safari, unsupported.safari)
    },
    latestVersions,
    unsupported,
    reasons
  };
}

function buildReason(
  browser: BrowserKey,
  unsupported: Partial<Record<BrowserKey, string[]>>,
  limitingFeature: Partial<Record<BrowserKey, string>>,
  limitingVersion: Partial<Record<BrowserKey, number>>
): string {
  const unsupportedList = unsupported[browser];
  if (unsupportedList?.length) {
    if (unsupportedList.length === 1) {
      return `Не поддерживается: ${unsupportedList[0]}`;
    }

    return `Не поддерживается: ${unsupportedList[0]} (+${unsupportedList.length - 1} ещё)`;
  }

  const feature = limitingFeature[browser];
  const version = limitingVersion[browser];

  if (feature && version !== undefined) {
    const formatted = Number.isInteger(version) ? String(version) : version.toFixed(1);
    return `Ограничивает: ${feature} (с версии ${formatted})`;
  }

  return 'Ограничивающих фич не найдено';
}

function collectFeatures(css: string): Map<string, FeatureUsage> {
  const features = new Map<string, FeatureUsage>();

  let ast: unknown;
  try {
    ast = csstree.parse(css, {
      parseCustomProperty: true,
      positions: false
    });
  } catch {
    return features;
  }

  csstree.walk(ast as never, {
    visit: 'Declaration',
    enter(node: any) {
      if (node.type !== 'Declaration') {
        return;
      }

      const prop = node.property.trim().toLowerCase();
      if (!prop) {
        return;
      }

      addFeature(features, {
        key: `property:${prop}`,
        type: 'property',
        property: prop,
        label: prop
      });

      csstree.walk(node.value, {
        enter(valueNode: any) {
          if (valueNode.type === 'Identifier') {
            const value = String(valueNode.name).toLowerCase();
            addFeature(features, {
              key: `property-value:${prop}:${value}`,
              type: 'property-value',
              property: prop,
              value,
              valueKind: 'identifier',
              label: `${prop}: ${value}`
            });
          }

          if (valueNode.type === 'Function') {
            const value = String(valueNode.name).toLowerCase();
            addFeature(features, {
              key: `property-value:${prop}:${value}()`,
              type: 'property-value',
              property: prop,
              value,
              valueKind: 'function',
              label: `${prop}: ${value}()`
            });
          }
        }
      });
    }
  });

  csstree.walk(ast as never, {
    enter(node: any) {
      if (node.type !== 'NestingSelector') {
        return;
      }

      addFeature(features, {
        key: 'selector:nesting',
        type: 'selector',
        label: 'CSS nesting'
      });
    }
  });

  return features;
}

function addFeature(features: Map<string, FeatureUsage>, feature: FeatureUsage) {
  if (!features.has(feature.key)) {
    features.set(feature.key, feature);
  }
}

function resolveFeatureCompat(feature: FeatureUsage): CompatData | null {
  const cssCompat = bcd.css as Record<string, unknown>;

  if (feature.type === 'property' && feature.property) {
    return ((cssCompat.properties as Record<string, CompatData>)[feature.property] ?? null) as CompatData | null;
  }

  if (feature.type === 'property-value' && feature.property && feature.value) {
    const property = (cssCompat.properties as Record<string, CompatData>)[feature.property];
    if (!property) {
      return null;
    }

    const candidates = buildValueCandidates(feature.value, feature.valueKind);
    for (const key of candidates) {
      if (property[key] && typeof property[key] === 'object') {
        return property[key] as CompatData;
      }
    }

    return null;
  }

  if (feature.type === 'selector' && feature.key === 'selector:nesting') {
    return ((cssCompat.selectors as Record<string, CompatData>).nesting ?? null) as CompatData | null;
  }

  return null;
}

function buildValueCandidates(value: string, kind?: 'identifier' | 'function'): string[] {
  const normalized = toMdnKey(value);
  const list = new Set<string>([normalized]);

  if (kind === 'function') {
    list.add(`${normalized}()`);
  }

  return [...list];
}

function toMdnKey(value: string): string {
  return value.replace(/\s+/g, '_').replace(/[^a-z0-9\-_%().]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function pickSupportStatement(
  support: CompatStatement | CompatStatement[] | undefined
): CompatStatement | null {
  if (!support) {
    return null;
  }

  if (!Array.isArray(support)) {
    return support;
  }

  const preferred = support.find((entry) => {
    return !entry.flags && !entry.prefix && !entry.alternative_name && entry.version_added;
  });

  return preferred ?? support.find((entry) => entry.version_added !== null) ?? support[0] ?? null;
}

function normalizeVersion(version: string | boolean | null): number | null {
  if (version === true) {
    return 0;
  }

  if (version === false || version === null) {
    return null;
  }

  const cleaned = version.replace(/[^\d.]/g, '');
  if (!cleaned) {
    return null;
  }

  return parseFloat(cleaned);
}

function formatVersion(version: number, unsupported?: string[]): string | null {
  if (unsupported?.length) {
    return null;
  }

  if (version === 0) {
    return 'all';
  }

  return Number.isInteger(version) ? String(version) : version.toFixed(1);
}

function getLatestVersions(): Record<BrowserKey, string | null> {
  const browsers = bcd.browsers as Record<string, { releases?: Record<string, BrowserRelease> }>;

  return {
    chrome: getLatestVersionFromReleases(browsers.chrome?.releases),
    firefox: getLatestVersionFromReleases(browsers.firefox?.releases),
    safari: getLatestVersionFromReleases(browsers.safari?.releases)
  };
}

function getLatestVersionFromReleases(releases: Record<string, BrowserRelease> | undefined): string | null {
  if (!releases) {
    return null;
  }

  const stable = Object.entries(releases)
    .filter(([, data]) => data.status === 'current')
    .map(([version, data]) => ({ version, date: data.release_date ?? '' }));

  if (stable.length > 0) {
    stable.sort((a, b) => compareVersions(a.version, b.version) || a.date.localeCompare(b.date));
    return stable[stable.length - 1]?.version ?? null;
  }

  const all = Object.entries(releases).map(([version, data]) => ({ version, date: data.release_date ?? '' }));
  all.sort((a, b) => a.date.localeCompare(b.date) || compareVersions(a.version, b.version));
  return all[all.length - 1]?.version ?? null;
}

function compareVersions(a: string, b: string): number {
  const aNum = normalizeVersion(a) ?? -1;
  const bNum = normalizeVersion(b) ?? -1;
  return aNum - bNum;
}
