import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/events", "/suggestions"],
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: "/sitemap.xml",
  };
}
