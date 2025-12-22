import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Public routes only. (Admin/API intentionally excluded.)
  return [
    {
      url: "/",
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: "/suggestions",
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.7,
    },
  ];
}
