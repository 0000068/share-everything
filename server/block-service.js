const {
  createAsyncLimiter,
  encodeNotionPathId,
  normalizePositiveNumber,
} = require("./notion-config");
const {
  createNotionRequestError,
  parseNotionPaginationResponse,
  requestNotionJson,
} = require("./notion-client");

const MAX_BLOCK_RECURSION_DEPTH = 10;
const MAX_PAGINATION_ROUNDS = 50;
const NOTION_BLOCK_CHILD_CONCURRENCY = normalizePositiveNumber(process.env.NOTION_BLOCK_CHILD_CONCURRENCY, 4);
// Two-layer concurrency control intentionally shares the same configured value:
// (1) at each recursion depth we fan out up to `BLOCK_CHILD_WORKER_COUNT`
// parallel child fetches, and (2) the `runWithBlockChildConcurrency` limiter
// caps total in-flight Notion requests across all depths to the same number.
// The limiter is what enforces the upstream API rate ceiling; the worker count
// just shapes the recursion tree so siblings can interleave instead of
// strictly sequencing.
// Math.max(1, Math.trunc(...)) is intentional: normalizePositiveNumber accepts
// 0 < x < 1 as positive, but Math.trunc would round that down to 0. The
// Math.max(1, ...) floor ensures at least one worker even under sub-integer
// env overrides.
const BLOCK_CHILD_WORKER_COUNT = Math.max(1, Math.trunc(NOTION_BLOCK_CHILD_CONCURRENCY));
const NOTION_BLOCK_TOTAL_LIMIT = Math.max(
  1,
  Math.trunc(normalizePositiveNumber(process.env.NOTION_BLOCK_TOTAL_LIMIT, 2_000)),
);
const runWithBlockChildConcurrency = createAsyncLimiter(NOTION_BLOCK_CHILD_CONCURRENCY);

function createBlockFetchContext() {
  return {
    didWarnTotalLimit: false,
    remainingBlocks: NOTION_BLOCK_TOTAL_LIMIT,
  };
}

function createIncompleteContentError(message, resourceType = "block") {
  return createNotionRequestError(message, {
    status: 502,
    code: "notion_content_incomplete",
    resourceType,
  });
}

function warnBlockTotalLimit(context, blockId) {
  if (context.didWarnTotalLimit) {
    return;
  }

  context.didWarnTotalLimit = true;
  console.warn(
    `Block children total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) exhausted, ` +
    `stopping for block: ${blockId}`,
  );
}

async function fetchNestedBlockChildren(blocks, depth, context, requestOptions) {
  let nextIndex = 0;
  const workerCount = Math.min(BLOCK_CHILD_WORKER_COUNT, blocks.length);

  async function runWorker() {
    while (nextIndex < blocks.length && context.remainingBlocks > 0) {
      const block = blocks[nextIndex];
      nextIndex += 1;
      if (!block?.has_children) continue;

      if (context.remainingBlocks <= 0) {
        warnBlockTotalLimit(context, block.id);
        return;
      }

      block.children = await fetchAllBlockChildren(
        block.id,
        depth + 1,
        context,
        requestOptions,
      );
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));

  if (
    context.remainingBlocks <= 0 &&
    blocks.slice(nextIndex).some((block) => block?.has_children)
  ) {
    warnBlockTotalLimit(context, blocks[nextIndex]?.id || blocks[blocks.length - 1]?.id || "");
    throw createIncompleteContentError(
      `Block children exceeded total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) while loading nested blocks`,
    );
  }
}

async function fetchAllBlockChildren(
  blockId,
  depth = 0,
  context = createBlockFetchContext(),
  requestOptions = {},
) {
  if (depth >= MAX_BLOCK_RECURSION_DEPTH) {
    throw createIncompleteContentError(
      `Block children recursion exceeded ${MAX_BLOCK_RECURSION_DEPTH} levels for block: ${blockId}`,
    );
  }

  if (context.remainingBlocks <= 0) {
    warnBlockTotalLimit(context, blockId);
    throw createIncompleteContentError(
      `Block children exceeded total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) for block: ${blockId}`,
    );
  }

  const blocks = [];
  let startCursor = null;
  let rounds = 0;
  const seenCursors = new Set();

  do {
    if (context.remainingBlocks <= 0) {
      warnBlockTotalLimit(context, blockId);
      throw createIncompleteContentError(
        `Block children exceeded total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) for block: ${blockId}`,
      );
    }

    if (++rounds > MAX_PAGINATION_ROUNDS) {
      throw createIncompleteContentError(
        `Block children pagination exceeded ${MAX_PAGINATION_ROUNDS} rounds for block: ${blockId}`,
      );
    }

    const query = new URLSearchParams({ page_size: "100" });
    if (startCursor) {
      query.set("start_cursor", startCursor);
    }

    const data = await runWithBlockChildConcurrency(() => (
      requestNotionJson(
        `/blocks/${encodeNotionPathId(blockId)}/children?${query.toString()}`,
        requestOptions,
      )
    ));
    const {
      results,
      nextCursor,
    } = parseNotionPaginationResponse(data, { resourceType: "block" });
    const acceptedBlocks = results.slice(0, context.remainingBlocks);
    blocks.push(...acceptedBlocks);
    context.remainingBlocks -= acceptedBlocks.length;

    if (acceptedBlocks.length < results.length) {
      warnBlockTotalLimit(context, blockId);
      throw createIncompleteContentError(
        `Block children exceeded total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) for block: ${blockId}`,
      );
    }

    if (nextCursor && seenCursors.has(nextCursor)) {
      throw createNotionRequestError("Notion API repeated a block pagination cursor", {
        status: 502,
        code: "notion_invalid_response",
        resourceType: "block",
      });
    }
    if (nextCursor) seenCursors.add(nextCursor);
    startCursor = nextCursor;
    if (startCursor && context.remainingBlocks <= 0) {
      warnBlockTotalLimit(context, blockId);
      throw createIncompleteContentError(
        `Block children exceeded total block budget (${NOTION_BLOCK_TOTAL_LIMIT}) for block: ${blockId}`,
      );
    }
  } while (startCursor);

  await fetchNestedBlockChildren(blocks, depth, context, requestOptions);

  return blocks;
}

module.exports = {
  MAX_BLOCK_RECURSION_DEPTH,
  MAX_PAGINATION_ROUNDS,
  NOTION_BLOCK_CHILD_CONCURRENCY,
  NOTION_BLOCK_TOTAL_LIMIT,
  fetchAllBlockChildren,
  runWithBlockChildConcurrency,
};
