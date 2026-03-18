/** step kind → 自动注入的工具列表 */
export const TOOL_ROUTES: Record<string, string[]> = {
  analyze:       ['web_search', 'url_fetch'],
  crawl:         ['web_search', 'url_fetch'],
  write_article: ['web_search', 'url_fetch'],
  draft_tweet:   ['web_search'],
  draft_social:  ['web_search'],
  roundtable:    ['web_search'],
};
