import type { MetadataRoute } from "next";

// Block search-engine indexing of the unlisted application-form page and the admin
// surface. The form is shared with applicants directly via URL — it shouldn't
// appear in Google.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/cause-applications", "/api/"],
    },
  };
}
