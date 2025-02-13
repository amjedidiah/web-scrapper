export interface LinkEntity {
  id: string;
  url: string;
  anchor_text: string;
  score: number;
  keywords: string; // Stored as JSON string in SQLite
  parent_url: string;
  type: "document" | "contact" | "general";
  crawled_at: string;
}

export interface LinkQueryParams {
  minScore?: string;
  keyword?: string;
  parentUrl?: string;
}
