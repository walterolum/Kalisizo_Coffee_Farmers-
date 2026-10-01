export type ApiLocation = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  subCounty: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  isMainBranch: boolean;
};

export type ApiSocialProfile = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  description: string | null;
  displayOrder: number;
};

export type ApiSettings = {
  mission: string | null;
  vision: string | null;
  taglines: string[];
  phoneNumbers: string[];
  officialEmail: string | null;
  address: string | null;
  logoUrl: string | null;
  socials: ApiSocialProfile[];
  updatedAt: string;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const bust = url.includes("?") ? "&_t=" : "?_t=";
    const fullUrl = `${url}${bust}${Date.now()}`;
    const res = await fetch(fullUrl, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchLocations(): Promise<ApiLocation[] | null> {
  return getJson<ApiLocation[]>("/api/v1/locations");
}

export function fetchSettings(): Promise<ApiSettings | null> {
  return getJson<ApiSettings>("/api/v1/settings");
}

export type ApiHero = {
  id: string;
  headlinePrefix: string;
  headlineHighlight: string;
  headlineSuffix: string;
  subtitle: string;
  badges: string[];
  todayItems: {
    icon: string;
    title: string;
    sub: string;
  }[];
  backgroundImage: string | null;
};

export function fetchHero(): Promise<ApiHero | null> {
  return getJson<ApiHero>("/api/v1/hero");
}

export type ApiService = {
  id: string;
  title: string;
  tagline: string;
  points: string[];
  details: string[];
  icon: string | null;
  accent: string | null;
  ring: string | null;
  displayOrder: number;
};

export function fetchServices(): Promise<ApiService[] | null> {
  return getJson<ApiService[]>("/api/v1/services");
}

export type ApiFaq = {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
};

export function fetchFaq(): Promise<ApiFaq[] | null> {
  return getJson<ApiFaq[]>("/api/v1/faq");
}

export type ApiStory = {
  id: string;
  title: string;
  quote: string | null;
  description: string;
  metric: string | null;
  imageUrl: string | null;
  displayOrder: number;
};

export function fetchStories(): Promise<ApiStory[] | null> {
  return getJson<ApiStory[]>("/api/v1/stories");
}