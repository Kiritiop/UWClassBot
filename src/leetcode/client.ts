import axios from 'axios';

const LC_GRAPHQL = 'https://leetcode.com/graphql';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0',
  Referer: 'https://leetcode.com',
};

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

const DIFFICULTY_LEVEL: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 3 };
const LEVEL_DIFFICULTY: Record<number, Difficulty> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export interface LeetCodeProblem {
  questionId: string;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  topicTags: { name: string }[];
  content: string | null;
  isPremium: boolean;
  url: string;
}

interface ProblemListItem {
  stat: {
    frontend_question_id: number;
    question__title_slug: string;
  };
  difficulty: { level: number };
  paid_only: boolean;
}

async function gqlRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await axios.post<{ data: T }>(
    LC_GRAPHQL,
    { query, variables },
    { headers: HEADERS, timeout: 10_000 },
  );
  return res.data.data;
}

async function fetchProblemList(freeOnly = false): Promise<ProblemListItem[]> {
  const res = await axios.get<{ stat_status_pairs: ProblemListItem[] }>(
    'https://leetcode.com/api/problems/all/',
    { headers: HEADERS, timeout: 15_000 },
  );
  const all = res.data.stat_status_pairs;
  return freeOnly ? all.filter((p) => !p.paid_only) : all;
}

// frontendId is passed in from the list API so we display the correct user-facing number
// (the GraphQL questionId field returns an internal backend ID that doesn't match)
async function fetchProblemDetail(titleSlug: string, frontendId: number, isPremium: boolean): Promise<LeetCodeProblem> {
  const data = await gqlRequest<{
    question: {
      title: string;
      titleSlug: string;
      difficulty: string;
      topicTags: { name: string }[];
      content: string | null;
    };
  }>(
    `query problemDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        titleSlug
        difficulty
        topicTags { name }
        content
      }
    }`,
    { titleSlug },
  );
  const q = data.question;
  return {
    questionId: String(frontendId),
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty as Difficulty,
    topicTags: q.topicTags,
    content: q.content,
    isPremium,
    url: `https://leetcode.com/problems/${titleSlug}/`,
  };
}

// Random problems are always free-only — premium ones have no visible description
export async function getRandomProblem(difficulty?: Difficulty): Promise<LeetCodeProblem> {
  const all = await fetchProblemList(true);
  const filtered = difficulty
    ? all.filter((p) => p.difficulty.level === DIFFICULTY_LEVEL[difficulty])
    : all;
  if (filtered.length === 0) throw new Error('No problems found');
  const pick = filtered[Math.floor(Math.random() * filtered.length)];
  return fetchProblemDetail(pick.stat.question__title_slug, pick.stat.frontend_question_id, false);
}

// Returns the newest problem by frontend question ID — includes premium problems
export async function getLatestProblem(): Promise<LeetCodeProblem> {
  const all = await fetchProblemList(false);
  if (all.length === 0) throw new Error('Problem list is empty');
  const latest = all.reduce((a, b) =>
    b.stat.frontend_question_id > a.stat.frontend_question_id ? b : a,
  );
  return fetchProblemDetail(
    latest.stat.question__title_slug,
    latest.stat.frontend_question_id,
    latest.paid_only,
  );
}

// Strips HTML tags from problem content for a plain-text preview
export function stripHtml(html: string | null, maxLen = 350): string {
  if (!html) return 'No description available.';
  const text = html
    .replace(/<pre>[\s\S]*?<\/pre>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

export function buildProblemEmbed(problem: LeetCodeProblem): {
  color: number;
  title: string;
  url: string;
  description: string;
  fields: { name: string; value: string; inline: boolean }[];
} {
  const difficultyColor: Record<Difficulty, number> = {
    Easy: 0x00b8a3,
    Medium: 0xffa116,
    Hard: 0xef4743,
  };

  const tags = problem.topicTags.map((t) => t.name).join(', ') || 'None';
  const premiumNote = problem.isPremium
    ? '🔒 **Premium problem** — description requires a LeetCode Premium subscription.\n\n'
    : '';
  const description = premiumNote + (problem.isPremium ? '' : stripHtml(problem.content));

  return {
    color: difficultyColor[problem.difficulty],
    title: `#${problem.questionId} — ${problem.title}`,
    url: problem.url,
    description,
    fields: [
      { name: 'Difficulty', value: problem.difficulty, inline: true },
      { name: 'Topics', value: tags, inline: true },
    ],
  };
}

// Keep LEVEL_DIFFICULTY exported for potential future use
export { LEVEL_DIFFICULTY };
