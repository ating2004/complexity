import { z } from "zod";

import type { LanguageModel } from "@/entrypoints/services/externals/cplx-api/remote-resources/pplx-language-models/types";

export const PplxUserSettingsApiResponseSchema = z.object({
  default_image_generation_model: z.string(),
  subscription_status: z.enum(["active", "trialing", "none"]).optional(),
  gpt4_limit: z.number(),
  create_limit: z.number(),
});

export type PplxUserSettingsApiResponse = z.infer<
  typeof PplxUserSettingsApiResponseSchema
>;

export const PplxRateLimitsApiResponseSchema = z.object({
  remaining_pro: z.number(),
  remaining_research: z.number(),
  remaining_labs: z.number(),
  model_specific_limits: z.record(z.string(), z.number()),
});

export type PplxRateLimitsApiResponse = z.infer<
  typeof PplxRateLimitsApiResponseSchema
>;

export type PplxAuthSessionApiResponse = {
  user: {
    name: string;
    email: string;
    image: string;
    id: string;
    username: string;
    subscription_status?: string;
    subscription_source: string;
    payment_tier: string;
    subscription_tier: string;
    org_uuid: string;
  };
};

export const PplxOrgSettingsApiResponseSchema = z.object({
  is_in_organization: z.boolean(),
});

export type PplxOrgSettingsApiResponse = z.infer<
  typeof PplxOrgSettingsApiResponseSchema
>;

export const SpaceSchema = z.object({
  title: z.string(),
  uuid: z.string(),
  instructions: z.string(),
  slug: z.string(),
  emoji: z.string().nullable().optional(),
  description: z.string(),
  access: z.number(),
  model_selection: (z.string() as z.ZodType<LanguageModel["code"]>)
    .nullable()
    .optional(),
  enable_web_by_default: z.boolean().nullable(),
  updated_datetime: z.string(),
});

export const SpacesApiResponseSchema = z.array(SpaceSchema);

export type Space = z.infer<typeof SpaceSchema>;

export const SpaceDetailsSchema = SpaceSchema.extend({
  file_count: z.number().nullable(),
  focused_web_config: z
    .object({
      link_configs: z.array(
        z.object({
          link: z.string(),
        }),
      ),
    })
    .nullable(),
});

export type SpaceDetails = z.infer<typeof SpaceDetailsSchema>;

export const SpaceFilesApiResponseSchema = z.object({
  files: z.array(
    z.object({
      filename: z.string(),
      file_title: z.string().nullable().optional(),
      file_description: z.string().nullable().optional(),
      file_uuid: z.string(),
      file_s3_url: z.string().nullable(),
      uploaded_by: z.string(),
      file_size: z.number(),
      time_created: z.string(),
      error: z.string().nullable(),
    }),
  ),
  num_total_files: z.number(),
});

export type SpaceFilesApiResponse = z.infer<typeof SpaceFilesApiResponseSchema>;

export const SpaceFileDownloadUrlApiResponseSchema = z.object({
  file_url: z.string(),
});

export type SpaceFileDownloadUrlApiResponse = z.infer<
  typeof SpaceFileDownloadUrlApiResponseSchema
>;

const ThreadMessageAssetSchema = z.object({
  kind: z.enum(["image", "file"]),
  name: z.string(),
  url: z.string(),
  /** Set when an image was downloaded to sit next to an exported document. */
  localPath: z.string().optional(),
});

export type ThreadMessageAsset = z.infer<typeof ThreadMessageAssetSchema>;

const FILE_ASSET_KEYS = [
  "pdf_file",
  "doc_file",
  "docx_file",
  "xlsx_file",
  "slide_file",
];

