const {
  createAsyncLimiter,
  encodeNotionPathId,
  normalizePositiveNumber,
} = require("./notion-config");
const { requestNotionJson } = require("./notion-client");

const MAX_BLOCK_RECURSION_DEPTH = 10;
const MAX_PAGINATION_ROUNDS = 50;
const NOTION_BLOCK_CHILD_CONCURRENCY = normalizePositiveNumber(process.env.NOTION_BLOCK_CHILD_CONCURRENCY, 4);
const runWithBlockChildConcurrency = createAsyncLimiter(NOTION_BLOCK_CHILD_CONCURRENCY);

async function fetchAllBlockChildren(blockId, depth = 0) {
  if (depth >= MAX_BLOCK_RECURSION_DEPTH) {
    console.warn(
      `Block children recursion reached max depth (${MAX_BLOCK_RECURSION_DEPTH}), ` +
      `stopping for block: ${blockId}`,
    );
    return [];
  }

  const blocks = [];
  let startCursor = null;
  let rounds = 0;

  do {
    if (++rounds > MAX_PAGINATION_ROUNDS) {
      console.warn(`Block children pagination exceeded ${MAX_PAGINATION_ROUNDS} rounds for block: ${blockId}`);
      break;
    }

    const query = new URLSearchParams({ page_size: "100" });
    if (startCursor) {
      query.set("start_cursor", startCursor);
    }

    const data = await runWithBlockChildConcurrency(() => (
      requestNotionJson(`/blocks/${encodeNotionPathId(blockId)}/children?${query.toString()}`)
    ));
    blocks.push(...data.results);
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor);

  await Promise.all(
    blocks.map(async (block) => {
      if (!block?.has_children) return;
      block.children = await fetchAllBlockChildren(block.id, depth + 1);
    }),
  );

  return blocks;
}

module.exports = {
  MAX_BLOCK_RECURSION_DEPTH,
  MAX_PAGINATION_ROUNDS,
  NOTION_BLOCK_CHILD_CONCURRENCY,
  fetchAllBlockChildren,
  runWithBlockChildConcurrency,
};
