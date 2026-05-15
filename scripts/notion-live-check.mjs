import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFile } from "./lib/dotenv.mjs";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.env.NOTION_LIVE_STRICT === "1";

function failOrSkip(message) {
  if (strict) {
    console.error(message);
    process.exitCode = 1;
    return;
  }

  console.log(`${message} Skipping because NOTION_LIVE_STRICT is not set.`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarizeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || "Unknown error",
    status: error?.status,
    code: error?.code,
    notionCode: error?.notionCode,
    resourceType: error?.resourceType,
  };
}

await loadDotEnvFile(path.join(rootDir, ".env"));

if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
  failOrSkip("Notion live check requires NOTION_TOKEN and NOTION_DATABASE_ID.");
} else {
  try {
    const {
      fetchPublicPost,
      queryPublicPosts,
    } = require("../server/notion-server");

    const listPayload = await queryPublicPosts({ page: 1 });
    assert(Array.isArray(listPayload?.results), "Expected /api/posts-data list results to be an array");
    assert(Array.isArray(listPayload?.categories), "Expected /api/posts-data categories to be an array");
    assert(Number.isInteger(listPayload?.currentPage), "Expected currentPage to be an integer");
    assert(Number.isInteger(listPayload?.totalPages), "Expected totalPages to be an integer");

    const categorizedPost = listPayload.results.find((post) => post?.category);
    if (categorizedPost) {
      assert(categorizedPost.categoryLabel, "Expected categorized post to include categoryLabel");
      assert(categorizedPost.categoryColor, "Expected categorized post to include categoryColor");
      assert(categorizedPost.coverGradient, "Expected categorized post to include coverGradient");
    }

    const firstPost = listPayload.results[0];
    if (firstPost?.id && process.env.NOTION_LIVE_FETCH_POST !== "0") {
      const detailPayload = await fetchPublicPost(firstPost.id);
      assert(detailPayload?.id, "Expected first post detail to include an id");
      assert(detailPayload?.title, "Expected first post detail to include a title");
      assert(Array.isArray(detailPayload?.content), "Expected first post detail content to be an array");
    }

    console.log(JSON.stringify({
      ok: true,
      posts: listPayload.results.length,
      categories: listPayload.categories.length,
      fetchedPostDetail: Boolean(firstPost?.id && process.env.NOTION_LIVE_FETCH_POST !== "0"),
    }));
  } catch (error) {
    console.error("Notion live check failed:");
    console.error(JSON.stringify(summarizeError(error), null, 2));
    process.exitCode = 1;
  }
}