/**
 * Generated images and files aren't part of the answer text: they sit in the
 * round's tool steps, under
 * `content.workflow_items[].payload.sources_payload.assets`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAssets(steps: any[]): ThreadMessageAsset[] {
  const assets = new Map<string, ThreadMessageAsset>();

  for (const step of steps) {
    const items = step?.content?.workflow_items;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const stepAssets = item?.payload?.sources_payload?.assets;
      if (!Array.isArray(stepAssets)) continue;

      for (const asset of stepAssets) {
        const image = asset?.generated_image;
        if (typeof image?.url === "string") {
          assets.set(image.url, {
            kind: "image",
            name: "image",
            url: image.url,
          });
        }

        for (const key of FILE_ASSET_KEYS) {
          const file = asset?.[key];
          if (typeof file?.url !== "string") continue;
          assets.set(file.url, {
            kind: "file",
            name: typeof file.filename === "string" ? file.filename : "file",
            url: file.url,
          });
        }
      }
    }
  }

  return [...assets.values()];
}

export const ThreadMessageTextSchema = z.object({
  answer: z.string(),
  assets: z.array(ThreadMessageAssetSchema).optional().catch(undefined),
  web_results: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        snippet: z.string().catch(""),
      }),
    )
    .catch([]),
});

export const ThreadMessageApiResponseSchema = z.object({
  query_str: z.string(),
  text: z
    .string()
    .transform((value) => {
      const parsed = JSON.parse(value);
      return {
        ...JSON.parse(parsed[parsed.length - 1].content.answer),
        assets: extractAssets(parsed),
      };
    })
    .pipe(ThreadMessageTextSchema),
  backend_uuid: z.string(),
  // Signed afresh on every request, unlike the links in `text`.
  media_items: z
    .array(z.object({ url: z.string() }))
    .optional()
    .catch(undefined),
  author_image: z.string().nullable().catch(null),
  author_username: z.string().nullable().catch(null),
  thread_url_slug: z.string().catch(""),
  display_model: z.string().catch("") as z.ZodType<LanguageModel["code"]>,
});

export type ThreadMessageApiResponse = z.infer<
  typeof ThreadMessageApiResponseSchema
>;

export const ThreadApiResponseSchema = z.object({
  entries: z.array(ThreadMessageApiResponseSchema),
  has_next_page: z.boolean(),
  next_cursor: z.string().nullable(),
});

export type ThreadApiResponse = z.infer<typeof ThreadApiResponseSchema>;

export const ThreadSearchResponseApiSchema = z.object({
  thread_number: z.number(),
  last_query_datetime: z.string(),
  mode: z.string(),
  context_uuid: z.string(),
  uuid: z.string(),
  slug: z.string(),
  expiry_time: z.string().nullable(),
  title: z.string(),
  first_answer: z.string(),
  thread_access: z.number(),
  query_count: z.number(),
  search_focus: z.string(),
  read_write_token: z.string().nullable().optional(),
  collection: SpaceSchema.pick({
    uuid: true,
    title: true,
    slug: true,
    emoji: true,
  }).optional(),
  has_next_page: z.boolean(),
});

export type ThreadSearchResponseApi = z.infer<
  typeof ThreadSearchResponseApiSchema
>;

export const ThreadsSearchApiResponseSchema = z.array(
  ThreadSearchResponseApiSchema,
);

export type ThreadsSearchApiResponse = z.infer<
  typeof ThreadsSearchApiResponseSchema
>;

export type ThreadsSearchPayload = {
  searchValue?: string;
  limit?: number;
  offset?: number;
  ascending?: boolean;
  threadTypeFilter?: "research" | "labs";
  withTemporaryThreads?: boolean;
  querySourceFilter?: "comet";
};

export const SpaceThreadsApiResponseSchema = ThreadsSearchApiResponseSchema;

export type SpaceThreadsApiResponse = z.infer<
  typeof SpaceThreadsApiResponseSchema
>;

export const PplxAiProfileApiResponseSchema = z.object({
  has_profile: z.boolean(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  language: z.string().nullable(),
  response_language: z.string().nullable(),
  location_lat: z.string().nullable(),
  location_lng: z.string().nullable(),
  disabled: z.boolean(),
});

export type PplxAiProfileApiResponse = z.infer<
  typeof PplxAiProfileApiResponseSchema
>;
