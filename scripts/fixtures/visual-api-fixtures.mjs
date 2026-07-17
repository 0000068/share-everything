export const VISUAL_POST_ID = "123456781234123412341234567890ab";

const categoryColor = Object.freeze({
  bg: "rgba(59, 130, 246, 0.14)",
  border: "rgba(96, 165, 250, 0.34)",
  color: "#bfdbfe",
});

const posts = [
  {
    id: VISUAL_POST_ID,
    title: "从第一原则改善加载体验",
    excerpt: "一份覆盖关键请求、缓存边界与用户感知速度的完整示例文章。",
    category: "engineering",
    categoryLabel: "工程实践",
    categoryColor,
    date: "2026-07-17",
    readTime: "8 分钟",
    coverImage: null,
    coverEmoji: "⚡",
    coverGradient: "linear-gradient(135deg, #172554, #0f766e)",
    tags: ["性能", "架构"],
  },
  {
    id: "223456781234123412341234567890ab",
    title: "把发布门禁变成可执行的质量标准",
    excerpt: "用行为契约保护正确性、无障碍和跨平台交付。",
    category: "quality",
    categoryLabel: "质量工程",
    categoryColor,
    date: "2026-07-16",
    readTime: "6 分钟",
    coverImage: null,
    coverEmoji: "✓",
    coverGradient: "linear-gradient(135deg, #312e81, #155e75)",
    tags: ["测试"],
  },
  {
    id: "323456781234123412341234567890ab",
    title: "公开内容系统的安全边界",
    excerpt: "公开数据库仍需要输入限制、超时、缓存与资源预算。",
    category: "security",
    categoryLabel: "安全边界",
    categoryColor,
    date: "2026-07-15",
    readTime: "5 分钟",
    coverImage: null,
    coverEmoji: "🔐",
    coverGradient: "linear-gradient(135deg, #3f1d2e, #164e63)",
    tags: ["安全"],
  },
];

const categories = [
  {
    name: "engineering",
    label: "工程实践",
    categoryColor,
    coverGradient: "linear-gradient(135deg, #172554, #0f766e)",
  },
  {
    name: "quality",
    label: "质量工程",
    categoryColor,
    coverGradient: "linear-gradient(135deg, #312e81, #155e75)",
  },
];

const post = {
  ...posts[0],
  content: [
    { type: "paragraph", text: "性能优化首先要回答：用户究竟在等待哪一条关键路径？" },
    { type: "callout", icon: "💡", text: "先测量，再改变；每项优化都应对应一个可验证的因果机制。", children: [] },
    { type: "heading_1", text: "建立可靠的加载基线", anchorId: "baseline" },
    { type: "paragraph", text: "记录冷缓存与热缓存、桌面与移动网络，并分别观察首屏内容和交互可用时间。" },
    { type: "bulleted_list_item", text: "关键请求是否尽早发出", children: [] },
    { type: "bulleted_list_item", text: "共享缓存是否真正命中", children: [] },
    { type: "bulleted_list_item", text: "取消信号是否贯穿完整请求生命周期", children: [] },
    { type: "heading_1", text: "用门禁防止回归", anchorId: "contracts" },
    { type: "quote", text: "最高质量不是一次性审计，而是让同类缺陷无法再次静默进入主分支。", children: [] },
    { type: "code", language: "javascript", text: "const outcome = await measure({ coldCache: true });", children: [] },
    { type: "to_do", text: "验证移动端首屏和完整文章布局", checked: true, children: [] },
    { type: "to_do", text: "在发布后持续观察真实用户指标", checked: false, children: [] },
  ],
};

export function getVisualApiFixture(url) {
  if (url.pathname === "/api/posts-data") {
    return {
      currentPage: 1,
      total: posts.length,
      totalPages: 1,
      categories,
      results: posts,
    };
  }
  if (url.pathname === "/api/post-data" && url.searchParams.get("id") === VISUAL_POST_ID) {
    return post;
  }
  return null;
}
