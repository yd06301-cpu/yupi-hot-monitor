-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hotspot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "isReal" BOOLEAN NOT NULL DEFAULT true,
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "relevanceReason" TEXT,
    "keywordMentioned" BOOLEAN,
    "importance" TEXT NOT NULL DEFAULT 'low',
    "summary" TEXT,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "retweetCount" INTEGER,
    "replyCount" INTEGER,
    "commentCount" INTEGER,
    "quoteCount" INTEGER,
    "danmakuCount" INTEGER,
    "authorName" TEXT,
    "authorUsername" TEXT,
    "authorAvatar" TEXT,
    "authorFollowers" INTEGER,
    "authorVerified" BOOLEAN,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keywordId" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'article',
    "fullContent" TEXT,
    "fullContentFetched" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Hotspot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hotspot" ("authorAvatar", "authorFollowers", "authorName", "authorUsername", "authorVerified", "commentCount", "content", "createdAt", "danmakuCount", "id", "importance", "isReal", "keywordId", "keywordMentioned", "likeCount", "publishedAt", "quoteCount", "relevance", "relevanceReason", "replyCount", "retweetCount", "source", "sourceId", "summary", "title", "url", "viewCount") SELECT "authorAvatar", "authorFollowers", "authorName", "authorUsername", "authorVerified", "commentCount", "content", "createdAt", "danmakuCount", "id", "importance", "isReal", "keywordId", "keywordMentioned", "likeCount", "publishedAt", "quoteCount", "relevance", "relevanceReason", "replyCount", "retweetCount", "source", "sourceId", "summary", "title", "url", "viewCount" FROM "Hotspot";
DROP TABLE "Hotspot";
ALTER TABLE "new_Hotspot" RENAME TO "Hotspot";
CREATE UNIQUE INDEX "Hotspot_url_source_key" ON "Hotspot"("url", "source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
