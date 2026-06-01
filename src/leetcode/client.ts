import axios from 'axios';
import { logger } from '../utils/logger';

const LC_GRAPHQL = 'https://leetcode.com/graphql';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0',
  Referer: 'https://leetcode.com',
};

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface LeetCodeProblem {
  questionId: string;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  topicTags: { name: string }[];
  content: string | null;
  url: string;
}

async function gqlRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await axios.post<{ data: T }>(
    LC_GRAPHQL,
    { query, variables },
    { headers: HEADERS, timeout: 10_000 },
  );
  return res.data.data;
}

// Fetches all problems (title slug + difficulty only) — used for random selection
async function fetchAllProblems(difficulty?: Difficulty): Promise<{ stat: { question__title_slug: string }; difficulty: { level: number } }[]> {
  const url = difficulty
    ? `https://leetcode.com/api/problems/${difficulty.toLowerCase()}/`
    : 'https://leetcode.com/api/problems/all/';
  const res = await axios.get<{ stat_status_pairs: { stat: { question__title_slug: string }; difficulty: { level: number }; paid_only: boolean }[] }>(
    url,
    { headers: HEADERS, timeout: 10_000 },
  );
  return res.data.stat_status_pairs.filter((p) => !p.paid_only);
}

async function fetchProblemDetail(titleSlug: string): Promise<LeetCodeProblem> {
  const data = await gqlRequest<{ question: { questionId: string; title: string; titleSlug: string; difficulty: string; topicTags: { name: string }[]; content: string | null } }>(
    `query problemDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        difficulty
        topicTags { name }
        content
      }
    }`,
    { titleSlug },
  );
  return {
    ...data.question,
    difficulty: data.question.difficulty as Difficulty,
    url: `https://leetcode.com/problems/${titleSlug}/`,
  };
}

export async function getRandomProblem(difficulty?: Difficulty): Promise<LeetCodeProblem> {
  const problems = await fetchAllProblems(difficulty);
  if (problems.length === 0) throw new Error('No problems found for the given difficulty');
  const pick = problems[Math.floor(Math.random() * problems.length)];
  return fetchProblemDetail(pick.stat.question__title_slug);
}

export async function getDailyChallenge(): Promise<LeetCodeProblem> {
  const data = await gqlRequest<{ activeDailyCodingChallengeQuestion: { question: { questionId: string; title: string; titleSlug: string; difficulty: string; topicTags: { name: string }[]; content: string | null } } }>(
    `query dailyChallenge {
      activeDailyCodingChallengeQuestion {
        question {
          questionId
          title
          titleSlug
          difficulty
          topicTags { name }
          content
        }
      }
    }`,
  );
  const q = data.activeDailyCodingChallengeQuestion.question;
  return {
    ...q,
    difficulty: q.difficulty as Difficulty,
    url: `https://leetcode.com/problems/${q.titleSlug}/`,
  };
}

// Strips HTML tags from problem content for a plain-text preview
export function stripHtml(html: string | null, maxLen = 300): string {
  if (!html) return 'No description available.';
  const text = html
    .replace(/<pre>[\s\S]*?<\/pre>/gi, '')  // remove code blocks
    .replace(/<[^>]+>/g, '')                 // strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

export function buildProblemEmbed(problem: LeetCodeProblem): { color: number; title: string; url: string; description: string; fields: { name: string; value: string; inline: boolean }[] } {
  const difficultyColor: Record<Difficulty, number> = {
    Easy: 0x00b8a3,
    Medium: 0xffa116,
    Hard: 0xef4743,
  };

  const tags = problem.topicTags.map((t) => t.name).join(', ') || 'None';

  return {
    color: difficultyColor[problem.difficulty],
    title: `#${problem.questionId} — ${problem.title}`,
    url: problem.url,
    description: stripHtml(problem.content),
    fields: [
      { name: 'Difficulty', value: problem.difficulty, inline: true },
      { name: 'Topics', value: tags, inline: true },
    ],
  };
}

export { logger };
